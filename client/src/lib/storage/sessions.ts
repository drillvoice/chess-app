import { withStores } from './transaction';
import { parseStudyTags } from './study-tags';
import { logger } from '../logger';
import type { TrainingSession } from '@shared/schema';

const SESSIONS = 'sessions';
const META = 'cache_meta';
const QUEUE = 'sync_queue';

/**
 * Deserialize a raw IndexedDB record into a TrainingSession.
 *
 * IndexedDB stores `date` as an ISO string (see addSession/setSessions) and
 * `studyTags` as a JSON string. This function restores both to their runtime
 * types and normalises `needsReview` to a proper boolean.
 *
 * The `as TrainingSession` cast is intentional: the stored record is
 * structurally identical to TrainingSession for all other fields. The only
 * persistent mismatch is `studyTags` (schema says `string | null`; the app
 * always works with `string[]`), which parseStudyTags handles.
 */
function hydrateSession(raw: Record<string, unknown>): TrainingSession {
  const id = typeof raw.id === 'number' ? raw.id : 0;
  return {
    ...raw,
    date: new Date(raw.date as string),
    needsReview: Boolean(raw.needsReview),
    studyTags: parseStudyTags(raw.studyTags as string | null, id),
  } as TrainingSession;
}

export async function getSessions(): Promise<TrainingSession[]> {
  return withStores([SESSIONS] as const, 'readonly', async ({ sessions }) => {
    const all = await sessions.getAll();
    const mapped = (all as Record<string, unknown>[]).map(hydrateSession);
    mapped.sort((a, b) => b.date.getTime() - a.date.getTime());
    return mapped;
  });
}

export async function setSessions(sessionsList: TrainingSession[]): Promise<void> {
  await withStores([SESSIONS, META] as const, 'readwrite', async ({ sessions, cache_meta }) => {
    await sessions.clear();
    for (const session of sessionsList) {
      await sessions.add({ ...session, date: session.date.toISOString() });
    }
    await cache_meta.put({ key: 'sessions_last_updated', value: Date.now() });
  });
}

export async function mergeSessions(sessionsList: TrainingSession[]): Promise<void> {
  await withStores([SESSIONS, META] as const, 'readwrite', async ({ sessions, cache_meta }) => {
    for (const session of sessionsList) {
      await sessions.put({ ...session, date: session.date.toISOString() });
    }
    await cache_meta.put({ key: 'sessions_last_updated', value: Date.now() });
  });
}

export async function addSession(session: TrainingSession): Promise<void> {
  logger.debug('Adding session', session);
  await withStores([SESSIONS, META] as const, 'readwrite', async ({ sessions, cache_meta }) => {
    await sessions.put({ ...session, date: session.date.toISOString() });
    await cache_meta.put({ key: 'sessions_last_updated', value: Date.now() });
  });
}

export async function updateSession(
  id: number,
  updateData: Partial<TrainingSession>,
): Promise<TrainingSession | null> {
  return withStores([SESSIONS, META] as const, 'readwrite', async ({ sessions, cache_meta }) => {
    const existing = await sessions.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...updateData,
      date: updateData.date ? updateData.date.toISOString() : existing.date,
      updatedAt: new Date().toISOString(),
    };
    await sessions.put(updated);
    await cache_meta.put({ key: 'sessions_last_updated', value: Date.now() });

    return {
      ...updated,
      date: new Date(updated.date),
      updatedAt: new Date(updated.updatedAt),
      needsReview: Boolean(updated.needsReview),
      studyTags: parseStudyTags(updated.studyTags, id),
    } as TrainingSession;
  });
}

export async function getSession(id: number): Promise<TrainingSession | null> {
  return withStores([SESSIONS] as const, 'readonly', async ({ sessions }) => {
    const result = await sessions.get(id);
    if (!result) return null;

    return hydrateSession(result as Record<string, unknown>);
  });
}

export async function removeSession(id: number): Promise<void> {
  await withStores([SESSIONS] as const, 'readwrite', async ({ sessions }) => {
    await sessions.delete(id);
  });
}

export const deleteSession = removeSession;

// Sync queue helpers
interface UnsyncedSession {
  sessionId: number;
  operation: 'create' | 'update' | 'delete';
  timestamp: number;
  retries: number;
  updateData?: any;
}

export async function markAsUnsynced(
  sessionId: number,
  operation: 'create' | 'update' | 'delete',
  updateData?: any,
): Promise<void> {
  await withStores([QUEUE] as const, 'readwrite', async ({ sync_queue }) => {
    const item: UnsyncedSession = {
      sessionId,
      operation,
      timestamp: Date.now(),
      retries: 0,
      updateData,
    };
    await sync_queue.put(item);
  });
}

export async function markAsSynced(sessionId: number): Promise<void> {
  await withStores([QUEUE] as const, 'readwrite', async ({ sync_queue }) => {
    await sync_queue.delete(sessionId);
  });
}

export async function incrementSyncRetries(sessionId: number): Promise<void> {
  await withStores([QUEUE] as const, 'readwrite', async ({ sync_queue }) => {
    const item = await sync_queue.get(sessionId);
    if (item) {
      item.retries += 1;
      await sync_queue.put(item);
    }
  });
}

export async function getUnsyncedSessions(): Promise<UnsyncedSession[]> {
  return withStores([QUEUE] as const, 'readonly', async ({ sync_queue }) => {
    return (await sync_queue.getAll()) as UnsyncedSession[];
  });
}

export async function clearSessions(): Promise<void> {
  logger.info('Clearing all sessions from offline storage');
  await withStores([SESSIONS, META] as const, 'readwrite', async ({ sessions, cache_meta }) => {
    await sessions.clear();
    await cache_meta.delete('sessions_last_updated');
  });
}
