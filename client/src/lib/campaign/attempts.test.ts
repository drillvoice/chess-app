import { describe, expect, it } from 'vitest';
import { normalizeAttempt, reconcileAttempts, type CampaignAttempt } from './attempts';

const valid: CampaignAttempt = {
  id: 'x1',
  nodeId: 'beginner:fork',
  startedAt: '2026-11-01T10:00:00.000Z',
  durationMs: 200_000,
  attempted: 12,
  clean: 10,
  completedMs: 200_000,
};

describe('normalizeAttempt', () => {
  it('accepts a valid attempt unchanged', () => {
    expect(normalizeAttempt(valid)).toEqual(valid);
  });

  it('rejects unknown nodes, bad dates and non-finite numbers', () => {
    expect(normalizeAttempt({ ...valid, nodeId: 'beginner:nope' })).toBeNull();
    expect(normalizeAttempt({ ...valid, startedAt: 'yesterday' })).toBeNull();
    expect(normalizeAttempt({ ...valid, clean: Number.NaN })).toBeNull();
    expect(normalizeAttempt({ ...valid, durationMs: Infinity })).toBeNull();
    expect(normalizeAttempt(null)).toBeNull();
  });

  it('drops a completion time that the clean count does not support', () => {
    expect(normalizeAttempt({ ...valid, clean: 8 })?.completedMs).toBeNull();
    expect(normalizeAttempt({ ...valid, completedMs: Number.NaN })?.completedMs).toBeNull();
  });

  it('never lets clean exceed attempted', () => {
    expect(normalizeAttempt({ ...valid, attempted: 9 })?.clean).toBe(9);
  });
});

describe('reconcileAttempts', () => {
  it('finds what each side is missing', () => {
    const a = { ...valid, id: 'a' };
    const b = { ...valid, id: 'b' };
    const c = { ...valid, id: 'c' };
    const result = reconcileAttempts([a, b], [b, c]);
    expect(result.missingLocally.map((x) => x.id)).toEqual(['c']);
    expect(result.missingRemotely.map((x) => x.id)).toEqual(['a']);
  });
});
