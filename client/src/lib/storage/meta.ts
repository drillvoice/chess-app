import { withStores } from './transaction';

const META = 'cache_meta';

// cache_meta records historically stored their payload under a `timestamp`
// field, even when the payload was a string (uid, error message). Records now
// use a neutral `value` field; this reader falls back to the legacy field so
// existing on-device data keeps working until the record is next written.
function readMetaValue(
  res: { value?: number | string; timestamp?: number | string } | undefined,
): number | string | undefined {
  return res?.value ?? res?.timestamp;
}

async function getMetaNumber(key: string): Promise<number> {
  return withStores([META] as const, 'readonly', async ({ cache_meta }) => {
    const value = readMetaValue(await cache_meta.get(key));
    return typeof value === 'number' ? value : 0;
  });
}

async function getMetaString(key: string): Promise<string | null> {
  return withStores([META] as const, 'readonly', async ({ cache_meta }) => {
    const value = readMetaValue(await cache_meta.get(key));
    return typeof value === 'string' ? value : null;
  });
}

async function setMetaValue(key: string, value: number | string): Promise<void> {
  await withStores([META] as const, 'readwrite', async ({ cache_meta }) => {
    await cache_meta.put({ key, value });
  });
}

export async function getLastSyncedTimestamp(): Promise<number> {
  return getMetaNumber('sessions_last_synced');
}

export async function setLastSyncedTimestamp(timestamp: number): Promise<void> {
  await setMetaValue('sessions_last_synced', timestamp);
}

export async function getCacheAge(key: string): Promise<number> {
  return withStores([META] as const, 'readonly', async ({ cache_meta }) => {
    const value = readMetaValue(await cache_meta.get(key + '_last_updated'));
    if (typeof value !== 'number') {
      return Infinity;
    }
    return Date.now() - value;
  });
}

export async function getLastSyncAttempt(): Promise<Date | null> {
  const value = await getMetaNumber('last_sync_attempt');
  return value > 0 ? new Date(value) : null;
}

export async function setLastSyncAttempt(): Promise<void> {
  await setMetaValue('last_sync_attempt', Date.now());
}

export async function getLastBackupTimestamp(): Promise<number> {
  return getMetaNumber('last_backup');
}

export async function setLastBackupTimestamp(timestamp: number): Promise<void> {
  await setMetaValue('last_backup', timestamp);
}

export async function getSyncCurrentUid(): Promise<string | null> {
  return getMetaString('sync_current_uid');
}

export async function setSyncCurrentUid(uid: string): Promise<void> {
  await setMetaValue('sync_current_uid', uid);
}

export async function clearSyncCurrentUid(): Promise<void> {
  await withStores([META] as const, 'readwrite', async ({ cache_meta }) => {
    await cache_meta.delete('sync_current_uid');
  });
}

export async function getSyncInitializedForUid(uid: string): Promise<boolean> {
  const ts = await getMetaNumber(`sync_initialized_for_uid:${uid}`);
  return ts > 0;
}

export async function setSyncInitializedForUid(uid: string): Promise<void> {
  await setMetaValue(`sync_initialized_for_uid:${uid}`, Date.now());
}

export async function getSyncLastSuccessAt(): Promise<number> {
  return getMetaNumber('sync_last_success_at');
}

export async function setSyncLastSuccessAt(timestamp = Date.now()): Promise<void> {
  await setMetaValue('sync_last_success_at', timestamp);
}

export async function getSyncLastError(): Promise<string | null> {
  return getMetaString('sync_last_error');
}

export async function setSyncLastError(error: string): Promise<void> {
  await setMetaValue('sync_last_error', error);
}

export async function clearSyncLastError(): Promise<void> {
  await withStores([META] as const, 'readwrite', async ({ cache_meta }) => {
    await cache_meta.delete('sync_last_error');
  });
}
