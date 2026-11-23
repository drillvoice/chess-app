import type { FocusPuzzle } from '@/lib/focus/lichess-puzzles';

/** How a puzzle in a timed run was missed. */
export type MissReason = 'wrong' | 'skipped' | 'away';

/** A puzzle missed during a timed run, kept (in memory) for the post-run review. */
export interface MissedPuzzle {
  puzzle: FocusPuzzle;
  /** Solution plies already played when the miss happened (0 = the first move). */
  ply: number;
  /** The wrong move played, in UCI; null for a skip or stepping away. */
  wrongMove: string | null;
  reason: MissReason;
}

/** Line from the puzzle start to the player's wrong move (or to the miss point). */
export function mistakeLine(miss: MissedPuzzle): string[] {
  const before = miss.puzzle.solution.slice(0, miss.ply);
  return miss.wrongMove ? [...before, miss.wrongMove] : before;
}
