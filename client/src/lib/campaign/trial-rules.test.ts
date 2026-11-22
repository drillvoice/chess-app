import { describe, expect, it } from 'vitest';
import { MAX_MISSES, starsFor, trialEnd, trialPace, TRIAL_MS, THREE_STAR_MS } from './trial-rules';

describe('starsFor', () => {
  it('awards stars by clean count and completion time', () => {
    expect(starsFor({ clean: 5, completedMs: null })).toBe(0);
    expect(starsFor({ clean: 6, completedMs: null })).toBe(1);
    expect(starsFor({ clean: 9, completedMs: null })).toBe(1);
    expect(starsFor({ clean: 10, completedMs: TRIAL_MS })).toBe(2);
    expect(starsFor({ clean: 10, completedMs: THREE_STAR_MS + 1 })).toBe(2);
    expect(starsFor({ clean: 10, completedMs: THREE_STAR_MS })).toBe(3);
  });

  it('does not trust a completion time without the full target or a finite value', () => {
    expect(starsFor({ clean: 7, completedMs: 60_000 })).toBe(1);
    expect(starsFor({ clean: 10, completedMs: Number.NaN })).toBe(1);
    expect(starsFor({ clean: 10, completedMs: TRIAL_MS + 1 })).toBe(1);
  });
});

describe('trialPace', () => {
  it('scores an unfinished trial as if it used the whole time limit', () => {
    expect(trialPace({ clean: 6, completedMs: null })).toBeCloseTo((6 * 5) / (TRIAL_MS / 60_000));
  });
  it('extrapolates a finished trial to a 5-minute rate', () => {
    expect(trialPace({ clean: 10, completedMs: 150_000 })).toBe(20);
    expect(trialPace({ clean: 10, completedMs: 300_000 })).toBe(10);
  });
  it('ranks finishing above not finishing', () => {
    expect(trialPace({ clean: 10, completedMs: TRIAL_MS })).toBeGreaterThan(
      trialPace({ clean: 9, completedMs: null }),
    );
  });
});

describe('trialEnd', () => {
  it('completes on the target', () => {
    expect(trialEnd({ attempted: 12, clean: 10 })).toBe('completed');
  });
  it(`allows ${MAX_MISSES} misses and ends on the next one`, () => {
    expect(trialEnd({ attempted: 5 + MAX_MISSES, clean: 5 })).toBeNull();
    expect(trialEnd({ attempted: 6 + MAX_MISSES, clean: 5 })).toBe('ended');
  });
});
