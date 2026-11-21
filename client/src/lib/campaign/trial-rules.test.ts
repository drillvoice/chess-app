import { describe, expect, it } from 'vitest';
import { isTrialOver, starsFor, trialPace, TRIAL_MS } from './trial-rules';

describe('starsFor', () => {
  it('awards stars by clean count and completion time', () => {
    expect(starsFor({ clean: 5, completedMs: null })).toBe(0);
    expect(starsFor({ clean: 6, completedMs: null })).toBe(1);
    expect(starsFor({ clean: 9, completedMs: null })).toBe(1);
    expect(starsFor({ clean: 10, completedMs: 4 * 60_000 })).toBe(2);
    expect(starsFor({ clean: 10, completedMs: 3 * 60_000 })).toBe(3);
  });

  it('does not trust a completion time without the full target or a finite value', () => {
    expect(starsFor({ clean: 7, completedMs: 60_000 })).toBe(1);
    expect(starsFor({ clean: 10, completedMs: Number.NaN })).toBe(1);
    expect(starsFor({ clean: 10, completedMs: TRIAL_MS + 1 })).toBe(1);
  });
});

describe('trialPace', () => {
  it('is the clean count for an unfinished trial', () => {
    expect(trialPace({ clean: 7, completedMs: null })).toBe(7);
  });
  it('extrapolates a finished trial to a 5-minute rate', () => {
    expect(trialPace({ clean: 10, completedMs: 150_000 })).toBe(20);
    expect(trialPace({ clean: 10, completedMs: TRIAL_MS })).toBe(10);
  });
});

describe('isTrialOver', () => {
  it('ends on the target or when time runs out', () => {
    expect(isTrialOver(9, TRIAL_MS - 1)).toBe(false);
    expect(isTrialOver(10, 1000)).toBe(true);
    expect(isTrialOver(3, TRIAL_MS)).toBe(true);
  });
});
