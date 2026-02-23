import { withStores } from './transaction';

const META = 'cache_meta';

async function getMetaTimestamp(key: string): Promise<number> {
  return withStores([META] as const, 'readonly', async ({ cache_meta }) => {
    const res = await cache_meta.get(key);
    return typeof res?.timestamp === 'number' ? res.timestamp : 0;
  });
}

async function setMetaTimestamp(key: string, timestamp: number): Promise<void> {
  await withStores([META] as const, 'readwrite', async ({ cache_meta }) => {
    await cache_meta.put({ key, timestamp });
  });
}

export async function getLastSyncedTimestamp(): Promise<number> {
  return getMetaTimestamp('sessions_last_synced');
}

export async function setLastSyncedTimestamp(timestamp: number): Promise<void> {
  await setMetaTimestamp('sessions_last_synced', timestamp);
}

export async function getCacheAge(key: string): Promise<number> {
  return withStores([META] as const, 'readonly', async ({ cache_meta }) => {
    const res = await cache_meta.get(key + '_last_updated');
    if (!res || typeof res.timestamp !== 'number') {
      return Infinity;
    }
    return Date.now() - res.timestamp;
  });
}

export async function getLastSyncAttempt(): Promise<Date | null> {
  return withStores([META] as const, 'readonly', async ({ cache_meta }) => {
    const res = await cache_meta.get('last_sync_attempt');
    return res?.timestamp ? new Date(res.timestamp) : null;
  });
}

export async function setLastSyncAttempt(): Promise<void> {
  await withStores([META] as const, 'readwrite', async ({ cache_meta }) => {
    await cache_meta.put({ key: 'last_sync_attempt', timestamp: Date.now() });
  });
}

export async function getLastBackupTimestamp(): Promise<number> {
  return getMetaTimestamp('last_backup');
}

export async function setLastBackupTimestamp(timestamp: number): Promise<void> {
  await setMetaTimestamp('last_backup', timestamp);
}

export async function getSyncCurrentUid(): Promise<string | null> {
  return withStores([META] as const, 'readonly', async ({ cache_meta }) => {
    const res = await cache_meta.get('sync_current_uid');
    return typeof res?.timestamp === 'string' ? res.timestamp : null;
  });
}

export async function setSyncCurrentUid(uid: string): Promise<void> {
  await withStores([META] as const, 'readwrite', async ({ cache_meta }) => {
    await cache_meta.put({ key: 'sync_current_uid', timestamp: uid });
  });
}

export async function clearSyncCurrentUid(): Promise<void> {
  await withStores([META] as const, 'readwrite', async ({ cache_meta }) => {
    await cache_meta.delete('sync_current_uid');
  });
}

export async function getSyncInitializedForUid(uid: string): Promise<boolean> {
  const ts = await getMetaTimestamp(`sync_initialized_for_uid:${uid}`);
  return ts > 0;
}

export async function setSyncInitializedForUid(uid: string): Promise<void> {
  await setMetaTimestamp(`sync_initialized_for_uid:${uid}`, Date.now());
}

export async function getSyncLastSuccessAt(): Promise<number> {
  return getMetaTimestamp('sync_last_success_at');
}

export async function setSyncLastSuccessAt(timestamp = Date.now()): Promise<void> {
  await setMetaTimestamp('sync_last_success_at', timestamp);
}

export async function getSyncLastError(): Promise<string | null> {
  return withStores([META] as const, 'readonly', async ({ cache_meta }) => {
    const res = await cache_meta.get('sync_last_error');
    return typeof res?.timestamp === 'string' ? res.timestamp : null;
  });
}

export async function setSyncLastError(error: string): Promise<void> {
  await withStores([META] as const, 'readwrite', async ({ cache_meta }) => {
    await cache_meta.put({ key: 'sync_last_error', timestamp: error });
  });
}

export async function clearSyncLastError(): Promise<void> {
  await withStores([META] as const, 'readwrite', async ({ cache_meta }) => {
    await cache_meta.delete('sync_last_error');
  });
}
