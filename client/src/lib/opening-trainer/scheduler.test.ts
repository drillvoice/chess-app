import { describe, expect, it } from 'vitest';
import { DEFAULT_EASE, gradeMove, isMoveDue } from './scheduler';
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
});
