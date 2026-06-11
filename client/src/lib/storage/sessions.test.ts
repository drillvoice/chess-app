import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { offlineStorage } from '../offline-storage';
import { getDB } from './db';

beforeEach(async () => {
  await offlineStorage.clearAll();
});

describe('session hydration', () => {
  it('heals a corrupt date on read instead of producing an Invalid Date', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = await getDB();
    // Write a raw record directly to bypass setSessions' toISOString() guard,
    // simulating a corrupt persisted/synced record.
    await db.put('sessions', {
      id: 42,
      type: 'tactics',
      date: 'not-a-real-date',
      needsReview: false,
    } as never);

    const sessions = await offlineStorage.getSessions();
    expect(sessions).toHaveLength(1);
    expect(Number.isNaN(sessions[0].date.getTime())).toBe(false);
    // Healed records must survive a re-serialize round trip (the historical crash).
    expect(() => sessions[0].date.toISOString()).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it('preserves a valid date through a round trip', async () => {
    const date = new Date('2026-01-15T12:00:00.000Z');
    await offlineStorage.setSessions([
      { id: 1, type: 'tactics', date, needsReview: false } as never,
    ]);

    const sessions = await offlineStorage.getSessions();
    expect(sessions[0].date.toISOString()).toBe(date.toISOString());
  });

  it('drops non-finite numeric fields and invalid goalWeekStart on read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = await getDB();
    await db.put('sessions', {
      id: 7,
      type: 'tactics',
      date: new Date().toISOString(),
      duration: NaN,
      pointsGained: Infinity,
      puzzlesAttempted: '12',
      finalScore: 1450,
      goalWeekStart: 'garbage',
      needsReview: false,
    } as never);

    const [session] = await offlineStorage.getSessions();
    expect(session.duration).toBeUndefined();
    expect(session.pointsGained).toBeUndefined();
    expect(session.puzzlesAttempted).toBeUndefined();
    expect(session.goalWeekStart).toBeUndefined();
    // Healthy values survive untouched.
    expect(session.finalScore).toBe(1450);
    expect(warn).toHaveBeenCalled();
  });
});
