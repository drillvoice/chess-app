import type { DailyGoalSettings, TrainingSession } from '@shared/schema';
import { offlineStorage } from '../offline-storage';
import { sessionEvents } from '../session-events';
import {
  auth,
  collection,
  db,
  deleteDoc,
  doc,
  ensureFirebase,
  getCurrentUserId,
  getDoc,
  getDocs,
  getSessionsCollection,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
} from './core';

type SyncState = 'disabled' | 'initializing' | 'syncing' | 'synced' | 'error';

export interface CloudSyncStatus {
  state: SyncState;
  currentUid: string | null;
  lastSyncedAt: Date | null;
  lastError: string | null;
  phase?: string | null;
  processed?: number;
  total?: number;
  progressPct?: number;
  startedAt?: Date | null;
  elapsedMs?: number | null;
  itemsPerSecond?: number | null;
  lastBatchSize?: number;
  reconciledLocalOnlyCount?: number;
  backfilledCount?: number;
  latestFailure?: string | null;
  failureSamples?: string[];
}

export interface MigrationSummary {
  localCount: number;
  cloudCount: number;
  mergedCount: number;
  uploadedCount: number;
  downloadedCount: number;
  collisionsResolved: number;
}

export interface BackfillSummary {
  candidateCount: number;
  uploadedCount: number;
  failedCount: number;
}

export interface ForceUploadSummary {
  totalLocalCount: number;
  uploadedCount: number;
  failedCount: number;
}

interface BackfillProgress {
  processed: number;
  total: number;
  uploadedCount: number;
  failedCount: number;
}

interface BackfillOptions {
  concurrency?: number;
  perItemTimeoutMs?: number;
  onProgress?: (progress: BackfillProgress) => void;
}

interface AccountSwitchPrompt {
  previousUid: string;
  nextUid: string;
}

let status: CloudSyncStatus = {
  state: 'disabled',
  currentUid: null,
  lastSyncedAt: null,
  lastError: null,
  phase: null,
  processed: 0,
  total: 0,
  progressPct: 0,
  startedAt: null,
  elapsedMs: null,
  itemsPerSecond: null,
  lastBatchSize: 0,
};

let stopRealtimeSyncFn: (() => void) | null = null;
let pendingAccountSwitch: AccountSwitchPrompt | null = null;

function resolveUid(): string | null {
  const uid = getCurrentUserId();
  if (uid) return uid;
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;
  return user.uid;
}

function publishStatus(next: Partial<CloudSyncStatus>) {
  status = { ...status, ...next };
  window.dispatchEvent(new CustomEvent('cloud-sync:status', { detail: status }));
}

function progressMetrics(processed: number, total: number, startedAt: number) {
  const now = Date.now();
  const elapsedMs = Math.max(1, now - startedAt);
  const safeTotal = Math.max(1, total);
  return {
    progressPct: Math.min(100, Math.round((processed / safeTotal) * 100)),
    elapsedMs,
    itemsPerSecond: Number((processed / (elapsedMs / 1000)).toFixed(2)),
  };
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object' && value && 'toDate' in (value as any)) {
    try {
      return (value as any).toDate();
    } catch {
      return null;
    }
  }
  return null;
}

function omitUndefinedFields<T extends Record<string, unknown>>(payload: T): T {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as T;
}

function formatSyncError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const code = (error as any)?.code;
    return code ? `${code}: ${error.message}` : error.message;
  }
  if (error && typeof error === 'object') {
    const code = (error as any)?.code;
    const message = (error as any)?.message;
    if (typeof code === 'string' && typeof message === 'string') {
      return `${code}: ${message}`;
    }
    if (typeof message === 'string') {
      return message;
    }
  }
  return 'Unknown sync error';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function sessionRecency(session: Partial<TrainingSession> & { updatedAt?: any; date?: any }) {
  return (
    toDate(session.updatedAt)?.getTime() ??
    toDate(session.date)?.getTime() ??
    Number.NEGATIVE_INFINITY
  );
}

