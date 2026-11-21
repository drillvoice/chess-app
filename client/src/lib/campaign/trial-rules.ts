/**
 * Trial rules: solve TRIAL_TARGET puzzles cleanly (no wrong move, no skip)
 * within TRIAL_MS. Stars:
 *   ★   at least ONE_STAR_CLEAN clean solves before time runs out
 *   ★★  the full target within the time limit
 *   ★★★ the full target within THREE_STAR_MS
 * A regular node is cleared with ★; a boss is only beaten with ★★.
 */
export const TRIAL_MS = 5 * 60 * 1000;
export const THREE_STAR_MS = 3 * 60 * 1000;
export const TRIAL_TARGET = 10;
export const ONE_STAR_CLEAN = 6;
export const CLEAR_STARS = 1;
export const BOSS_CLEAR_STARS = 2;

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
 * Pace: clean solves per TRIAL_MS. An unfinished trial scores its clean count;
 * a finished one is extrapolated (10 in 2:30 → 20), so getting faster keeps
 * raising the number after the target is reachable. This is the metric tracked
 * over time.
 */
export function trialPace({ clean, completedMs }: TrialOutcome): number {
  if (completedMs !== null && Number.isFinite(completedMs) && completedMs > 0) {
    return (clean * TRIAL_MS) / completedMs;
  }
  return clean;
}

export function isTrialOver(clean: number, elapsedMs: number): boolean {
  return clean >= TRIAL_TARGET || elapsedMs >= TRIAL_MS;
}
