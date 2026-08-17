import { withStores } from './transaction';
import { parseTagList } from './study-tags';
import { logger } from '../logger';
import type { TrainingSession } from '@shared/schema';

const SESSIONS = 'sessions';
const META = 'cache_meta';
const QUEUE = 'sync_queue';

/**
 * Deserialize a raw IndexedDB record into a TrainingSession, healing
 * corruption on read (the same pattern as normalizeRepertoire for openings).
 *
 * IndexedDB stores `date` as an ISO string (see addSession/setSessions) and the
 * tag-list fields (`studyTags`, `mistakeTags`) as JSON strings. This function
 * restores them to their runtime types, normalises `needsReview` to a proper
 * boolean, and coerces any non-finite numeric field to undefined —
 * persisted/synced numbers are untrusted input, and a NaN reaching date math or
 * aggregation is the bug class CLAUDE.md warns about.
 *
 * The `as TrainingSession` cast is intentional: the stored record is
 * structurally identical to TrainingSession for all other fields. The only
 * persistent mismatches are the tag lists (schema says `string | null`; the app
 * always works with `string[]`), which parseTagList handles.
 */
const NUMERIC_SESSION_FIELDS = [
  'duration',
  'pointsGained',
  'finalScore',
  'puzzlesAttempted',
  'puzzlesCorrect',
  'quantity',
] as const;

function hydrateSession(raw: Record<string, unknown>): TrainingSession {
  const id = typeof raw.id === 'number' ? raw.id : 0;
  const session: Record<string, unknown> = {
    ...raw,
    date: hydrateDate(raw.date, id),
    needsReview: Boolean(raw.needsReview),
    studyTags: parseTagList(raw.studyTags as string | null, id, 'studyTags'),
    mistakeTags: parseTagList(raw.mistakeTags as string | null, id, 'mistakeTags'),
  };
  for (const field of NUMERIC_SESSION_FIELDS) {
    const value = session[field];
    if (value != null && (typeof value !== 'number' || !Number.isFinite(value))) {
      logger.warn(`Session ${id} has a non-finite ${field}; dropping it`, { value });
      session[field] = undefined;
    }
  }
  // goalWeekStart is a secondary timestamp; unlike `date` it is optional, so a
  // corrupt value is dropped rather than defaulted.
  if (
    session.goalWeekStart != null &&
    Number.isNaN(new Date(session.goalWeekStart as string).getTime())
  ) {
    logger.warn(`Session ${id} has an invalid goalWeekStart; dropping it`, {
      value: session.goalWeekStart,
    });
    session.goalWeekStart = undefined;
  }
  return session as TrainingSession;
}

/**
 * Restore a persisted `date` to a valid Date. A corrupt value (e.g. an
 * unparseable string) would otherwise yield an Invalid Date, and the next
 * `.toISOString()` on it throws "Invalid time value". Heal on read by falling
 * back to now() and logging with context so the corruption stays visible.
 */
function hydrateDate(value: unknown, sessionId: number): Date {
  const parsed = new Date(value as string);
  if (Number.isNaN(parsed.getTime())) {
    logger.warn(`Session ${sessionId} has an invalid date; falling back to now()`, { value });
    return new Date();
  }
  return parsed;
}

export async function getSessions(): Promise<TrainingSession[]> {
  return withStores([SESSIONS] as const, 'readonly', async ({ sessions }) => {
    const all = await sessions.getAll();
    const mapped = (all as Record<string, unknown>[]).map(hydrateSession);
    mapped.sort((a, b) => b.date.getTime() - a.date.getTime());
    return mapped;
  });
}

function serializeSession(session: TrainingSession): Record<string, unknown> {
  return { ...session, date: session.date.toISOString() };
}

/**
 * Stable identity for a stored record, used to spot sessions a snapshot left
 * untouched. Keys are sorted because a record's property order depends on
 * which write path created it (addSession, updateSession, a cloud snapshot),
 * so raw JSON.stringify would report identical records as different.
 */
function recordSignature(record: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(record)
      .sort()
      .map((key) => [key, record[key]]),
  );
}

/**
 * Replace the stored sessions with `sessionsList`, writing only what actually
 * differs.
 *
 * This used to clear the store and re-add every session, awaiting each `add`
 * in turn — one IndexedDB round trip per session, inside a single readwrite
 * transaction that also locks `cache_meta`. Realtime sync calls this on every
 * cloud snapshot, including the echo of the app's own write and snapshots that
 * change nothing, so an unrelated foreground write that needs `cache_meta`
 * (saving settings, e.g. adding a tag) had to queue behind a full rewrite of
 * the user's entire history. Diffing first makes the common snapshot a no-op
 * and the usual one a single put.
 */
export async function setSessions(sessionsList: TrainingSession[]): Promise<void> {
  const next = sessionsList.map(serializeSession);

  // Diff outside the write transaction so the readwrite lock is held only for
  // the writes themselves, never for the read and comparison.
  const existing = await withStores([SESSIONS] as const, 'readonly', async ({ sessions }) => {
    return (await sessions.getAll()) as Record<string, unknown>[];
  });

  const existingSignatures = new Map(
    existing.map((record) => [record.id as number, recordSignature(record)]),
  );

  const nextIds = new Set<number>();
  const changed: Record<string, unknown>[] = [];
  for (const record of next) {
    const id = record.id as number;
    nextIds.add(id);
    if (existingSignatures.get(id) !== recordSignature(record)) {
      changed.push(record);
    }
  }
  const removedIds = Array.from(existingSignatures.keys()).filter((id) => !nextIds.has(id));

  if (changed.length === 0 && removedIds.length === 0) return;

  await withStores([SESSIONS, META] as const, 'readwrite', async ({ sessions, cache_meta }) => {
    // Issue every request up front rather than awaiting each in turn: IndexedDB
    // pipelines them within the transaction, so this is one round trip instead
    // of one per session.
    await Promise.all([
      ...removedIds.map((id) => sessions.delete(id)),
      ...changed.map((record) => sessions.put(record as never)),
      cache_meta.put({ key: 'sessions_last_updated', value: Date.now() }),
    ]);
  });
}

export async function mergeSessions(sessionsList: TrainingSession[]): Promise<void> {
  await withStores([SESSIONS, META] as const, 'readwrite', async ({ sessions, cache_meta }) => {
    await Promise.all([
      ...sessionsList.map((session) => sessions.put(serializeSession(session) as never)),
      cache_meta.put({ key: 'sessions_last_updated', value: Date.now() }),
    ]);
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
      studyTags: parseTagList(updated.studyTags, id, 'studyTags'),
      mistakeTags: parseTagList(updated.mistakeTags, id, 'mistakeTags'),
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