function normalizeSessionId(id: unknown): number | null {
  if (typeof id === 'number' && Number.isFinite(id)) {
    return id;
  }
  if (typeof id === 'string' && id.trim().length > 0) {
    const parsed = Number(id);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeSessionForSync(session: TrainingSession): TrainingSession | null {
  const normalizedId = normalizeSessionId((session as any)?.id);
  if (normalizedId == null) {
    return null;
  }
  const normalizedDate = toDate((session as any)?.date);
  if (!normalizedDate) {
    return null;
  }

  return {
    ...session,
    id: normalizedId,
    date: normalizedDate,
    updatedAt: toDate((session as any)?.updatedAt) ?? undefined,
    deletedAt: toDate((session as any)?.deletedAt) ?? undefined,
    needsReview: Boolean((session as any)?.needsReview),
  } as TrainingSession;
}

export function mergeSessionCollections(
  localSessions: TrainingSession[],
  cloudSessions: TrainingSession[],
): { merged: TrainingSession[]; collisionsResolved: number } {
  const map = new Map<number, TrainingSession>();
  let collisionsResolved = 0;

  for (const rawSession of localSessions) {
    const session = normalizeSessionForSync(rawSession);
    if (!session) continue;
    map.set(session.id, session);
  }

  for (const rawCloudSession of cloudSessions) {
    const cloudSession = normalizeSessionForSync(rawCloudSession);
    if (!cloudSession) continue;
    const existing = map.get(cloudSession.id);
    if (!existing) {
      map.set(cloudSession.id, cloudSession);
      continue;
    }
    collisionsResolved += 1;
    if (sessionRecency(cloudSession) >= sessionRecency(existing)) {
      map.set(cloudSession.id, cloudSession);
    }
  }

  const merged = Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  return { merged, collisionsResolved };
}

export function reconcileRealtimeSnapshot(
  localSessions: TrainingSession[],
  remoteSessions: TrainingSession[],
): {
  nextLocal: TrainingSession[];
  localOnlyToUpload: TrainingSession[];
  tombstonedIds: number[];
} {
  const normalizedLocalSessions = localSessions
    .map((session) => normalizeSessionForSync(session))
    .filter((session): session is TrainingSession => Boolean(session));
  const normalizedRemoteSessions = remoteSessions
    .map((session) => normalizeSessionForSync(session))
    .filter((session): session is TrainingSession => Boolean(session));

  const tombstoneRecencyById = new Map<number, number>();
  for (const session of normalizedRemoteSessions) {
    if (!(session as any).deletedAt) continue;
    const deletedAtTs = toDate((session as any).deletedAt)?.getTime();
    const tombstoneRecency = deletedAtTs ?? sessionRecency(session);
    tombstoneRecencyById.set(session.id, tombstoneRecency);
  }

  const tombstonedIdSet = new Set(tombstoneRecencyById.keys());
  const remoteActive = normalizedRemoteSessions.filter(
    (session) => !tombstonedIdSet.has(session.id),
  );

  const localWithoutTombstones = normalizedLocalSessions.filter((session) => {
    const tombstoneRecency = tombstoneRecencyById.get(session.id);
    if (tombstoneRecency == null) return true;
    return sessionRecency(session) > tombstoneRecency;
  });

  const resurrectedIdSet = new Set(
    localWithoutTombstones
      .filter((session) => tombstoneRecencyById.has(session.id))
      .map((session) => session.id),
  );
  const tombstonedIds = Array.from(tombstoneRecencyById.keys()).filter(
    (id) => !resurrectedIdSet.has(id),
  );
  const effectiveTombstonedIdSet = new Set(tombstonedIds);

  const { merged } = mergeSessionCollections(localWithoutTombstones, remoteActive);
  const remoteActiveIds = new Set(remoteActive.map((session) => session.id));
  const localOnlyToUpload = merged.filter(
    (session) => !remoteActiveIds.has(session.id) && !effectiveTombstonedIdSet.has(session.id),
  );

  return { nextLocal: merged, localOnlyToUpload, tombstonedIds };
}

async function backfillLocalOnlySessionsToCloud(
  sessionsToUpload: TrainingSession[],
  options: BackfillOptions = {},
): Promise<{ uploadedCount: number; failedCount: number; failureSamples: string[] }> {
  const concurrency = options.concurrency ?? 4;
  const perItemTimeoutMs = options.perItemTimeoutMs ?? 15000;
  if (sessionsToUpload.length === 0) {
    return { uploadedCount: 0, failedCount: 0, failureSamples: [] };
  }

  const queue = [...sessionsToUpload];
  let uploadedCount = 0;
  let failedCount = 0;
  let processed = 0;
  const total = sessionsToUpload.length;
  const failureSamples: string[] = [];

  const emitProgress = () => {
    options.onProgress?.({
      processed,
      total,
      uploadedCount,
      failedCount,
    });
  };

  emitProgress();

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const session = queue.shift();
      if (!session) continue;
      try {
        await withTimeout(
          upsertSessionToCloud(session),
          perItemTimeoutMs,
          `Timed out uploading session ${session.id}`,
        );
        uploadedCount += 1;
      } catch (error) {
        failedCount += 1;
        const detail = `Session ${session.id}: ${formatSyncError(error)}`;
        if (failureSamples.length < 10 && !failureSamples.includes(detail)) {
          failureSamples.push(detail);
        }
        publishStatus({
          latestFailure: detail,
          failureSamples: [...failureSamples],
        });
        console.warn(`Failed to backfill local-only session ${session.id} to cloud`, error);
      } finally {
        processed += 1;
        emitProgress();
      }
    }
  });

  await Promise.all(workers);
  return { uploadedCount, failedCount, failureSamples };
}

