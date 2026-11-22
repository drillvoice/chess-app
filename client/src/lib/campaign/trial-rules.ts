/**
 * Trial rules: solve TRIAL_TARGET puzzles cleanly (no wrong move, no skip)
 * within TRIAL_MS, with at most MAX_MISSES misses: the next miss ends the
 * trial, so guessing has a cost. Stars:
 *   ★   at least ONE_STAR_CLEAN clean solves before the trial ends
 *   ★★  the full target within the time limit
 *   ★★★ the full target within THREE_STAR_MS
 * A regular node is cleared with ★; a boss is only beaten with ★★.
 *
 * Stars are derived from stored attempts, never stored, so changing a time
 * here re-scores history. (The miss limit can't be applied retroactively:
 * older attempts didn't stop at the fourth miss.)
 */
export const TRIAL_MS = 6 * 60 * 1000;
export const THREE_STAR_MS = 4 * 60 * 1000;
export const TRIAL_TARGET = 10;
export const MAX_MISSES = 3;
export const ONE_STAR_CLEAN = 6;
export const CLEAR_STARS = 1;
export const BOSS_CLEAR_STARS = 2;
/**
 * Pace is reported per 5 minutes whatever the time limit, so the number stays
 * comparable across rule changes.
 */
export const PACE_WINDOW_MS = 5 * 60 * 1000;

export type Stars = 0 | 1 | 2 | 3;

export interface TrialOutcome {
  clean: number;
  /** Active time at which the target was reached, or null if it never was. */
  completedMs: number | null;
}

export function starsFor({ clean, completedMs }: TrialOutcome): Stars {
  if (completedMs !== null && Number.isFinite(completedMs) && clean >= TRIAL_TARGET) {
    if (completedMs <= THREE_STAR_MS) return 3;
    if (completedMs <= TRIAL_MS) return 2;
  }
  return clean >= ONE_STAR_CLEAN ? 1 : 0;
}

/**
 * Pace: clean solves per PACE_WINDOW_MS. A finished trial is extrapolated from
 * its completion time (10 in 2:30 → 20), so getting faster keeps raising the
 * number. An unfinished one is scored as if it used the whole time limit, so
 * running out of misses early doesn't inflate it. This is the metric tracked
 * over time.
 */
export function trialPace({ clean, completedMs }: TrialOutcome): number {
  if (completedMs !== null && Number.isFinite(completedMs) && completedMs > 0) {
    return (clean * PACE_WINDOW_MS) / completedMs;
  }
  return (clean * PACE_WINDOW_MS) / TRIAL_MS;
}

/** End rule for a trial run, checked after every puzzle (time is checked by the clock). */
export function trialEnd(tally: {
  attempted: number;
  clean: number;
}): 'completed' | 'ended' | null {
  if (tally.clean >= TRIAL_TARGET) return 'completed';
  if (tally.attempted - tally.clean > MAX_MISSES) return 'ended';
  return null;
}

/** Time per puzzle at ★★ pace; the placement test uses the same pace. */
export const TWO_STAR_MS_PER_PUZZLE = TRIAL_MS / TRIAL_TARGET;
