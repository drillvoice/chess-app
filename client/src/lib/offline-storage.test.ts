import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { offlineStorage } from './offline-storage';

beforeEach(async () => {
  await offlineStorage.clearAll();
});

describe('offlineStorage', () => {
  it('adds and retrieves sessions in descending date order', async () => {
    await offlineStorage.addSession({ id: 1, type: 'tactics', date: new Date('2024-01-01') } as any);
    await offlineStorage.addSession({ id: 2, type: 'tactics', date: new Date('2024-01-02') } as any);
    const sessions = await offlineStorage.getSessions();
    expect(sessions.map((s) => s.id)).toEqual([2, 1]);
  });

  it('stores and retrieves statistics with cache age', async () => {
    await offlineStorage.setStatistics({ total: 1 });
    const stats = await offlineStorage.getStatistics();
    expect(stats).toEqual({ total: 1 });
    const age = await offlineStorage.getCacheAge('statistics');
    expect(typeof age).toBe('number');
  });

  it('merges sessions without clearing existing ones', async () => {
    await offlineStorage.setSessions([
      { id: 1, type: 'tactics', date: new Date('2024-01-01') } as any,
    ]);

    await offlineStorage.mergeSessions([
      { id: 2, type: 'endgame', date: new Date('2024-01-03') } as any,
      { id: 1, type: 'updated', date: new Date('2024-01-02') } as any,
    ]);

    const sessions = await offlineStorage.getSessions();
    expect(sessions.map((s) => s.id).sort()).toEqual([1, 2]);
    expect(sessions.find((s) => s.id === 1)?.type).toBe('updated');
  });

  it('stores and reads last synced timestamp', async () => {
    const ts = Date.now();
    await offlineStorage.setLastSyncedTimestamp(ts);
    const stored = await offlineStorage.getLastSyncedTimestamp();
    expect(stored).toBe(ts);
  });
});