function serializeSessionForCloud(session: TrainingSession) {
  const normalizedSession = normalizeSessionForSync(session);
  if (!normalizedSession) {
    throw new Error(`Session ${String((session as any)?.id)} is missing a valid id or date`);
  }

  return omitUndefinedFields({
    ...normalizedSession,
    date: Timestamp.fromDate(normalizedSession.date),
    updatedAt: Timestamp.fromDate(toDate((normalizedSession as any).updatedAt) ?? new Date()),
    deletedAt: toDate((normalizedSession as any).deletedAt)
      ? Timestamp.fromDate(toDate((normalizedSession as any).deletedAt)!)
      : null,
  });
}

function deserializeSessionFromCloud(payload: any): TrainingSession {
  const parsedId = typeof payload?.id === 'number' ? payload.id : Number(payload?.id);
  const updatedAt = toDate(payload.updatedAt);
  const deletedAt = toDate(payload.deletedAt);
  return {
    ...payload,
    id: parsedId,
    date: toDate(payload.date) ?? new Date(),
    updatedAt: updatedAt ?? undefined,
    deletedAt: deletedAt ?? undefined,
    needsReview: Boolean(payload.needsReview),
  } as TrainingSession;
}

async function fetchCloudSessions(uid: string): Promise<TrainingSession[]> {
  const sessionsRef = collection(db, 'users', uid, 'trainingSessions');
  const snapshot = await getDocs(query(sessionsRef));
  return snapshot.docs
    .map((item) =>
      deserializeSessionFromCloud({
        ...item.data(),
        id: item.data()?.id ?? item.id,
      }),
    )
    .map((session) => normalizeSessionForSync(session))
    .filter((session): session is TrainingSession => Boolean(session));
}

async function fetchCloudSettings(uid: string): Promise<any> {
  const settingsRef = doc(db, 'users', uid, 'settings', 'settings');
  const snapshot = await getDoc(settingsRef);
  return snapshot.exists() ? snapshot.data() : null;
}

async function fetchCloudDailyGoals(uid: string): Promise<DailyGoalSettings | null> {
  const goalsRef = doc(db, 'users', uid, 'settings', 'dailyGoals');
  const snapshot = await getDoc(goalsRef);
  if (!snapshot.exists()) return null;
  const payload = snapshot.data();
  return {
    ...payload,
    lastModified: toDate(payload.lastModified) ?? undefined,
  } as DailyGoalSettings;
}

