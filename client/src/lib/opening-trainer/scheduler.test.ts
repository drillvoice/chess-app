import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EASE,
  gradeMove,
  isMoveDue,
  moveStatsNeedRepair,
  sanitizeMoveStats,
} from './scheduler';
import type { OpeningMoveStats } from './types';

const NEW: OpeningMoveStats = { attempts: 0, misses: 0, streak: 0 };
const DAY_MS = 86_400_000;

describe('opening scheduler', () => {
  it('treats new and undefined cards as due', () => {
    expect(isMoveDue(undefined)).toBe(true);
    expect(isMoveDue(NEW)).toBe(true);
  });

  it('grows the interval across consecutive passes', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const first = gradeMove(NEW, true, now);
    expect(first.repetitions).toBe(1);
    expect(first.intervalDays).toBe(1);
    expect(first.dueAt).toBe(new Date(now.getTime() + 1 * DAY_MS).toISOString());

    const second = gradeMove(first, true, now);
    expect(second.repetitions).toBe(2);
    expect(second.intervalDays).toBe(3);

    const third = gradeMove(second, true, now);
    expect(third.repetitions).toBe(3);
    // round(3 * 2.5) = 8
    expect(third.intervalDays).toBe(8);
    expect(third.dueAt).toBe(new Date(now.getTime() + 8 * DAY_MS).toISOString());
  });

  it('is not due before its dueAt and due once it passes', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const graded = gradeMove(NEW, true, now); // interval 1 day
    expect(isMoveDue(graded, now)).toBe(false);
    expect(isMoveDue(graded, new Date(now.getTime() + 2 * DAY_MS))).toBe(true);
  });

  it('resets repetitions/interval and lowers ease on a lapse', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const learned = gradeMove(gradeMove(gradeMove(NEW, true, now), true, now), true, now);
    expect(learned.intervalDays).toBeGreaterThan(1);

    const lapsed = gradeMove(learned, false, now);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.intervalDays).toBe(0);
    expect(lapsed.easeFactor).toBeCloseTo(DEFAULT_EASE - 0.2);
    expect(isMoveDue(lapsed, now)).toBe(true);
  });

  it('floors the ease factor at 1.3', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    let stat: OpeningMoveStats = { ...NEW, easeFactor: 1.4 };
    stat = gradeMove(stat, false, now);
    stat = gradeMove(stat, false, now);
    expect(stat.easeFactor).toBe(1.3);
  });

  it('preserves the existing counter fields', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const stat: OpeningMoveStats = { attempts: 5, misses: 2, streak: 3, lastSeenAt: 'x' };
    const graded = gradeMove(stat, true, now);
    expect(graded.attempts).toBe(5);
    expect(graded.misses).toBe(2);
    expect(graded.streak).toBe(3);
  });

  it('never throws "Invalid time value" on corrupt (non-finite) SRS fields', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    // A corrupt card whose interval/ease are NaN previously made the pass branch
    // compute `new Date(NaN).toISOString()` and throw, which the trainer surfaced
    // as a move that wouldn't register (only on a clean correct move, since the
    // lapse branch doesn't multiply interval × ease).
    const corrupt: OpeningMoveStats = {
      attempts: 9,
      misses: 1,
      streak: 4,
      repetitions: 5,
      intervalDays: Number.NaN,
      easeFactor: Number.NaN,
    };

    for (const fields of [
      { intervalDays: Number.NaN, easeFactor: Number.NaN },
      { intervalDays: Number.POSITIVE_INFINITY, easeFactor: 2.5 },
      { intervalDays: 10, easeFactor: Number.NaN },
    ] as const) {
      const graded = gradeMove({ ...corrupt, ...fields }, true, now);
      expect(Number.isFinite(graded.intervalDays)).toBe(true);
      expect(Number.isFinite(graded.easeFactor)).toBe(true);
      // dueAt is a valid, parseable timestamp — the bug produced an exception here.
      expect(Number.isNaN(new Date(graded.dueAt!).getTime())).toBe(false);
    }

    // The lapse branch heals a corrupt card too (no throw, finite fields).
    const lapsed = gradeMove(corrupt, false, now);
    expect(Number.isFinite(lapsed.easeFactor)).toBe(true);
    expect(Number.isNaN(new Date(lapsed.dueAt!).getTime())).toBe(false);
  });

  it('clamps the interval so the scheduled date stays valid', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const huge: OpeningMoveStats = {
      ...NEW,
      repetitions: 5,
      intervalDays: 1e12,
      easeFactor: 2.5,
    };
    const graded = gradeMove(huge, true, now);
    expect(Number.isFinite(graded.intervalDays)).toBe(true);
    expect(Number.isNaN(new Date(graded.dueAt!).getTime())).toBe(false);
  });

  it('sanitizeMoveStats coerces non-finite fields and preserves valid ones', () => {
    // Counters: NaN/Infinity → finite ints; SRS fields only present when set.
    const corrupt: OpeningMoveStats = {
      attempts: Number.NaN,
      misses: Number.POSITIVE_INFINITY,
      streak: -3 as unknown as number,
      easeFactor: Number.NaN,
      intervalDays: Number.POSITIVE_INFINITY,
      repetitions: Number.NaN,
      dueAt: 'not-a-date',
    };
    const fixed = sanitizeMoveStats(corrupt);
    expect(Number.isFinite(fixed.attempts)).toBe(true);
    expect(Number.isFinite(fixed.misses)).toBe(true);
    expect(fixed.streak).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(fixed.easeFactor!)).toBe(true);
    expect(Number.isFinite(fixed.intervalDays!)).toBe(true);
    expect(Number.isFinite(fixed.repetitions!)).toBe(true);
    // An unparseable dueAt is dropped (treated as due/new).
    expect(fixed.dueAt).toBeUndefined();

    // A healthy stat is returned unchanged in value (and not flagged for repair).
    const healthy: OpeningMoveStats = {
      attempts: 4,
      misses: 1,
      streak: 3,
      easeFactor: 2.5,
      intervalDays: 8,
      repetitions: 3,
      dueAt: '2026-01-08T00:00:00.000Z',
    };
    expect(sanitizeMoveStats(healthy)).toEqual(healthy);
    expect(moveStatsNeedRepair(healthy)).toBe(false);
    expect(moveStatsNeedRepair(corrupt)).toBe(true);
  });

  it('does not add SRS fields that were never set', () => {
    const fixed = sanitizeMoveStats(NEW);
    expect('easeFactor' in fixed).toBe(false);
    expect('intervalDays' in fixed).toBe(false);
    expect('repetitions' in fixed).toBe(false);
  });
});
