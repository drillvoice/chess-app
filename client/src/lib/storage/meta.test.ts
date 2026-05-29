import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { withStores } from './transaction';
import {
  getLastSyncedTimestamp,
  setLastSyncedTimestamp,
  getSyncCurrentUid,
  setSyncCurrentUid,
  getCacheAge,
} from './meta';

async function clearMeta(): Promise<void> {
  await withStores(['cache_meta'] as const, 'readwrite', async ({ cache_meta }) => {
    await cache_meta.clear();
  });
}

async function seedLegacy(key: string, timestamp: number | string): Promise<void> {
  await withStores(['cache_meta'] as const, 'readwrite', async ({ cache_meta }) => {
    await cache_meta.put({ key, timestamp });
  });
}

describe('meta legacy field migration', () => {
  beforeEach(clearMeta);

  it('reads a legacy numeric value stored under timestamp', async () => {
    await seedLegacy('sessions_last_synced', 123);
    expect(await getLastSyncedTimestamp()).toBe(123);
  });

  it('reads a legacy string value stored under timestamp', async () => {
    await seedLegacy('sync_current_uid', 'user-1');
    expect(await getSyncCurrentUid()).toBe('user-1');
  });

  it('computes cache age from a legacy timestamp field', async () => {
    const tenSecondsAgo = Date.now() - 10_000;
    await seedLegacy('sessions_last_updated', tenSecondsAgo);
    const age = await getCacheAge('sessions');
    expect(age).toBeGreaterThanOrEqual(10_000);
    expect(age).toBeLessThan(60_000);
  });

  it('returns 0 for a missing numeric meta key', async () => {
    expect(await getLastSyncedTimestamp()).toBe(0);
  });

  it('returns null for a missing string meta key', async () => {
    expect(await getSyncCurrentUid()).toBeNull();
  });
});

describe('meta value round-trip', () => {
  beforeEach(clearMeta);

  it('writes new records under the value field', async () => {
    await setLastSyncedTimestamp(456);
    const raw = await withStores(['cache_meta'] as const, 'readonly', async ({ cache_meta }) => {
      return cache_meta.get('sessions_last_synced');
    });
    expect(raw).toEqual({ key: 'sessions_last_synced', value: 456 });
    expect(await getLastSyncedTimestamp()).toBe(456);
  });

  it('round-trips a string value', async () => {
    await setSyncCurrentUid('user-2');
    expect(await getSyncCurrentUid()).toBe('user-2');
  });

  it('prefers the new value field over a legacy timestamp field', async () => {
    await withStores(['cache_meta'] as const, 'readwrite', async ({ cache_meta }) => {
      await cache_meta.put({ key: 'sessions_last_synced', value: 789, timestamp: 111 });
    });
    expect(await getLastSyncedTimestamp()).toBe(789);
  });
});