function isCloudNewer(localValue: any, cloudValue: any): boolean {
  const localTs = toDate(localValue?.lastModified)?.getTime();
  const cloudTs = toDate(cloudValue?.lastModified)?.getTime();
  if (!localTs && cloudTs) return true;
  if (localTs && !cloudTs) return false;
  if (!localTs && !cloudTs) return true;
  return (cloudTs ?? 0) >= (localTs ?? 0);
}

function settingsTimestamp(value: any): number {
  const settingsTs = toDate(value?.lastModified)?.getTime() ?? Number.NEGATIVE_INFINITY;
  const studyPrefsTs =
    toDate(value?.studyPreferences?.lastModified)?.getTime() ?? Number.NEGATIVE_INFINITY;
  return Math.max(settingsTs, studyPrefsTs);
}

function studyPreferencesTimestamp(value: any): number {
  return toDate(value?.lastModified)?.getTime() ?? Number.NEGATIVE_INFINITY;
}

export function mergeSettingsForSync(localSettings: any, cloudSettings: any): any {
  const local = localSettings && typeof localSettings === 'object' ? localSettings : {};
  const cloud = cloudSettings && typeof cloudSettings === 'object' ? cloudSettings : {};
  const preferCloud = settingsTimestamp(cloud) >= settingsTimestamp(local);
  const merged = preferCloud ? { ...local, ...cloud } : { ...cloud, ...local };

  const localStudyPreferences =
    local.studyPreferences && typeof local.studyPreferences === 'object'
      ? local.studyPreferences
      : null;
  const cloudStudyPreferences =
    cloud.studyPreferences && typeof cloud.studyPreferences === 'object'
      ? cloud.studyPreferences
      : null;

  if (localStudyPreferences && !cloudStudyPreferences) {
    merged.studyPreferences = localStudyPreferences;
  } else if (!localStudyPreferences && cloudStudyPreferences) {
    merged.studyPreferences = cloudStudyPreferences;
  } else if (localStudyPreferences && cloudStudyPreferences) {
    const preferCloudStudyPreferences =
      studyPreferencesTimestamp(cloudStudyPreferences) >=
      studyPreferencesTimestamp(localStudyPreferences);
    merged.studyPreferences = preferCloudStudyPreferences
      ? cloudStudyPreferences
      : localStudyPreferences;
  }

  return merged;
}

export function getCloudSyncStatus(): CloudSyncStatus {
  return status;
}

export function getPendingAccountSwitch(): AccountSwitchPrompt | null {
  return pendingAccountSwitch;
}

export async function acknowledgeAccountSwitch(keepSeparate = true): Promise<void> {
  if (!pendingAccountSwitch) return;
  const previousUid = pendingAccountSwitch.previousUid;
  pendingAccountSwitch = null;

  if (keepSeparate) {
    const [sessions, settings, dailyGoals] = await Promise.all([
      offlineStorage.getSessions(),
      offlineStorage.getSettings(),
      offlineStorage.getDailyGoalSettings(),
    ]);

    await offlineStorage.createAccountSnapshot(previousUid, {
      sessions,
      settings,
      dailyGoals,
    });
  }

  await Promise.all([
    offlineStorage.clearSessions(),
    offlineStorage.clearSettings(),
    offlineStorage.clearDailyGoalSettings(),
    offlineStorage.clearStatistics(),
  ]);
}

export async function stopRealtimeSync(): Promise<void> {
  stopRealtimeSyncFn?.();
  stopRealtimeSyncFn = null;
  publishStatus({
    state: 'disabled',
    currentUid: null,
    phase: null,
    processed: 0,
    total: 0,
    progressPct: 0,
    startedAt: null,
    elapsedMs: null,
    itemsPerSecond: null,
    lastBatchSize: 0,
  });
}

