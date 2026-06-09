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
// Cap the scheduled interval so the resulting date is always well within the
// valid Date range (~273k years), even if a stored interval/ease ever grows
// unbounded. 20 years is far beyond any real review cadence.
const MAX_INTERVAL_DAYS = 365 * 20;

// `?? fallback` only guards null/undefined — it lets a corrupt `NaN`/`Infinity`
// through. A non-finite ease/interval would make `nextInterval` non-finite and
// `new Date(...).toISOString()` throw "Invalid time value", which the trainer
// surfaced as a move that wouldn't register. Coerce to a safe finite value.
export function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Coerce every numeric field of a move's stats to a safe finite value, so a
 * corrupt record (a `NaN`/`Infinity` that slipped in via an old build or a sync
 * round-trip, or a partial stat missing its counters) can never feed arithmetic
 * or date math downstream. Pure: returns a new object, never mutates the input.
 * Used both to harden the writer (`statFor`) and to heal stored data on load
 * (`normalizeRepertoire`).
 */
export function sanitizeMoveStats(stat: OpeningMoveStats): OpeningMoveStats {
  const sanitized: OpeningMoveStats = {
    ...stat,
    attempts: Math.max(0, Math.floor(finiteOr(stat.attempts, 0))),
    misses: Math.max(0, Math.floor(finiteOr(stat.misses, 0))),
    streak: Math.max(0, Math.floor(finiteOr(stat.streak, 0))),
  };
  if (stat.easeFactor !== undefined) {
    sanitized.easeFactor = Math.max(MIN_EASE, finiteOr(stat.easeFactor, DEFAULT_EASE));
  }
  if (stat.repetitions !== undefined) {
    sanitized.repetitions = Math.max(0, Math.floor(finiteOr(stat.repetitions, 0)));
  }
  if (stat.intervalDays !== undefined) {
    sanitized.intervalDays = Math.min(
      MAX_INTERVAL_DAYS,
      Math.max(0, finiteOr(stat.intervalDays, 0)),
    );
  }
  // Drop an unparseable dueAt so the move is simply treated as due/new.
  if (stat.dueAt !== undefined && Number.isNaN(new Date(stat.dueAt).getTime())) {
    delete sanitized.dueAt;
  }
  return sanitized;
}

/**
 * True when `sanitizeMoveStats` would change `stat` — i.e. it carries a
 * non-finite numeric field or an unparseable `dueAt`. Lets callers report how
 * much real corruption existed without diffing whole objects.
 */
export function moveStatsNeedRepair(stat: OpeningMoveStats): boolean {
  return (
    !Number.isFinite(stat.attempts) ||
    !Number.isFinite(stat.misses) ||
    !Number.isFinite(stat.streak) ||
    (stat.easeFactor !== undefined && !Number.isFinite(stat.easeFactor)) ||
    (stat.repetitions !== undefined && !Number.isFinite(stat.repetitions)) ||
    (stat.intervalDays !== undefined && !Number.isFinite(stat.intervalDays)) ||
    (stat.dueAt !== undefined && Number.isNaN(new Date(stat.dueAt).getTime()))
  );
}

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
  // Sanitise stored values: a corrupt (non-finite) ease/interval must never reach
  // the date arithmetic below, or `toISOString()` throws. This also heals the bad
  // card — the returned stats are always finite.
  const ease = Math.max(MIN_EASE, finiteOr(stat.easeFactor, DEFAULT_EASE));
  const repetitions = Math.max(0, Math.floor(finiteOr(stat.repetitions, 0)));
  const intervalDays = Math.max(0, finiteOr(stat.intervalDays, 0));

  if (!pass) {
    return {
      ...stat,
      repetitions: 0,
      intervalDays: 0,
      easeFactor: Math.max(MIN_EASE, ease - EASE_LAPSE_PENALTY),
      dueAt: new Date(now.getTime() + FIRST_INTERVAL_DAYS * DAY_MS).toISOString(),
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
  // Clamp so the scheduled date is always valid regardless of stored history.
  nextInterval = Math.min(nextInterval, MAX_INTERVAL_DAYS);

  return {
    ...stat,
    repetitions: nextRepetitions,
    intervalDays: nextInterval,
    easeFactor: ease,
    dueAt: new Date(now.getTime() + nextInterval * DAY_MS).toISOString(),
  };
}
