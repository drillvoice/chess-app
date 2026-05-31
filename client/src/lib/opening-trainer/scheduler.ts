import type { OpeningMoveStats } from './types';

// SM-2-lite spaced repetition for opening moves. The trainer only knows whether
// a move was recalled cleanly (pass) or not (lapse), so grading is binary rather
// than Anki's four-button scale. Intervals grow on success and reset on a lapse,
// so weak lines resurface sooner and mastered lines drift further apart.

export const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const EASE_LAPSE_PENALTY = 0.2;
const FIRST_INTERVAL_DAYS = 1;
const SECOND_INTERVAL_DAYS = 3;
const DAY_MS = 86_400_000;

/**
 * A move is due when it has never been scheduled (a new card) or its `dueAt`
 * has passed.
 */
export function isMoveDue(stat: OpeningMoveStats | undefined, now: Date = new Date()): boolean {
  if (!stat?.dueAt) {
    return true;
  }
  return new Date(stat.dueAt).getTime() <= now.getTime();
}

/**
 * Apply an SM-2-lite grade to a move's SRS fields. `pass` should be true only
 * when the move was recalled with no wrong attempts this drill; a reveal or any
 * miss is a lapse. Counters (attempts/misses/streak/lastSeenAt) are owned by the
 * caller and passed through unchanged.
 */
export function gradeMove(
  stat: OpeningMoveStats,
  pass: boolean,
  now: Date = new Date(),
): OpeningMoveStats {
  const ease = stat.easeFactor ?? DEFAULT_EASE;
  const repetitions = stat.repetitions ?? 0;
  const intervalDays = stat.intervalDays ?? 0;

  if (!pass) {
    return {
      ...stat,
      repetitions: 0,
      intervalDays: 0,
      easeFactor: Math.max(MIN_EASE, ease - EASE_LAPSE_PENALTY),
      dueAt: new Date(now.getTime()).toISOString(),
    };
  }

  const nextRepetitions = repetitions + 1;
  let nextInterval: number;
  if (nextRepetitions === 1) {
    nextInterval = FIRST_INTERVAL_DAYS;
  } else if (nextRepetitions === 2) {
    nextInterval = SECOND_INTERVAL_DAYS;
  } else {
    nextInterval = Math.max(1, Math.round(intervalDays * ease));
  }

  return {
    ...stat,
    repetitions: nextRepetitions,
    intervalDays: nextInterval,
    easeFactor: ease,
    dueAt: new Date(now.getTime() + nextInterval * DAY_MS).toISOString(),
  };
}