export async function runInitialMergeMigration(): Promise<MigrationSummary> {
  await ensureFirebase();
  const uid = resolveUid();
  if (!uid) {
    throw new Error('Cannot run migration without authenticated user');
  }

  const migrationStart = Date.now();
  publishStatus({
    state: 'syncing',
    currentUid: uid,
    phase: 'Loading local and cloud data',
    processed: 0,
    total: 1,
    progressPct: 0,
    startedAt: new Date(migrationStart),
    elapsedMs: 0,
    itemsPerSecond: 0,
  });

  const [localSessions, cloudSessions, localSettings, cloudSettings, localGoals, cloudGoals] =
    await Promise.all([
      offlineStorage.getSessions(),
      fetchCloudSessions(uid),
      offlineStorage.getSettings(),
      fetchCloudSettings(uid),
      offlineStorage.getDailyGoalSettings(),
      fetchCloudDailyGoals(uid),
    ]);

  const { merged, collisionsResolved } = mergeSessionCollections(localSessions, cloudSessions);
  const mergedValid = merged
    .map((session) => normalizeSessionForSync(session))
    .filter((session): session is TrainingSession => Boolean(session));
  publishStatus({
    phase: 'Merging local and cloud sessions',
    processed: 1,
    total: Math.max(1, mergedValid.length + 1),
    ...progressMetrics(1, Math.max(1, mergedValid.length + 1), migrationStart),
  });
  await offlineStorage.setSessions(mergedValid);

  let uploadedCount = 0;
  let processedCount = 0;
  const uploadTotal = Math.max(1, mergedValid.length);
  for (const session of mergedValid) {
    const inFlightIndex = processedCount + 1;
    publishStatus({
      phase: `Uploading merged sessions (${inFlightIndex}/${uploadTotal})`,
      processed: processedCount,
      total: uploadTotal,
      ...progressMetrics(processedCount, uploadTotal, migrationStart),
    });

    try {
      const sessionDoc = doc(await getSessionsCollection(uid), session.id.toString());
      await setDoc(sessionDoc, serializeSessionForCloud(session), { merge: true });
      uploadedCount += 1;
    } catch (error) {
      console.warn(`Failed uploading merged session ${session.id} to cloud`, error);
    }
    processedCount = inFlightIndex;

    publishStatus({
      phase: 'Uploading merged sessions',
      processed: processedCount,
      total: uploadTotal,
      ...progressMetrics(processedCount, uploadTotal, migrationStart),
    });
  }

  const mergedSettings = mergeSettingsForSync(localSettings, cloudSettings);
  await offlineStorage.setSettings(mergedSettings);
  if (Object.keys(mergedSettings).length > 0) {
    const settingsRef = doc(db, 'users', uid, 'settings', 'settings');
    await setDoc(settingsRef, mergedSettings, { merge: true });
  }

  if (isCloudNewer(localGoals, cloudGoals)) {
    if (cloudGoals) {
      await offlineStorage.setDailyGoalSettings(cloudGoals);
    }
  } else if (localGoals) {
    const goalsRef = doc(db, 'users', uid, 'settings', 'dailyGoals');
    await setDoc(
      goalsRef,
      {
        ...localGoals,
        lastModified: Timestamp.fromDate(toDate(localGoals.lastModified) ?? new Date()),
      },
      { merge: true },
    );
  }

  await Promise.all([
    offlineStorage.setSyncInitializedForUid(uid),
    offlineStorage.setSyncCurrentUid(uid),
    offlineStorage.clearSyncLastError(),
  ]);

  publishStatus({
    state: 'synced',
    phase: 'Migration complete',
    processed: uploadTotal,
    total: uploadTotal,
    ...progressMetrics(uploadTotal, uploadTotal, migrationStart),
    lastSyncedAt: new Date(),
  });

  const summary: MigrationSummary = {
    localCount: localSessions.length,
    cloudCount: cloudSessions.length,
    mergedCount: mergedValid.length,
    uploadedCount,
    downloadedCount: cloudSessions.length,
    collisionsResolved,
  };

  return summary;
}

export async function backfillMissingLocalSessionsToCloud(
  concurrency = 4,
): Promise<BackfillSummary> {
  await ensureFirebase();
  const uid = resolveUid();
  if (!uid) {
    return { candidateCount: 0, uploadedCount: 0, failedCount: 0 };
  }

  const [localSessions, remoteSessions] = await Promise.all([
    offlineStorage.getSessions(),
    fetchCloudSessions(uid),
  ]);
  const { localOnlyToUpload } = reconcileRealtimeSnapshot(localSessions, remoteSessions);
  const { uploadedCount, failedCount } = await backfillLocalOnlySessionsToCloud(localOnlyToUpload, {
    concurrency,
  });

  return {
    candidateCount: localOnlyToUpload.length,
    uploadedCount,
    failedCount,
  };
}

