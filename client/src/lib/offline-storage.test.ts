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
});
