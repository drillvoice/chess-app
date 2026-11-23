import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useToast } from '@/hooks/use-toast';
import { useLichessConnection } from '@/hooks/use-lichess-connection';
import { playMoveSound } from '@/lib/move-sound';
import type { PromotionPiece, Square } from '@/lib/otb/types';
import type { FocusPuzzle } from '@/lib/focus/lichess-puzzles';
import type { FocusDifficulty } from '@/lib/focus/themes';
import { loadPlayedCache } from '@/lib/focus/played-puzzles';
import {
  isCapture,
  playOpponentReply,
  revealNextMove,
  solverColor,
  startPuzzle,
  submitMove,
  type PuzzleState,
} from '@/lib/focus/puzzle-session';
import type { CampaignNode } from '@/lib/campaign/chapters';
import { fetchTrialPuzzles, REFILL_BELOW } from '@/lib/campaign/trial-puzzles';
import type { MissedPuzzle, MissReason } from '@/lib/campaign/missed-puzzle';

const REPLY_DELAY_MS = 200;
const AFTER_SOLVE_MS = 400;
/** Long enough to see the right move after a miss (the full line is in the review). */
const AFTER_MISS_MS = 1200;

export type RunPhase = 'loading' | 'ready' | 'running' | 'done' | 'error';
export type RunFlash = 'find' | 'correct' | 'solved' | 'missed';

export interface RunTally {
  attempted: number;
  clean: number;
}

/** 'completed' = target reached (completion time is recorded); 'ended' = stopped otherwise. */
export type RunEnd = 'completed' | 'ended' | null;

export interface RunResult extends RunTally {
  startedAt: string;
  durationMs: number;
  completedMs: number | null;
}

interface Options {
  /** Where puzzles come from (a boss node mixes themes). */
  node: CampaignNode;
  difficulty: FocusDifficulty;
  /** Clock length; the run always ends when it runs out. */
  timeLimitMs: number;
  /** Puzzles fetched before the clock starts, and per refill. */
  batchSize: number;
  /** Checked after every puzzle: whether the run is over. */
  endRule: (tally: RunTally) => RunEnd;
  /** `misses` is the run's missed puzzles, for review (not part of the saved result). */
  onFinish: (result: RunResult, misses: MissedPuzzle[]) => void;
}

/**
 * The engine shared by campaign trials and the placement test: fetch puzzles up
 * front, run an active-time clock, check moves, and finish when the end rule or
 * the clock says so. Leaving the app pauses the clock and counts the puzzle on
 * screen as missed, so stepping away can't be used to look a position up.
 */