export async function forceUploadAllLocalSessionsToCloud(
  options: BackfillOptions = {},
): Promise<ForceUploadSummary> {
  await ensureFirebase();
  const uid = resolveUid();
  if (!uid) {
    throw new Error('Cannot upload sessions without authenticated user');
  }

  const localSessions = await offlineStorage.getSessions();
  const normalizedLocal = localSessions
    .map((session) => normalizeSessionForSync(session))
    .filter((session): session is TrainingSession => Boolean(session));
  const repairStart = Date.now();
  publishStatus({
    state: 'syncing',
    currentUid: uid,
    phase: 'Repairing cloud data',
    processed: 0,
    total: normalizedLocal.length,
    progressPct: 0,
    startedAt: new Date(repairStart),
    elapsedMs: 0,
    itemsPerSecond: 0,
    lastError: null,
    latestFailure: null,
    failureSamples: [],
  });
  const { uploadedCount, failedCount, failureSamples } = await backfillLocalOnlySessionsToCloud(
    normalizedLocal,
    {
      ...options,
      onProgress: (progress) => {
        options.onProgress?.(progress);
        publishStatus({
          state: 'syncing',
          currentUid: uid,
          phase: 'Repairing cloud data',
          processed: progress.processed,
          total: progress.total,
          ...progressMetrics(progress.processed, Math.max(1, progress.total), repairStart),
        });
      },
    },
  );

  publishStatus({
    state: failedCount > 0 ? 'error' : 'synced',
    currentUid: uid,
    phase: failedCount > 0 ? 'Cloud repair completed with errors' : 'Cloud repair complete',
    processed: normalizedLocal.length,
    total: normalizedLocal.length,
    ...progressMetrics(normalizedLocal.length, Math.max(1, normalizedLocal.length), repairStart),
    lastSyncedAt: failedCount > 0 ? status.lastSyncedAt : new Date(),
    lastError: failedCount > 0 ? `${failedCount} sessions failed during cloud repair` : null,
    latestFailure: failedCount > 0 ? (failureSamples[0] ?? status.latestFailure ?? null) : null,
    failureSamples: failedCount > 0 ? failureSamples : [],
  });

  return {
    totalLocalCount: normalizedLocal.length,
    uploadedCount,
    failedCount,
  };
}

