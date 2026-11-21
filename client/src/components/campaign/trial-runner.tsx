import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { nanoid } from 'nanoid';
import { ArrowLeft, Clock, Loader2, RotateCcw, SkipForward, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import OtbBoard from '@/components/otb/otb-board';
import PromotionPicker from '@/components/otb/promotion-picker';
import type { PieceView } from '@/lib/otb/chess';
import type { PromotionPiece, Square } from '@/lib/otb/types';
import { playMoveSound } from '@/lib/move-sound';
import type { FocusPuzzle } from '@/lib/focus/lichess-puzzles';
import { loadPlayedCache } from '@/lib/focus/played-puzzles';
import { formatDuration } from '@/lib/focus/format-duration';
import { getThemeLabel } from '@/lib/focus/themes';
import {
  isCapture,
  playOpponentReply,
  revealSolution,
  solverColor,
  startPuzzle,
  submitMove,
  type PuzzleState,
} from '@/lib/focus/puzzle-session';
import { useLichessConnection } from '@/hooks/use-lichess-connection';
import { chapterLevel, type CampaignChapter, type CampaignNode } from '@/lib/campaign/chapters';
import { fetchTrialPuzzles, INITIAL_PUZZLES, REFILL_BELOW } from '@/lib/campaign/trial-puzzles';
import {
  BOSS_CLEAR_STARS,
  isTrialOver,
  starsFor,
  TRIAL_MS,
  TRIAL_TARGET,
  trialPace,
  type Stars,
} from '@/lib/campaign/trial-rules';
import type { CampaignAttempt } from '@/lib/campaign/attempts';
import type { NodeProgress } from '@/lib/campaign/progress';
import { saveCampaignAttempt } from '@/lib/firebase/campaign';
import { CAMPAIGN_QUERY_KEY } from '@/hooks/use-campaign';
import { StarRow } from './star-row';

const REPLY_DELAY_MS = 200;
const AFTER_SOLVE_MS = 400;
/** Long enough to see the right move after a miss. */
const AFTER_MISS_MS = 1200;

type Phase = 'loading' | 'ready' | 'running' | 'done' | 'error';
type Flash = 'find' | 'correct' | 'solved' | 'missed';

function pieceMapFromFen(fen: string): Record<string, PieceView> {
  const map: Record<string, PieceView> = {};
  for (const row of new Chess(fen).board()) {
    for (const cell of row) {
      if (cell) map[cell.square] = { color: cell.color, type: cell.type };
    }
  }
  return map;
}

interface Props {
  chapter: CampaignChapter;
  /** A boss node carries an intro line. */
  node: CampaignNode & { intro?: string };
  previous: NodeProgress;
  onExit: () => void;
}

export default function TrialRunner({ chapter, node, previous, onExit }: Props) {
  const { toast } = useToast();
  const level = chapterLevel(chapter);
  const connection = useLichessConnection();
  const isBoss = node.kind === 'boss';

  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queue, setQueue] = useState<FocusPuzzle[]>([]);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<PuzzleState | null>(null);
  const [flash, setFlash] = useState<Flash>('find');
  const [tally, setTally] = useState({ attempted: 0, clean: 0 });
  const [result, setResult] = useState<CampaignAttempt | null>(null);
  const [saving, setSaving] = useState(false);
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
  tallyRef.current = tally;
  queueRef.current = queue;
  indexRef.current = index;
  stateRef.current = state;
  phaseRef.current = phase;

  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  useEffect(() => clearTimers, []);

  // Active clock: paused while the app is hidden.
  const activeMs = useRef(0);
  const runningSince = useRef<number | null>(null);
  const startedAt = useRef<string>(new Date().toISOString());
  const elapsed = () =>
    activeMs.current + (runningSince.current === null ? 0 : Date.now() - runningSince.current);

  // Puzzles never to serve: already in this trial, or played on Lichess (cached history).
  const exclude = useRef<Set<string>>(new Set());
  const refilling = useRef<Promise<void> | null>(null);

  const fetchMore = useCallback(
    (count: number) =>
      fetchTrialPuzzles(node, level.difficulty, count, { exclude: exclude.current }).then(
        (fresh) => {
          fresh.forEach((p) => exclude.current.add(p.id));
          return fresh;
        },
      ),
    [node, level.difficulty],
  );

  const load = useCallback(async () => {
    setPhase('loading');
    setLoadError(null);
    exclude.current = new Set(connection ? loadPlayedCache(connection.username).ids : []);
    try {
      const puzzles = await fetchMore(INITIAL_PUZZLES);
      if (puzzles.length === 0) {
        throw new Error('Lichess only sent puzzles you have already played. Try again shortly.');
      }
      setQueue(puzzles);
      setPhase('ready');
    } catch (error) {
      console.error('[campaign] Failed to load trial puzzles', { node: node.id, error });
      setLoadError(error instanceof Error ? error.message : String(error));
      setPhase('error');
    }
    // connection is read once per load on purpose: the played cache is a snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMore, node.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const refillIfLow = useCallback(() => {
    const remaining = queueRef.current.length - indexRef.current - 1;
    if (remaining >= REFILL_BELOW || refilling.current) return;
    refilling.current = fetchMore(INITIAL_PUZZLES)
      .then((more) => setQueue((q) => [...q, ...more]))
      .catch((error) => {
        // Not fatal yet: the queue still has puzzles. It surfaces if the queue runs dry.
        console.warn('[campaign] Trial refill failed', { node: node.id, error });
      })
      .finally(() => {
        refilling.current = null;
      });
  }, [fetchMore, node.id]);

  const finish = useCallback(
    async (completedMs: number | null) => {
      if (phaseRef.current === 'done') return;
      clearTimers();
      const durationMs = Math.min(elapsed(), TRIAL_MS);
      activeMs.current = durationMs;
      runningSince.current = null;
      phaseRef.current = 'done';
      setPhase('done');
      setSelected(null);
      const attempt: CampaignAttempt = {
        id: nanoid(),
        nodeId: node.id,
        startedAt: startedAt.current,
        durationMs,
        attempted: tallyRef.current.attempted,
        clean: tallyRef.current.clean,
        completedMs,
      };
      setResult(attempt);
      setSaving(true);
      try {
        await saveCampaignAttempt(attempt);
        queryClient.invalidateQueries({ queryKey: CAMPAIGN_QUERY_KEY });
      } catch (error) {
        console.error('[campaign] Failed to save trial attempt', { attempt, error });
        toast({
          title: 'Could not save this trial',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }
      if (attempt.attempted > 0) {
        try {
          const { createSession } = await import('@/lib/firebase');
          const stars = starsFor(attempt);
          await createSession({
            type: 'tactics',
            date: new Date(attempt.startedAt),
            duration: Math.max(1, Math.round(durationMs / 60000)),
            puzzlesAttempted: attempt.attempted,
            puzzlesCorrect: attempt.clean,
            tacticsNotes: `Campaign trial: ${node.title} (${level.label}) — ${attempt.clean} clean in ${formatDuration(
              completedMs ?? durationMs,
            )}, ${stars}/3 stars`,
          });
          ['sessions', 'statistics', 'weekly-goal', 'weekly-activity'].forEach((key) =>
            queryClient.invalidateQueries({ queryKey: [key] }),
          );
        } catch (error) {
          console.error('[campaign] Trial saved but tactics session not logged', { error });
          toast({
            title: 'Trial saved, but not logged as a tactics session',
            description: error instanceof Error ? error.message : String(error),
            variant: 'destructive',
          });
        }
      }
      setSaving(false);
    },

    [node.id, node.title, level.label, toast],
  );

  const showAt = useCallback(
    (i: number) => {
      const puzzle = queueRef.current[i];
      if (!puzzle) return false;
      indexRef.current = i;
      setIndex(i);
      const next = startPuzzle(puzzle);
      stateRef.current = next;
      setState(next);
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
    stateRef.current = null;
    setState(null);
    refillIfLow();
    await refilling.current;
    if (phaseRef.current !== 'running') return;
    if (!showAt(nextIndex)) {
      toast({
        title: 'Ran out of puzzles',
        description: 'Lichess didn’t send more puzzles in time. The trial ends here.',
        variant: 'destructive',
      });
      void finish(null);
    }
  }, [showAt, refillIfLow, finish, toast]);

  const record = useCallback(
    (clean: boolean) => {
      const next = {
        attempted: tallyRef.current.attempted + 1,
        clean: tallyRef.current.clean + (clean ? 1 : 0),
      };
      tallyRef.current = next;
      setTally(next);
      if (next.clean >= TRIAL_TARGET) {
        void finish(elapsed());
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
    phaseRef.current = 'running';
    setPhase('running');
    showAt(0);
  };

  const miss = useCallback(
    (delayMs: number) => {
      const current = stateRef.current;
      if (!current || current.status !== 'playing') return;
      clearTimers();
      const revealed = revealSolution({ ...current, mistake: true });
      stateRef.current = revealed;
      setState(revealed);
      setFlash('missed');
      setSelected(null);
      if (record(false)) return;
      if (delayMs > 0) later(() => void advance(), delayMs);
      else void advance();
    },

    [record, advance],
  );

  // Clock tick: re-render the countdown and end the trial when time is up.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (isTrialOver(tallyRef.current.clean, elapsed())) void finish(null);
    }, 250);
    return () => clearInterval(id);
  }, [phase, finish]);

  // Leaving the app pauses the clock, and the puzzle on screen counts as missed on
  // return, so stepping away can't be used to look a position up.
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
        miss(0);
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
      miss(AFTER_MISS_MS);
      return;
    }
    playMoveSound(isCapture(current.fen, uci) ? 'capture' : 'move');
    stateRef.current = next;
    setState(next);
    if (verdict === 'solved') {
      setFlash('solved');
      if (!record(true)) later(() => void advance(), AFTER_SOLVE_MS);
      return;
    }
    setFlash('correct');
    later(() => {
      const reply = next.puzzle.solution[next.ply];
      const replied = playOpponentReply(next);
      stateRef.current = replied;
      setState(replied);
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

  const abandon = () => {
    if (
      phase === 'running' &&
      !window.confirm('Abandon this trial? It won’t be saved or count toward your progress.')
    ) {
      return;
    }
    clearTimers();
    phaseRef.current = 'done';
    onExit();
  };

  const retry = () => {
    clearTimers();
    setResult(null);
    setIndex(0);
    setState(null);
    void load();
  };

  const remainingMs = Math.max(0, TRIAL_MS - elapsed());
  const sideName = myColor === 'w' ? 'White' : 'Black';
  const flashText: Record<Flash, string> = {
    find: isBoss ? `${sideName} to move — find the tactic.` : `${sideName} to move.`,
    correct: 'Correct — keep going.',
    solved: 'Solved!',
    missed: 'Missed — here’s the line.',
  };
  const flashColor: Record<Flash, string> = {
    find: 'text-gray-700',
    correct: 'text-green-700',
    solved: 'text-green-700',
    missed: 'text-red-600',
  };

  const header = (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={abandon} className="-ml-2">
        <ArrowLeft className="mr-1 h-4 w-4" /> Campaign
      </Button>
      <div className="min-w-0 text-sm text-gray-500">
        Chapter {chapter.number} · {level.label}
      </div>
    </div>
  );

  if (phase === 'loading' || phase === 'error' || phase === 'ready') {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        {header}
        <Card>
          <CardContent className="space-y-4 p-5 pt-5 md:p-5 md:pt-5">
            <div className="flex items-center gap-2">
              {isBoss && <Swords className="h-5 w-5 text-amber-600" />}
              <h1 className="text-xl font-bold text-gray-900">{node.title}</h1>
            </div>
            {node.intro && <p className="text-sm text-gray-600">{node.intro}</p>}
            <ul className="space-y-1 text-sm text-gray-700">
              <li>
                Solve <strong>{TRIAL_TARGET}</strong> puzzles in{' '}
                <strong>{formatDuration(TRIAL_MS)}</strong>. Any wrong move or skip counts as a miss
                and moves on.
              </li>
              <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <StarRow stars={1} size="sm" /> 6 solved
                </span>
                <span className="inline-flex items-center gap-1">
                  <StarRow stars={2} size="sm" /> 10 in 5:00
                </span>
                <span className="inline-flex items-center gap-1">
                  <StarRow stars={3} size="sm" /> 10 in 3:00
                </span>
              </li>
              <li>
                {isBoss
                  ? `Beat the boss with ${BOSS_CLEAR_STARS} stars to unlock the next chapter.`
                  : 'One star clears this node and opens the next one.'}
              </li>
              <li className="text-gray-500">
                Leaving the app pauses the clock, but the puzzle on screen counts as missed.
              </li>
            </ul>
            {previous.attempts > 0 && (
              <p className="text-sm text-gray-600">
                Your best: <StarRow stars={previous.bestStars} size="sm" /> · pace{' '}
                {previous.bestPace?.toFixed(1)} per 5 min · {previous.attempts} attempt
                {previous.attempts === 1 ? '' : 's'}
              </p>
            )}
            {phase === 'error' ? (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-red-600">
                  {loadError}
                </p>
                <Button onClick={() => void load()}>Try again</Button>
              </div>
            ) : (
              <Button onClick={start} disabled={phase === 'loading'} className="w-full" size="lg">
                {phase === 'loading' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading puzzles…
                  </>
                ) : (
                  'Start the clock'
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === 'done' && result) {
    const stars = starsFor(result) as Stars;
    const pace = trialPace(result);
    const newBest =
      previous.attempts > 0 &&
      (stars > previous.bestStars || (previous.bestPace !== null && pace > previous.bestPace));
    const bossBeaten = isBoss && stars >= BOSS_CLEAR_STARS;
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        {header}
        <Card>
          <CardContent className="space-y-4 p-5 pt-5 text-center md:p-5 md:pt-5">
            <h1 className="text-xl font-bold text-gray-900">
              {isBoss ? (bossBeaten ? 'Boss beaten!' : 'The boss holds') : node.title}
            </h1>
            <div className="flex justify-center">
              <StarRow stars={stars} size="lg" />
            </div>
            <p className="text-lg text-gray-800">
              <strong>{result.clean}</strong> solved of {result.attempted} ·{' '}
              {result.completedMs !== null
                ? `target hit in ${formatDuration(result.completedMs)}`
                : 'time up'}
            </p>
            <p className="text-sm text-gray-600">
              Pace: <strong>{pace.toFixed(1)}</strong> per 5 min
              {newBest && <span className="ml-2 font-semibold text-green-700">New best!</span>}
            </p>
            {isBoss && !bossBeaten && (
              <p className="text-sm text-gray-600">
                You need {TRIAL_TARGET} solved within {formatDuration(TRIAL_MS)} to beat the boss.
              </p>
            )}
            {saving && (
              <p className="text-xs text-gray-500">
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Saving…
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={retry} disabled={saving}>
                <RotateCcw className="mr-2 h-4 w-4" /> Try again
              </Button>
              <Button onClick={onExit} disabled={saving}>
                Back to campaign
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const lastMoveSquares = state?.lastMove
    ? ([state.lastMove.slice(0, 2), state.lastMove.slice(2, 4)] as Square[])
    : [];

  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-4">
      {header}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {state ? (
          <OtbBoard
            pieceMap={pieceMapFromFen(state.fen)}
            selectedSquare={selected}
            legalTargets={legalTargets}
            isFlipped={myColor === 'b'}
            isTableMode={false}
            onSquareTap={onSquareTap}
            highlightSquares={lastMoveSquares}
          />
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-lg bg-gray-100">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        )}
        <Card>
          <CardContent className="space-y-4 p-4 pt-4 md:p-4 md:pt-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-gray-900">{node.title}</h1>
              <span
                className={`inline-flex items-center gap-1 text-2xl font-bold tabular-nums ${
                  remainingMs < 30_000 ? 'text-red-600' : 'text-gray-900'
                }`}
                aria-label="Time left"
              >
                <Clock className="h-5 w-5" />
                {formatDuration(remainingMs)}
              </span>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-sm text-gray-600">
                <span>
                  Solved <strong className="text-gray-900">{tally.clean}</strong> / {TRIAL_TARGET}
                </span>
                <span>{tally.attempted - tally.clean} missed</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-gray-200"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={TRIAL_TARGET}
                aria-valuenow={tally.clean}
              >
                <div
                  className="h-full bg-green-600 transition-all"
                  style={{ width: `${(tally.clean / TRIAL_TARGET) * 100}%` }}
                />
              </div>
            </div>
            <p className={`text-lg font-semibold ${flashColor[flash]}`} aria-live="polite">
              {flashText[flash]}
            </p>
            {isBoss && state && state.status !== 'playing' && (
              <p className="text-sm text-gray-500">
                Theme:{' '}
                {state.puzzle.themes
                  .filter((t) => node.themes.includes(t))
                  .map(getThemeLabel)
                  .join(', ') || '—'}
              </p>
            )}
            <div className="text-xs text-gray-500">
              Puzzle {index + 1}
              {state?.puzzle.rating != null && ` · rated ${state.puzzle.rating}`}
            </div>
            <Button
              variant="outline"
              onClick={() => miss(0)}
              disabled={!state || state.status !== 'playing'}
            >
              <SkipForward className="mr-2 h-4 w-4" /> Skip (counts as a miss)
            </Button>
          </CardContent>
        </Card>
      </div>
      <PromotionPicker
        open={pendingPromotion !== null}
        onSelect={(piece) => {
          if (pendingPromotion) tryMove(pendingPromotion.from, pendingPromotion.to, piece);
          setPendingPromotion(null);
        }}
        onCancel={() => setPendingPromotion(null)}
      />
    </div>
  );
}
