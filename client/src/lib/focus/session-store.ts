import { parseLichessPuzzle, type FocusPuzzle, type PuzzleResult } from './lichess-puzzles';
import { restorePuzzleState, type PuzzleState, type PuzzleStatus } from './puzzle-session';
import { FOCUS_THEMES, getLevel } from './themes';

/**
 * Saves an in-progress Focus session so it survives the phone unloading the app
 * in the background, a reload, or navigating to another tab and back.
 * Everything read back is validated: puzzles are re-parsed (which replays their
 * solutions), the board is rebuilt from the solution, and numbers are checked
 * with Number.isFinite. A save that fails validation is discarded.
 */

const KEY = 'focus-session';
const VERSION = 1;
/** Older than this, a session is treated as abandoned. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type Feedback = 'find' | 'correct' | 'wrong' | 'solved' | 'revealed';
const FEEDBACK: Feedback[] = ['find', 'correct', 'wrong', 'solved', 'revealed'];
const STATUSES: PuzzleStatus[] = ['playing', 'solved', 'failed'];

export interface FocusSession {
  theme: string;
  levelKey: string;
  queue: FocusPuzzle[];
  index: number;
  state: PuzzleState;
  feedback: Feedback;
  tally: { attempted: number; clean: number };
  /** Time spent with the app open, in ms. Time in other apps isn't counted. */
  activeMs: number;
  levelsUsed: string[];
  puzzleNumber: number;
  seenIds: string[];
  /** Lichess results not yet accepted, keyed `${theme}|rated|casual`. */
  pendingResults: Array<[string, PuzzleResult[]]>;
}

interface Stored {
  v: number;
  savedAt: number;
  theme: string;
  levelKey: string;
  queue: unknown[];
  index: number;
  ply: number;
  status: PuzzleStatus;
  mistake: boolean;
  feedback: Feedback;
  tally: { attempted: number; clean: number };
  activeMs: number;
  levelsUsed: string[];
  puzzleNumber: number;
  seenIds: string[];
  pendingResults: Array<[string, PuzzleResult[]]>;
}

/** Put a puzzle back into the raw Lichess shape so loading re-validates it. */
function toRaw(p: FocusPuzzle) {
  return {
    game: { id: p.gameId },
    puzzle: {
      id: p.id,
      rating: p.rating,
      themes: p.themes,
      solution: p.solution,
      fen: p.fen,
      lastMove: p.lastMove,
    },
  };
}

export function saveFocusSession(session: FocusSession): void {
  const stored: Stored = {
    v: VERSION,
    savedAt: Date.now(),
    theme: session.theme,
    levelKey: session.levelKey,
    queue: session.queue.map(toRaw),
    index: session.index,
    ply: session.state.ply,
    status: session.state.status,
    mistake: session.state.mistake,
    feedback: session.feedback,
    tally: session.tally,
    activeMs: session.activeMs,
    levelsUsed: session.levelsUsed,
    puzzleNumber: session.puzzleNumber,
    seenIds: session.seenIds,
    pendingResults: session.pendingResults,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch (error) {
    // Losing resume is a degradation, not a failure of the move itself.
    console.warn('[Focus] Could not save session for resume', error);
  }
}

export function clearFocusSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

function parsePending(v: unknown): Array<[string, PuzzleResult[]]> {
  if (!Array.isArray(v)) return [];
  const out: Array<[string, PuzzleResult[]]> = [];
  for (const entry of v) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) continue;
    const results = (entry[1] as Array<{ id?: unknown; win?: unknown }>)
      .filter((r) => typeof r?.id === 'string' && typeof r?.win === 'boolean')
      .map((r) => ({ id: r.id as string, win: r.win as boolean }));
    if (results.length > 0) out.push([entry[0], results]);
  }
  return out;
}

/** The saved session, or null if there is none, it's stale, or it fails validation. */
export function loadFocusSession(now = Date.now()): FocusSession | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const s = JSON.parse(raw) as Partial<Stored>;
    if (s.v !== VERSION) throw new Error(`unsupported version ${String(s.v)}`);
    if (!Number.isFinite(s.savedAt) || now - (s.savedAt as number) > MAX_AGE_MS) {
      clearFocusSession();
      return null;
    }
    if (!FOCUS_THEMES.some((t) => t.key === s.theme)) throw new Error('unknown theme');
    if (!Array.isArray(s.queue) || s.queue.length === 0) throw new Error('empty queue');
    const queue = s.queue.map((p) => parseLichessPuzzle(p));
    if (!isCount(s.index) || s.index >= queue.length) throw new Error('index out of range');
    if (!isCount(s.ply)) throw new Error('bad ply');
    if (!STATUSES.includes(s.status as PuzzleStatus)) throw new Error('bad status');
    const tally = s.tally;
    if (
      !tally ||
      !isCount(tally.attempted) ||
      !isCount(tally.clean) ||
      tally.clean > tally.attempted
    ) {
      throw new Error('bad tally');
    }
    const state = restorePuzzleState(
      queue[s.index],
      s.ply,
      s.status as PuzzleStatus,
      s.mistake === true,
    );
    return {
      theme: s.theme as string,
      levelKey: getLevel(s.levelKey).key,
      queue,
      index: s.index,
      state,
      feedback: FEEDBACK.includes(s.feedback as Feedback) ? (s.feedback as Feedback) : 'find',
      tally: { attempted: tally.attempted, clean: tally.clean },
      activeMs:
        Number.isFinite(s.activeMs) && (s.activeMs as number) >= 0 ? (s.activeMs as number) : 0,
      levelsUsed: isStringArray(s.levelsUsed) ? s.levelsUsed : [],
      puzzleNumber: isCount(s.puzzleNumber) && s.puzzleNumber > 0 ? s.puzzleNumber : 1,
      seenIds: isStringArray(s.seenIds) ? s.seenIds : [],
      pendingResults: parsePending(s.pendingResults),
    };
  } catch (error) {
    console.warn('[Focus] Discarding a saved session that failed validation', error);
    clearFocusSession();
    return null;
  }
}