export async function startRealtimeSync(): Promise<() => void> {
  await ensureFirebase();
  const uid = resolveUid();
  if (!uid) {
    throw new Error('Cannot start sync without authenticated user');
  }

  stopRealtimeSyncFn?.();
  publishStatus({
    state: 'syncing',
    currentUid: uid,
    lastError: null,
    phase: 'Starting realtime listeners',
    processed: 0,
    total: 0,
    progressPct: 0,
    startedAt: new Date(),
    elapsedMs: 0,
    itemsPerSecond: 0,
  });

  const sessionsRef = collection(db, 'users', uid, 'trainingSessions');
  const settingsRef = doc(db, 'users', uid, 'settings', 'settings');
  const goalsRef = doc(db, 'users', uid, 'settings', 'dailyGoals');

  const unsubscribeSessions = onSnapshot(
    query(sessionsRef),
    async (snapshot) => {
      const startedAt = Date.now();
      const remoteSessions = snapshot.docs
        .map((entry) =>
          deserializeSessionFromCloud({
            ...entry.data(),
            id: entry.data()?.id ?? entry.id,
          }),
        )
        .map((session) => normalizeSessionForSync(session))
        .filter((session): session is TrainingSession => Boolean(session));
      const localSessions = await offlineStorage.getSessions();
      const { nextLocal, localOnlyToUpload, tombstonedIds } = reconcileRealtimeSnapshot(
        localSessions,
        remoteSessions,
      );
      publishStatus({
        state: 'syncing',
        phase: 'Applying latest cloud snapshot',
        processed: nextLocal.length,
        total: nextLocal.length,
        progressPct: 100,
        startedAt: new Date(startedAt),
        elapsedMs: Date.now() - startedAt,
        itemsPerSecond: null,
        lastBatchSize: nextLocal.length,
        reconciledLocalOnlyCount: localOnlyToUpload.length,
      });
      await offlineStorage.setSessions(nextLocal);
      await Promise.all([
        offlineStorage.setLastSyncedTimestamp(Date.now()),
        offlineStorage.setSyncLastSuccessAt(Date.now()),
        offlineStorage.clearSyncLastError(),
      ]);
      if (localOnlyToUpload.length > 0) {
        queueMicrotask(() => {
          backfillLocalOnlySessionsToCloud(localOnlyToUpload).then(
            ({ uploadedCount, failedCount }) => {
              console.info(
                `Cloud sync backfilled ${uploadedCount}/${localOnlyToUpload.length} local-only sessions after reconciliation`,
              );
              publishStatus({ backfilledCount: uploadedCount });
              if (failedCount > 0) {
                console.warn(
                  `Cloud sync failed to backfill ${failedCount} local-only sessions after reconciliation`,
                );
              }
            },
          );
        });
      }
      if (tombstonedIds.length > 0) {
        console.info(
          `Cloud sync applied ${tombstonedIds.length} tombstones from cloud snapshot`,
          tombstonedIds,
        );
      }
      const elapsedMs = Date.now() - startedAt;
      const itemsPerSecond =
        nextLocal.length > 0
          ? Number((nextLocal.length / Math.max(0.001, elapsedMs / 1000)).toFixed(2))
          : 0;
      publishStatus({
        state: 'synced',
        phase: 'Realtime sync idle',
        lastSyncedAt: new Date(),
        elapsedMs,
        itemsPerSecond,
      });
    },
    async (error) => {
      const message = error instanceof Error ? error.message : 'Session sync failed';
      await offlineStorage.setSyncLastError(message);
      publishStatus({ state: 'error', lastError: message });
    },
  );

  const unsubscribeSettings = onSnapshot(
    settingsRef,
    async (snapshot) => {
      if (!snapshot.exists()) return;
      const localSettings = await offlineStorage.getSettings();
      const mergedSettings = mergeSettingsForSync(localSettings, snapshot.data());
      await offlineStorage.setSettings(mergedSettings);
    },
    async (error) => {
      const message = error instanceof Error ? error.message : 'Settings sync failed';
      await offlineStorage.setSyncLastError(message);
      publishStatus({ state: 'error', lastError: message });
    },
  );

  const unsubscribeGoals = onSnapshot(
    goalsRef,
    async (snapshot) => {
      if (!snapshot.exists()) return;
      const payload = snapshot.data();
      const normalizedGoals: DailyGoalSettings = {
        isCustomized: Boolean(payload.isCustomized),
        autoTracking: Boolean(payload.autoTracking),
        tacticsMinutes: payload.tacticsMinutes,
        gamesCount: payload.gamesCount,
        studyMinutes: payload.studyMinutes,
        lastModified: toDate(payload.lastModified) ?? undefined,
      };
      await offlineStorage.setDailyGoalSettings({
        ...normalizedGoals,
      });
    },
    async (error) => {
      const message = error instanceof Error ? error.message : 'Daily goals sync failed';
      await offlineStorage.setSyncLastError(message);
      publishStatus({ state: 'error', lastError: message });
    },
  );

  const unsubscribeSessionsReplaced = sessionEvents.on('sessionsReplaced', () => {
    queueMicrotask(() => {
      backfillMissingLocalSessionsToCloud()
        .then(({ candidateCount, uploadedCount, failedCount }) => {
          if (candidateCount === 0) return;
          console.info(
            `Cloud sync backfilled ${uploadedCount}/${candidateCount} sessions after a local bulk replace`,
          );
          publishStatus({ backfilledCount: uploadedCount });
          if (failedCount > 0) {
            console.warn(
              `Cloud sync failed to backfill ${failedCount} local sessions after a local bulk replace`,
            );
          }
        })
        .catch((error) => {
          console.warn('Cloud sync bulk-replace backfill failed:', error);
        });
    });
  });

  queueMicrotask(() => {
    backfillMissingLocalSessionsToCloud()
      .then(({ candidateCount, uploadedCount, failedCount }) => {
        if (candidateCount === 0) return;
        console.info(
          `Cloud sync startup backfill uploaded ${uploadedCount}/${candidateCount} local-only sessions`,
        );
        publishStatus({ backfilledCount: uploadedCount });
        if (failedCount > 0) {
          console.warn(`Cloud sync startup backfill failed for ${failedCount} sessions`);
        }
      })
      .catch((error) => {
        console.warn('Cloud sync startup backfill failed:', error);
      });
  });

  stopRealtimeSyncFn = () => {
    unsubscribeSessions();
    unsubscribeSettings();
    unsubscribeGoals();
    unsubscribeSessionsReplaced();
  };

  return stopRealtimeSyncFn;
}