export function useTimedPuzzleRun({
  node,
  difficulty,
  timeLimitMs,
  batchSize,
  endRule,
  onFinish,
}: Options) {
  const { toast } = useToast();
  const connection = useLichessConnection();

  const [phase, setPhase] = useState<RunPhase>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queue, setQueue] = useState<FocusPuzzle[]>([]);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<PuzzleState | null>(null);
  const [flash, setFlash] = useState<RunFlash>('find');
  const [tally, setTally] = useState<RunTally>({ attempted: 0, clean: 0 });
  /** Puzzles missed this run, in order, for the post-run review. */
  const [misses, setMisses] = useState<MissedPuzzle[]>([]);
  const missesRef = useRef<MissedPuzzle[]>([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(
    null,
  );

  // Refs mirror what timers and visibility handlers need, so they never act on stale state.
  const tallyRef = useRef(tally);
  const queueRef = useRef(queue);
  const indexRef = useRef(index);
  const stateRef = useRef(state);
  const phaseRef = useRef(phase);
  queueRef.current = queue;
  const optionsRef = useRef({ endRule, onFinish, timeLimitMs });
  optionsRef.current = { endRule, onFinish, timeLimitMs };

  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  useEffect(() => clearTimers, []);

  const setPhaseBoth = (next: RunPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const setStateBoth = (next: PuzzleState | null) => {
    stateRef.current = next;
    setState(next);
  };

  // Active clock: paused while the app is hidden.
  const activeMs = useRef(0);
  const runningSince = useRef<number | null>(null);
  const startedAt = useRef(new Date().toISOString());
  const elapsed = () =>
    activeMs.current + (runningSince.current === null ? 0 : Date.now() - runningSince.current);

  // Puzzles never to serve: already in this run, or played on Lichess (cached history).
  const exclude = useRef<Set<string>>(new Set());
  const refilling = useRef<Promise<void> | null>(null);
  const username = connection?.username ?? null;

  const fetchMore = useCallback(
    () =>
      fetchTrialPuzzles(node, difficulty, batchSize, { exclude: exclude.current }).then((fresh) => {
        fresh.forEach((p) => exclude.current.add(p.id));
        return fresh;
      }),
    [node, difficulty, batchSize],
  );

  const load = useCallback(async () => {
    clearTimers();
    setPhaseBoth('loading');
    setLoadError(null);
    setStateBoth(null);
    exclude.current = new Set(username ? loadPlayedCache(username).ids : []);
    try {
      const puzzles = await fetchMore();
      if (puzzles.length === 0) {
        throw new Error('Lichess only sent puzzles you have already played. Try again shortly.');
      }
      setQueue(puzzles);
      queueRef.current = puzzles;
      setPhaseBoth('ready');
    } catch (error) {
      console.error('[campaign] Failed to load puzzles', { node: node.id, error });
      setLoadError(error instanceof Error ? error.message : String(error));
      setPhaseBoth('error');
    }
  }, [fetchMore, node.id, username]);

  useEffect(() => {
    void load();
  }, [load]);

  const refillIfLow = useCallback(() => {
    const remaining = queueRef.current.length - indexRef.current - 1;
    if (remaining >= REFILL_BELOW || refilling.current) return;
    refilling.current = fetchMore()
      .then((more) => {
        queueRef.current = [...queueRef.current, ...more];
        setQueue(queueRef.current);
      })
      .catch((error) => {
        // Not fatal yet: the queue still has puzzles. It surfaces if the queue runs dry.
        console.warn('[campaign] Puzzle refill failed', { node: node.id, error });
      })
      .finally(() => {
        refilling.current = null;
      });
  }, [fetchMore, node.id]);

  /** End the run; `endedAtMs` pins the time to when the deciding puzzle finished. */
  const finish = useCallback((completed: boolean, endedAtMs?: number) => {
    if (phaseRef.current !== 'running') return;
    clearTimers();
    const durationMs = Math.min(endedAtMs ?? elapsed(), optionsRef.current.timeLimitMs);
    activeMs.current = durationMs;
    runningSince.current = null;
    setPhaseBoth('done');
    setSelected(null);
    optionsRef.current.onFinish(
      {
        startedAt: startedAt.current,
        durationMs,
        ...tallyRef.current,
        completedMs: completed ? durationMs : null,
      },
      missesRef.current,
    );
  }, []);

  const showAt = useCallback(
    (i: number) => {
      const puzzle = queueRef.current[i];
      if (!puzzle) return false;
      indexRef.current = i;
      setIndex(i);
      setStateBoth(startPuzzle(puzzle));
      setFlash('find');
      setSelected(null);
      refillIfLow();
      return true;
    },
    [refillIfLow],
  );

  const advance = useCallback(async () => {
    if (phaseRef.current !== 'running') return;
    const nextIndex = indexRef.current + 1;
    if (showAt(nextIndex)) return;
    // Queue ran dry: wait for the refill in flight (or start one) before giving up.
    setStateBoth(null);
    refillIfLow();
    await refilling.current;
    if (phaseRef.current !== 'running') return;
    if (!showAt(nextIndex)) {
      toast({
        title: 'Ran out of puzzles',
        description: 'Lichess didn’t send more puzzles in time. This run ends here.',
        variant: 'destructive',
      });
      finish(false);
    }
  }, [showAt, refillIfLow, finish, toast]);

  /** Count a finished puzzle; returns true if that ended the run. */
  const record = useCallback(
    (clean: boolean) => {
      const next = {
        attempted: tallyRef.current.attempted + 1,
        clean: tallyRef.current.clean + (clean ? 1 : 0),
      };
      tallyRef.current = next;
      setTally(next);
      const end = optionsRef.current.endRule(next);
      if (end) {
        // Stop the clock now, but let the final position show for a moment first.
        const endedAt = elapsed();
        if (runningSince.current !== null) {
          activeMs.current = endedAt;
          runningSince.current = null;
        }
        later(() => finish(end === 'completed', endedAt), clean ? AFTER_SOLVE_MS : AFTER_MISS_MS);
        return true;
      }
      return false;
    },
    [finish],
  );

  const start = () => {
    startedAt.current = new Date().toISOString();
    activeMs.current = 0;
    runningSince.current = Date.now();
    tallyRef.current = { attempted: 0, clean: 0 };
    setTally(tallyRef.current);
    missesRef.current = [];
    setMisses([]);
    setPhaseBoth('running');
    showAt(0);
  };

  /** Count the puzzle on screen as missed, show the right move, then move on. */
  const miss = useCallback(
    (delayMs: number, reason: MissReason, wrongMove: string | null = null) => {
      const current = stateRef.current;
      if (!current || current.status !== 'playing' || phaseRef.current !== 'running') return;
      clearTimers();
      const missed: MissedPuzzle = {
        puzzle: current.puzzle,
        ply: current.ply,
        wrongMove,
        reason,
      };
      missesRef.current = [...missesRef.current, missed];
      setMisses(missesRef.current);
      setStateBoth(revealNextMove({ ...current, mistake: true }));
      setFlash('missed');
      setSelected(null);
      if (record(false)) return;
      if (delayMs > 0) later(() => void advance(), delayMs);
      else void advance();
    },
    [record, advance],
  );

  // Clock tick: re-render the countdown and end the run when time is up.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (elapsed() >= optionsRef.current.timeLimitMs) finish(false);
    }, 250);
    return () => clearInterval(id);
  }, [phase, finish]);

  useEffect(() => {
    const onVisibility = () => {
      if (phaseRef.current !== 'running') return;
      if (document.visibilityState === 'hidden') {
        if (runningSince.current !== null) {
          activeMs.current += Date.now() - runningSince.current;
          runningSince.current = null;
        }
        return;
      }
      if (runningSince.current !== null) return;
      runningSince.current = Date.now();
      if (stateRef.current?.status === 'playing') {
        toast({
          title: 'Clock paused while you were away',
          description: 'The puzzle on screen counts as missed.',
        });
        miss(0, 'away');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [miss, toast]);

  const tryMove = (from: Square, to: Square, promotion?: PromotionPiece) => {
    const current = stateRef.current;
    if (!current || current.status !== 'playing' || phaseRef.current !== 'running') return;
    const uci = `${from}${to}${promotion ?? ''}`;
    const { state: next, verdict } = submitMove(current, uci);
    setSelected(null);
    if (verdict === 'illegal') return;
    if (verdict === 'wrong') {
      miss(AFTER_MISS_MS, 'wrong', uci);
      return;
    }
    playMoveSound(isCapture(current.fen, uci) ? 'capture' : 'move');
    setStateBoth(next);
    if (verdict === 'solved') {
      setFlash('solved');
      if (!record(true)) later(() => void advance(), AFTER_SOLVE_MS);
      return;
    }
    setFlash('correct');
    later(() => {
      const reply = next.puzzle.solution[next.ply];
      setStateBoth(playOpponentReply(next));
      if (reply) playMoveSound(isCapture(next.fen, reply) ? 'capture' : 'move');
    }, REPLY_DELAY_MS);
  };

  const chess = useMemo(() => (state ? new Chess(state.fen) : null), [state]);
  const myColor = state ? solverColor(state.puzzle) : 'w';
  const myTurn =
    phase === 'running' && !!state && state.status === 'playing' && chess?.turn() === myColor;
  const legalTargets = useMemo<Square[]>(() => {
    if (!chess || !selected || !myTurn) return [];
    return chess.moves({ square: selected, verbose: true }).map((m) => m.to as Square);
  }, [chess, selected, myTurn]);

  const onSquareTap = (square: Square) => {
    if (!chess || !myTurn) return;
    if (selected && legalTargets.includes(square)) {
      const needsPromotion = chess
        .moves({ square: selected, verbose: true })
        .some((m) => m.to === square && m.promotion);
      if (needsPromotion) setPendingPromotion({ from: selected, to: square });
      else tryMove(selected, square);
      return;
    }
    const piece = chess.get(square);
    setSelected(piece && piece.color === myColor ? square : null);
  };

  /** Stop without finishing (nothing is reported). */
  const abort = () => {
    clearTimers();
    runningSince.current = null;
    setPhaseBoth('done');
  };

  return {
    phase,
    loadError,
    load,
    start,
    abort,
    state,
    flash,
    tally,
    index,
    remainingMs: Math.max(0, timeLimitMs - elapsed()),
    myColor,
    selected,
    legalTargets,
    onSquareTap,
    misses,
    skip: () => miss(0, 'skipped'),
    pendingPromotion,
    choosePromotion: (piece: PromotionPiece) => {
      if (pendingPromotion) tryMove(pendingPromotion.from, pendingPromotion.to, piece);
      setPendingPromotion(null);
    },
    cancelPromotion: () => setPendingPromotion(null),
  };
}

export type TimedPuzzleRun = ReturnType<typeof useTimedPuzzleRun>;
