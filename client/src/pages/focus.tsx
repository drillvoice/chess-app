import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  Clock,
  ExternalLink,
  Eye,
  Loader2,
  SkipForward,
  Target,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  isMoveSoundEnabled,
  playMoveSound,
  setMoveSoundEnabled,
  subscribeMoveSoundPref,
} from '@/lib/move-sound';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import OtbBoard from '@/components/otb/otb-board';
import PromotionPicker from '@/components/otb/promotion-picker';
import type { PieceView } from '@/lib/otb/chess';
import type { PromotionPiece, Square } from '@/lib/otb/types';
import {
  fetchFocusPuzzles,
  LichessUnauthorizedError,
  submitPuzzleResults,
  type FocusPuzzle,
  type PuzzleResult,
} from '@/lib/focus/lichess-puzzles';
import { handleLichessUnauthorized } from '@/lib/lichess-auth';
import { syncPlayedPuzzles } from '@/lib/focus/played-puzzles';
import { formatDuration } from '@/lib/focus/format-duration';
import {
  clearFocusSession,
  loadFocusSession,
  saveFocusSession,
  type Feedback,
} from '@/lib/focus/session-store';
import { useLichessConnection } from '@/hooks/use-lichess-connection';
import LichessAccountConnect from '@/components/lichess-account-connect';
import {
  isCapture,
  playOpponentReply,
  revealSolution,
  solutionSan,
  solverColor,
  startPuzzle,
  submitMove,
  type PuzzleState,
} from '@/lib/focus/puzzle-session';
import {
  DEFAULT_LEVEL_KEY,
  FOCUS_LEVELS,
  getLevel,
  FOCUS_THEMES,
  getThemeLabel,
} from '@/lib/focus/themes';

const BATCH_SIZE = 20;
const PREFS_KEY = 'focus-practice-prefs';
// Long enough to see your own move land, short enough not to hold up the next one.
const REPLY_DELAY_MS = 200;

interface Tally {
  attempted: number;
  clean: number;
}

interface FocusPrefs {
  theme: string;
  levelKey: string;
  rated: boolean;
}

const LEGACY_DIFFICULTIES = ['easiest', 'easier', 'normal', 'harder', 'hardest'];

function loadPrefs(): FocusPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    const theme = FOCUS_THEMES.some((t) => t.key === parsed.theme) ? parsed.theme : 'pin';
    // Earlier versions stored a bare `difficulty`; map it onto the fixed level of the same name.
    const levelKey =
      typeof parsed.levelKey === 'string'
        ? getLevel(parsed.levelKey).key
        : LEGACY_DIFFICULTIES.includes(parsed.difficulty)
          ? `fixed-${parsed.difficulty}`
          : DEFAULT_LEVEL_KEY;
    return { theme, levelKey, rated: parsed.rated === true };
  } catch {
    return { theme: 'pin', levelKey: DEFAULT_LEVEL_KEY, rated: false };
  }
}

function savePrefs(prefs: FocusPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Remembering the last choices is a convenience only.
  }
}

function pieceMapFromFen(fen: string): Record<string, PieceView> {
  const map: Record<string, PieceView> = {};
  for (const row of new Chess(fen).board()) {
    for (const cell of row) {
      if (cell) map[cell.square] = { color: cell.color, type: cell.type };
    }
  }
  return map;
}

const GROUPS = ['Motifs', 'Mates', 'Phases', 'Goals'] as const;

function LevelOptions({ showRelative }: { showRelative: boolean }) {
  return (
    <SelectContent>
      <SelectGroup>
        <SelectLabel>Fixed rating</SelectLabel>
        {FOCUS_LEVELS.filter((l) => !l.relative).map((l) => (
          <SelectItem key={l.key} value={l.key}>
            {l.label}
          </SelectItem>
        ))}
      </SelectGroup>
      {showRelative && (
        <SelectGroup>
          <SelectLabel>Relative to my Lichess rating</SelectLabel>
          {FOCUS_LEVELS.filter((l) => l.relative).map((l) => (
            <SelectItem key={l.key} value={l.key}>
              {l.label}
            </SelectItem>
          ))}
        </SelectGroup>
      )}
    </SelectContent>
  );
}