export async function initializeCloudSyncForCurrentUser(): Promise<MigrationSummary | null> {
  await ensureFirebase();
  const user = auth.currentUser;

  if (!user || user.isAnonymous) {
    await stopRealtimeSync();
    return null;
  }

  publishStatus({ state: 'initializing', currentUid: user.uid, lastError: null });

  const previousUid = await offlineStorage.getSyncCurrentUid();
  if (previousUid && previousUid !== user.uid) {
    pendingAccountSwitch = { previousUid, nextUid: user.uid };
    publishStatus({
      state: 'error',
      lastError: 'Account switch detected. Confirm before syncing.',
    });
    return null;
  }

  let migrationSummary: MigrationSummary | null = null;
  if (!(await offlineStorage.getSyncInitializedForUid(user.uid))) {
    migrationSummary = await runInitialMergeMigration();
  } else {
    await offlineStorage.setSyncCurrentUid(user.uid);
  }

  await startRealtimeSync();
  return migrationSummary;
}

export async function upsertSessionToCloud(session: TrainingSession): Promise<void> {
  await ensureFirebase();
  const uid = resolveUid();
  if (!uid) return;
  const sessionDoc = doc(await getSessionsCollection(uid), session.id.toString());
  await setDoc(sessionDoc, serializeSessionForCloud(session), { merge: true });
}

export async function markSessionDeletedInCloud(id: number): Promise<void> {
  await ensureFirebase();
  const uid = resolveUid();
  if (!uid) return;
  const deletedAt = new Date();
  const sessionDoc = doc(await getSessionsCollection(uid), id.toString());
  await setDoc(
    sessionDoc,
    {
      id,
      deletedAt: Timestamp.fromDate(deletedAt),
      updatedAt: Timestamp.fromDate(deletedAt),
    },
    { merge: true },
  );
}

export async function syncSettingsToCloud(settings: Record<string, unknown>): Promise<void> {
  await ensureFirebase();
  const uid = resolveUid();
  if (!uid) return;
  const settingsRef = doc(db, 'users', uid, 'settings', 'settings');
  await setDoc(settingsRef, settings, { merge: true });
}

export async function syncDailyGoalsToCloud(settings: DailyGoalSettings): Promise<void> {
  await ensureFirebase();
  const uid = resolveUid();
  if (!uid) return;
  const goalsRef = doc(db, 'users', uid, 'settings', 'dailyGoals');
  await setDoc(
    goalsRef,
    {
      ...settings,
      lastModified: Timestamp.fromDate(toDate(settings.lastModified) ?? new Date()),
    },
    { merge: true },
  );
}

export async function fetchSessionsFromCloudForVerification(): Promise<TrainingSession[]> {
  await ensureFirebase();
  const uid = resolveUid();
  if (!uid) return [];
  return fetchCloudSessions(uid);
}

export async function hardDeleteSessionFromCloud(id: number): Promise<void> {
  await ensureFirebase();
  const uid = resolveUid();
  if (!uid) return;
  const sessionDoc = doc(await getSessionsCollection(uid), id.toString());
  await deleteDoc(sessionDoc);
}
