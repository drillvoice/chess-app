import { withStores } from './transaction';

const META = 'cache_meta';

export async function getLastSyncedTimestamp(): Promise<number> {
  return withStores([META], 'readonly', async ({ cache_meta }) => {
    const res = await cache_meta.get('sessions_last_synced');
    return res?.timestamp || 0;
  });
}

export async function setLastSyncedTimestamp(timestamp: number): Promise<void> {
  await withStores([META], 'readwrite', async ({ cache_meta }) => {
    await cache_meta.put({ key: 'sessions_last_synced', timestamp });
  });
}

export async function getCacheAge(key: string): Promise<number> {
  return withStores([META], 'readonly', async ({ cache_meta }) => {
    const res = await cache_meta.get(key + '_last_updated');
    return res && res.timestamp ? Date.now() - res.timestamp : Infinity;
  });
}

export async function getLastSyncAttempt(): Promise<Date | null> {
  return withStores([META], 'readonly', async ({ cache_meta }) => {
    const res = await cache_meta.get('last_sync_attempt');
    return res?.timestamp ? new Date(res.timestamp) : null;
  });
}

export async function setLastSyncAttempt(): Promise<void> {
  await withStores([META], 'readwrite', async ({ cache_meta }) => {
    await cache_meta.put({ key: 'last_sync_attempt', timestamp: Date.now() });
  });
}