export default function FocusPage() {
  const { toast } = useToast();
  const initialPrefs = useMemo(loadPrefs, []);
  // A session saved before the phone unloaded the app, or before navigating away.
  const resumed = useMemo(() => loadFocusSession(), []);
  const [theme, setTheme] = useState(resumed?.theme ?? initialPrefs.theme);
  const [levelKey, setLevelKey] = useState(resumed?.levelKey ?? initialPrefs.levelKey);
  const [rated, setRated] = useState(initialPrefs.rated);

  const [queue, setQueue] = useState<FocusPuzzle[]>(resumed?.queue ?? []);
  const [index, setIndex] = useState(resumed?.index ?? 0);
  const [state, setState] = useState<PuzzleState | null>(resumed?.state ?? null);
  const [feedback, setFeedback] = useState<Feedback>(resumed?.feedback ?? 'find');
  const [tally, setTally] = useState<Tally>(resumed?.tally ?? { attempted: 0, clean: 0 });
  // Session time counts only while the app is visible, so time in other apps isn't logged.
  const activeMs = useRef(resumed?.activeMs ?? 0);
  const visibleSince = useRef<number | null>(resumed ? Date.now() : null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);

  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(
    null,
  );
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenIds = useRef(new Set<string>(resumed?.seenIds ?? []));

  const connection = useLichessConnection();
  const token = connection?.accessToken ?? null;
  // A relative level only makes sense with an account; fall back to the default without one.
  const level = getLevel(!token && getLevel(levelKey).relative ? DEFAULT_LEVEL_KEY : levelKey);
  // Results not yet accepted by Lichess, grouped by theme + rated (one POST per group).
  const pendingResults = useRef(new Map<string, PuzzleResult[]>(resumed?.pendingResults ?? []));
  // Puzzles already played on Lichess, filled in the background (see syncPlayedPuzzles).
  // Fixed levels are fetched anonymously, so this replaces Lichess's unseen-only filter.
  const playedIds = useRef(new Set<string>());
  // Levels used this session, for the logged session's notes.
  const [levelsUsed, setLevelsUsed] = useState<string[]>(resumed?.levelsUsed ?? []);
  // Shown after a mid-puzzle level change, until the next puzzle appears.
  const [levelChangePending, setLevelChangePending] = useState(false);
  const [puzzleNumber, setPuzzleNumber] = useState(resumed?.puzzleNumber ?? 0);
  const [lichessRating, setLichessRating] = useState<number | null>(null);
  const [ratingDiffs, setRatingDiffs] = useState<Record<string, number>>({});
  const [resultSyncError, setResultSyncError] = useState<string | null>(null);

  const onUnauthorized = useCallback(() => {
    handleLichessUnauthorized();
    pendingResults.current.clear();
    toast({
      title: 'Lichess disconnected',
      description: new LichessUnauthorizedError().message,
      variant: 'destructive',
    });
  }, [toast]);

  const username = connection?.username ?? null;
  useEffect(() => {
    playedIds.current = new Set();
    if (!token || !username) return;
    // Never block practice on this: Lichess streams history at 20 entries/second.
    const controller = new AbortController();
    syncPlayedPuzzles({
      token,
      username,
      signal: controller.signal,
      onIds: (ids) => ids.forEach((id) => playedIds.current.add(id)),
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error instanceof LichessUnauthorizedError) {
        onUnauthorized();
        return;
      }
      console.warn('[Focus] Could not sync Lichess puzzle history; repeats possible', {
        username,
        error,
      });
    });
    return () => controller.abort();
  }, [token, username, onUnauthorized]);

  /** Send any queued results to Lichess. Best effort: failures stay queued for the next try. */
  const flushResults = useCallback(async () => {
    if (!token) return;
    for (const [groupKey, results] of Array.from(pendingResults.current)) {
      if (results.length === 0) continue;
      const [resultTheme, ratedFlag] = groupKey.split('|');
      try {
        const response = await submitPuzzleResults(
          resultTheme,
          results,
          token,
          ratedFlag === 'rated',
        );
        const sent = new Set(results.map((r) => r.id));
        const remaining = (pendingResults.current.get(groupKey) ?? []).filter(
          (r) => !sent.has(r.id),
        );
        pendingResults.current.set(groupKey, remaining);
        saveSession.current();
        setRatingDiffs((d) => ({ ...d, ...response.ratingDiffs }));
        if (response.rating !== null) setLichessRating(response.rating);
        setResultSyncError(null);
      } catch (error) {
        if (error instanceof LichessUnauthorizedError) {
          onUnauthorized();
          return;
        }
        console.error('[Focus] Failed to send puzzle results to Lichess', {
          theme: resultTheme,
          count: results.length,
          error,
        });
        setResultSyncError(
          `Couldn't send ${results.length} result(s) to Lichess — will retry. ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }, [token, onUnauthorized]);

  const recordOnLichess = (puzzleId: string, win: boolean) => {
    if (!token) return;
    const groupKey = `${theme}|${rated ? 'rated' : 'casual'}`;
    const list = pendingResults.current.get(groupKey) ?? [];
    pendingResults.current.set(groupKey, [...list, { id: puzzleId, win }]);
    void flushResults();
  };

  // Send results a previous visit couldn't (e.g. the app was unloaded mid-request).
  useEffect(() => {
    void flushResults();
  }, [flushResults]);

  const elapsedActiveMs = () =>
    activeMs.current + (visibleSince.current === null ? 0 : Date.now() - visibleSince.current);

  // Re-render once a second so the session clock ticks. It reads elapsedActiveMs, so it
  // matches the logged duration and stands still while the app is in the background.
  const [, setClockTick] = useState(0);
  const sessionActive = state !== null;
  useEffect(() => {
    if (!sessionActive) return;
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [sessionActive]);

  // Always points at the latest state, so pagehide/visibility handlers save current values.
  const saveSession = useRef<() => void>(() => {});
  saveSession.current = () => {
    if (!state) return;
    saveFocusSession({
      theme,
      levelKey: level.key,
      queue,
      index,
      state,
      feedback,
      tally,
      activeMs: elapsedActiveMs(),
      levelsUsed,
      puzzleNumber,
      seenIds: Array.from(seenIds.current),
      pendingResults: Array.from(pendingResults.current).filter(([, r]) => r.length > 0),
    });
  };

  useEffect(() => {
    saveSession.current();
  }, [state, queue, index, feedback, tally, levelsUsed, puzzleNumber, theme, levelKey]);

  useEffect(() => {
    // Phones unload backgrounded apps without warning; hidden/pagehide is the last
    // reliable moment to save. Pause the session clock while away.
    const onHide = () => {
      if (visibleSince.current !== null) {
        activeMs.current += Date.now() - visibleSince.current;
        visibleSince.current = null;
      }
      saveSession.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
      else if (visibleSince.current === null && activeMs.current > 0)
        visibleSince.current = Date.now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      // Navigating to another tab in the app unmounts this page: save on the way out.
      saveSession.current();
    };
  }, []);

  useEffect(() => {
    if (resumed) {
      toast({
        title: `Resumed your ${getThemeLabel(resumed.theme)} practice`,
        description: `${resumed.tally.clean}/${resumed.tally.attempted} solved first try so far`,
      });
    }
  }, [resumed, toast]);

  useEffect(() => () => clearTimeout(replyTimer.current ?? undefined), []);

  const loadBatch = useCallback(
    async (append: boolean) => {
      setLoading(true);
      setLoadError(null);
      try {
        const fetchToken = level.relative ? token : null;
        // Two tries at most: an anonymous batch costs Lichess's rate limit one point per puzzle.
        for (let attempt = 0; attempt < 2; attempt++) {
          const batch = await fetchFocusPuzzles(theme, level.difficulty, BATCH_SIZE, {
            token: fetchToken,
          });
          const fresh = batch.filter(
            (p) => !seenIds.current.has(p.id) && !playedIds.current.has(p.id),
          );
          fresh.forEach((p) => seenIds.current.add(p.id));
          if (fresh.length > 0) return fresh;
        }
        throw new Error(
          'Lichess kept sending puzzles you have already played. Try another theme or level.',
        );
      } catch (error) {
        if (error instanceof LichessUnauthorizedError) onUnauthorized();
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Focus] Failed to load puzzles', { theme, level: level.key, append, error });
        setLoadError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [theme, level, token, onUnauthorized],
  );

  const showPuzzle = useCallback((puzzle: FocusPuzzle) => {
    clearTimeout(replyTimer.current ?? undefined);
    setState(startPuzzle(puzzle));
    setPuzzleNumber((n) => n + 1);
    setLevelChangePending(false);
    setFeedback('find');
    setSelected(null);
  }, []);

  const startSet = async () => {
    savePrefs({ theme, levelKey: level.key, rated });
    seenIds.current = new Set();
    const batch = await loadBatch(false);
    if (!batch) return;
    setQueue(batch);
    setIndex(0);
    setTally({ attempted: 0, clean: 0 });
    setLevelsUsed([level.label]);
    setPuzzleNumber(0);
    activeMs.current = 0;
    visibleSince.current = Date.now();
    showPuzzle(batch[0]);
  };

  const finishPuzzle = (finalState: PuzzleState, sendToLichess = true) => {
    const win = finalState.status === 'solved' && !finalState.mistake;
    if (sendToLichess) recordOnLichess(finalState.puzzle.id, win);
    setTally((t) => ({
      attempted: t.attempted + 1,
      clean: t.clean + (finalState.status === 'solved' && !finalState.mistake ? 1 : 0),
    }));
  };

  const nextPuzzle = async () => {
    // A puzzle skipped mid-solve still counts as attempted (and missed).
    // Only tell Lichess if a move was actually tried; an untouched skip isn't a loss there.
    if (state?.status === 'playing') {
      finishPuzzle({ ...state, mistake: true }, state.ply > 0 || state.mistake);
    }
    // History may have streamed in since this batch was fetched; skip anything now known.
    let nextIndex = index + 1;
    while (nextIndex < queue.length && playedIds.current.has(queue[nextIndex].id)) nextIndex++;
    if (nextIndex < queue.length) {
      setIndex(nextIndex);
      showPuzzle(queue[nextIndex]);
      return;
    }
    const more = await loadBatch(true);
    if (!more) return;
    setQueue((q) => [...q.slice(0, index + 1), ...more]);
    setIndex(index + 1);
    showPuzzle(more[0]);
  };

  /** Switch level mid-session: the current puzzle stays, the next one uses the new level. */
  const changeLevel = (key: string) => {
    const next = getLevel(key);
    if (next.key === level.key) return;
    setLevelKey(next.key);
    savePrefs({ theme, levelKey: next.key, rated });
    setQueue((q) => q.slice(0, index + 1));
    setLevelsUsed((used) => (used.includes(next.label) ? used : [...used, next.label]));
    setLoadError(null);
    setLevelChangePending(true);
  };

  const tryMove = (from: Square, to: Square, promotion?: PromotionPiece) => {
    if (!state || state.status !== 'playing') return;
    const uci = `${from}${to}${promotion ?? ''}`;
    const { state: next, verdict } = submitMove(state, uci);
    setSelected(null);
    if (verdict === 'illegal') return;
    setState(next);
    // A wrong move isn't played on the board, so it makes no sound.
    if (verdict !== 'wrong') playMoveSound(isCapture(state.fen, uci) ? 'capture' : 'move');
    if (verdict === 'wrong') {
      setFeedback('wrong');
      return;
    }
    if (verdict === 'solved') {
      setFeedback('solved');
      finishPuzzle(next);
      return;
    }
    setFeedback('correct');
    replyTimer.current = setTimeout(() => {
      const reply = next.puzzle.solution[next.ply];
      const replied = playOpponentReply(next);
      setState(replied);
      if (reply) playMoveSound(isCapture(next.fen, reply) ? 'capture' : 'move');
    }, REPLY_DELAY_MS);
  };

  const [soundOn, setSoundOn] = useState(isMoveSoundEnabled);
  useEffect(() => subscribeMoveSoundPref(() => setSoundOn(isMoveSoundEnabled())), []);

  const chess = useMemo(() => (state ? new Chess(state.fen) : null), [state]);
  const myColor = state ? solverColor(state.puzzle) : 'w';
  const myTurn = !!state && state.status === 'playing' && chess?.turn() === myColor;

  const legalTargets = useMemo<Square[]>(() => {
    if (!chess || !selected || !myTurn) return [];
    return chess.moves({ square: selected, verbose: true }).map((m) => m.to as Square);
  }, [chess, selected, myTurn]);

  const onSquareTap = (square: Square) => {
    if (!chess || !myTurn) return;
    const piece = chess.get(square);
    if (selected && legalTargets.includes(square)) {
      const needsPromotion = chess
        .moves({ square: selected, verbose: true })
        .some((m) => m.to === square && m.promotion);
      if (needsPromotion) {
        setPendingPromotion({ from: selected, to: square });
        return;
      }
      tryMove(selected, square);
      return;
    }
    setSelected(piece && piece.color === myColor ? square : null);
  };

  const reveal = () => {
    if (!state || state.status !== 'playing') return;
    clearTimeout(replyTimer.current ?? undefined);
    const revealed = revealSolution(state);
    setState(revealed);
    setFeedback('revealed');
    setSelected(null);
    finishPuzzle(revealed);
  };

  const endAndLog = async () => {
    const stopSession = () => {
      clearFocusSession();
      activeMs.current = 0;
      visibleSince.current = null;
      setState(null);
    };
    if (tally.attempted === 0) {
      stopSession();
      return;
    }
    setLogging(true);
    await flushResults();
    try {
      const minutes = Math.max(1, Math.round(elapsedActiveMs() / 60000));
      const { createSession } = await import('@/lib/firebase');
      await createSession({
        type: 'tactics',
        date: new Date(),
        duration: minutes,
        puzzlesAttempted: tally.attempted,
        puzzlesCorrect: tally.clean,
        tacticsNotes: `Focus practice: ${getThemeLabel(theme)} (${(levelsUsed.length
          ? levelsUsed
          : [level.label]
        ).join(' → ')}, Lichess puzzles)`,
      });
      ['sessions', 'statistics', 'weekly-goal', 'weekly-activity'].forEach((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      );
      toast({
        title: 'Session logged',
        description: `${tally.clean}/${tally.attempted} ${getThemeLabel(theme)} puzzles in ${minutes} min`,
      });
      stopSession();
    } catch (error) {
      console.error('[Focus] Failed to log tactics session', error);
      toast({
        title: 'Could not log session',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLogging(false);
    }
  };

  const lastMoveSquares = state?.lastMove
    ? ([state.lastMove.slice(0, 2), state.lastMove.slice(2, 4)] as Square[])
    : [];
  const sideName = myColor === 'w' ? 'White' : 'Black';
  const feedbackText: Record<Feedback, string> = {
    find: `${sideName} to move — find the ${getThemeLabel(theme).toLowerCase()} idea.`,
    correct: 'Correct! Keep going.',
    wrong: 'Not quite — try again.',
    solved: state?.mistake ? 'Solved (after a miss).' : 'Solved first try!',
    revealed: 'Solution shown.',
  };
  const feedbackColor: Record<Feedback, string> = {
    find: 'text-gray-700',
    correct: 'text-green-700',
    wrong: 'text-red-600',
    solved: 'text-green-700',
    revealed: 'text-amber-700',
  };

  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-4">
      <div className="flex items-center gap-2">
        <Target className="h-6 w-6 text-[#1E40AF]" />
        <h1 className="text-2xl font-bold text-gray-900">Focus practice</h1>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          aria-label={soundOn ? 'Mute move sounds' : 'Unmute move sounds'}
          aria-pressed={soundOn}
          title={soundOn ? 'Move sounds on' : 'Move sounds off'}
          onClick={() => setMoveSoundEnabled(!soundOn)}
        >
          {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </Button>
      </div>

      {!state && (
        <Card>
          <CardContent className="space-y-4 p-4 md:p-6">
            <p className="text-sm text-gray-600">
              Pick a theme and drill Lichess puzzles that feature it. Your score can be logged as a
              tactics session when you finish.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="focus-theme">Theme</Label>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger id="focus-theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUPS.map((group) => (
                      <SelectGroup key={group}>
                        <SelectLabel>{group}</SelectLabel>
                        {FOCUS_THEMES.filter((t) => t.group === group).map((t) => (
                          <SelectItem key={t.key} value={t.key}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="focus-level">Puzzle level</Label>
                <Select value={level.key} onValueChange={setLevelKey}>
                  <SelectTrigger id="focus-level">
                    <SelectValue />
                  </SelectTrigger>
                  <LevelOptions showRelative={!!token} />
                </Select>
              </div>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <LichessAccountConnect returnPath="/focus" />
              {token && (
                <div className="mt-3 flex items-start gap-3 border-t pt-3">
                  <Switch id="focus-rated" checked={rated} onCheckedChange={setRated} />
                  <Label htmlFor="focus-rated" className="space-y-0.5 font-normal">
                    <span className="block font-medium">Count toward my Lichess puzzle rating</span>
                    <span className="block text-xs text-gray-500">
                      Off: results are still saved to your Lichess history (so puzzles aren&apos;t
                      repeated) but your rating doesn&apos;t move.
                    </span>
                  </Label>
                </div>
              )}
            </div>
            <Button onClick={startSet} disabled={loading} className="w-full sm:w-auto">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start {getThemeLabel(theme)} practice
            </Button>
            {loadError && (
              <p role="alert" className="text-sm text-red-600">
                {loadError}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {state && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <OtbBoard
            pieceMap={pieceMapFromFen(state.fen)}
            selectedSquare={selected}
            legalTargets={legalTargets}
            isFlipped={myColor === 'b'}
            isTableMode={false}
            onSquareTap={onSquareTap}
            highlightSquares={lastMoveSquares}
          />
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="focus-session-level" className="shrink-0 text-sm text-gray-600">
                  Level
                </Label>
                <Select value={level.key} onValueChange={changeLevel}>
                  <SelectTrigger id="focus-session-level" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <LevelOptions showRelative={!!token} />
                </Select>
              </div>
              {levelChangePending && (
                <p className="-mt-2 text-xs text-gray-500">
                  New level starts from the next puzzle.
                </p>
              )}
              <div className="text-sm text-gray-500">
                {getThemeLabel(theme)} · puzzle {puzzleNumber}
                {state.puzzle.rating !== null && ` · rated ${state.puzzle.rating}`}
              </div>
              <p className={`text-lg font-semibold ${feedbackColor[feedback]}`} aria-live="polite">
                {feedbackText[feedback]}
              </p>
              {state.status !== 'playing' && (
                <p className="text-sm text-gray-700">
                  Solution: {solutionSan(state.puzzle).join(' ')}
                </p>
              )}
              <div className="space-y-1 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    Solved first try: <strong>{tally.clean}</strong> / {tally.attempted}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 tabular-nums"
                    aria-label="Session time"
                    title="Session time (paused while the app is in the background)"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(elapsedActiveMs())}
                  </span>
                </div>
                {connection && (
                  <div>
                    Lichess puzzle rating: <strong>{lichessRating ?? '—'}</strong>
                    {ratingDiffs[state.puzzle.id] !== undefined && (
                      <span
                        className={
                          ratingDiffs[state.puzzle.id] >= 0 ? 'text-green-700' : 'text-red-600'
                        }
                      >
                        {' '}
                        ({ratingDiffs[state.puzzle.id] >= 0 ? '+' : ''}
                        {ratingDiffs[state.puzzle.id]})
                      </span>
                    )}
                  </div>
                )}
              </div>
              {resultSyncError && <p className="text-xs text-amber-700">{resultSyncError}</p>}
              <div className="flex flex-wrap gap-2">
                {state.status === 'playing' ? (
                  <Button variant="outline" onClick={reveal}>
                    <Eye className="mr-2 h-4 w-4" /> Show solution
                  </Button>
                ) : null}
                <Button onClick={nextPuzzle} disabled={loading}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <SkipForward className="mr-2 h-4 w-4" />
                  )}
                  {state.status === 'playing' ? 'Skip' : 'Next puzzle'}
                </Button>
              </div>
              {loadError && (
                <p role="alert" className="text-sm text-red-600">
                  {loadError}
                </p>
              )}
              <a
                href={`https://lichess.org/training/${state.puzzle.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
              >
                View on Lichess <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <div className="border-t pt-4">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={endAndLog}
                  disabled={logging}
                >
                  {logging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {tally.attempted > 0 ? 'End & log tactics session' : 'End practice'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
