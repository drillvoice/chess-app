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

describe('setSessions write volume', () => {
  const session = (id: number, duration = 10) =>
    ({
      id,
      type: 'game',
      date: new Date(2026, 0, 1, 0, id),
      duration,
      needsReview: false,
    }) as never;

  /**
   * Realtime sync calls setSessions on every cloud snapshot, including the echo
   * of the app's own write. It used to clear the store and re-add every session
   * inside one readwrite transaction that also locks cache_meta, so a foreground
   * settings write (adding a tag) queued behind a rewrite of the whole history.
   */
  it('writes nothing when a snapshot changes no session', async () => {
    const sessions = [session(1), session(2), session(3)];
    await offlineStorage.setSessions(sessions);

    const db = await getDB();
    const transaction = vi.spyOn(db, 'transaction');

    await offlineStorage.setSessions(sessions.map((s) => ({ ...(s as object) }) as never));

    // Only the readonly diff transaction runs: no writes, and no readwrite lock
    // on cache_meta for a concurrent settings save to queue behind.
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][1]).toBe('readonly');

    expect(await offlineStorage.getSessions()).toHaveLength(3);
    transaction.mockRestore();
  });

  it('replaces the stored set, adding and dropping only what differs', async () => {
    await offlineStorage.setSessions([session(1), session(2), session(3)]);

    const db = await getDB();
    const transaction = vi.spyOn(db, 'transaction');

    // 2 changed, 3 dropped, 4 added.
    await offlineStorage.setSessions([session(1), session(2, 99), session(4)]);

    expect(transaction.mock.calls.some(([, mode]) => mode === 'readwrite')).toBe(true);
    transaction.mockRestore();

    const stored = await offlineStorage.getSessions();
    expect(stored.map((s) => s.id).sort()).toEqual([1, 2, 4]);
    expect(stored.find((s) => s.id === 2)?.duration).toBe(99);
  });
});

describe('delete tombstones', () => {
  const session = (id: number) =>
    ({
      id,
      type: 'game',
      date: new Date(2026, 0, 1, 0, id),
      platform: 'lichess',
      needsReview: true,
    }) as never;

  /**
   * The cloud tombstone is written by one fire-and-forget call that is skipped
   * outright before Firebase auth resolves. Dropping the row left nothing to
   * retry from, so the next cloud snapshot — which still held the session —
   * silently undid the delete.
   */
  it('hides a deleted session from the app but keeps it for sync', async () => {
    await offlineStorage.setSessions([session(1), session(2)]);

    await offlineStorage.deleteSession(1);

    expect((await offlineStorage.getSessions()).map((s) => s.id)).toEqual([2]);
    expect(await offlineStorage.getSession(1)).toBeNull();

    const forSync = await offlineStorage.getSessionsForSync();
    expect(forSync.map((s) => s.id).sort()).toEqual([1, 2]);
    const tombstone = forSync.find((s) => s.id === 1) as unknown as Record<string, unknown>;
    expect(tombstone.deletedAt).toBeTruthy();
    // updatedAt moves with the delete so recency resolution ranks it above the
    // copy the cloud still holds.
    expect(tombstone.updatedAt).toBe(tombstone.deletedAt);
  });

  it('drops the tombstone row once a snapshot no longer carries it', async () => {
    await offlineStorage.setSessions([session(1)]);
    await offlineStorage.deleteSession(1);

    // What the reconciler writes back after the cloud confirms the tombstone.
    await offlineStorage.setSessions([]);

    expect(await offlineStorage.getSessionsForSync()).toEqual([]);
  });
});
