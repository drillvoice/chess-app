import type { DailyGoalSettings, TrainingSession } from '@shared/schema';
import { offlineStorage } from '../offline-storage';
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
}

export interface MigrationSummary {
  localCount: number;
  cloudCount: number;
  mergedCount: number;
  uploadedCount: number;
  downloadedCount: number;
  collisionsResolved: number;
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
  if (value instanceof Date) return value;
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

function sessionRecency(session: Partial<TrainingSession> & { updatedAt?: any; date?: any }) {
  return (
    toDate(session.updatedAt)?.getTime() ??
    toDate(session.date)?.getTime() ??
    Number.NEGATIVE_INFINITY
  );
}

export function mergeSessionCollections(
  localSessions: TrainingSession[],
  cloudSessions: TrainingSession[],
): { merged: TrainingSession[]; collisionsResolved: number } {
  const map = new Map<number, TrainingSession>();
  let collisionsResolved = 0;

  for (const session of localSessions) {
    map.set(session.id, session);
  }

  for (const cloudSession of cloudSessions) {
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

function serializeSessionForCloud(session: TrainingSession) {
  return {
    ...session,
    date: Timestamp.fromDate(session.date),
    updatedAt: Timestamp.fromDate(toDate((session as any).updatedAt) ?? new Date()),
    deletedAt: toDate((session as any).deletedAt)
      ? Timestamp.fromDate(toDate((session as any).deletedAt)!)
      : null,
  };
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
    .filter((session) => Number.isFinite(session.id));
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
  const mergedValid = merged.filter((session) => Number.isFinite(session.id));
  publishStatus({
    phase: 'Merging local and cloud sessions',
    processed: 1,
    total: Math.max(1, mergedValid.length + 1),
    ...progressMetrics(1, Math.max(1, mergedValid.length + 1), migrationStart),
  });
  await offlineStorage.setSessions(mergedValid);

  let uploadedCount = 0;
  const uploadTotal = Math.max(1, mergedValid.length);
  for (const session of mergedValid) {
    const sessionDoc = doc(await getSessionsCollection(), session.id.toString());
    await setDoc(sessionDoc, serializeSessionForCloud(session), { merge: true });
    uploadedCount += 1;
    publishStatus({
      phase: 'Uploading merged sessions',
      processed: uploadedCount,
      total: uploadTotal,
      ...progressMetrics(uploadedCount, uploadTotal, migrationStart),
    });
  }

  if (isCloudNewer(localSettings, cloudSettings)) {
    await offlineStorage.setSettings(cloudSettings ?? {});
  } else if (localSettings) {
    const settingsRef = doc(db, 'users', uid, 'settings', 'settings');
    await setDoc(settingsRef, localSettings, { merge: true });
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
        .filter((session) => Number.isFinite(session.id));
      const activeSessions = remoteSessions.filter((session: any) => !session.deletedAt);
      publishStatus({
        state: 'syncing',
        phase: 'Applying latest cloud snapshot',
        processed: activeSessions.length,
        total: activeSessions.length,
        progressPct: 100,
        startedAt: new Date(startedAt),
        elapsedMs: 0,
        itemsPerSecond: null,
        lastBatchSize: activeSessions.length,
      });
      await offlineStorage.setSessions(activeSessions);
      await Promise.all([
        offlineStorage.setLastSyncedTimestamp(Date.now()),
        offlineStorage.setSyncLastSuccessAt(Date.now()),
        offlineStorage.clearSyncLastError(),
      ]);
      const elapsedMs = Date.now() - startedAt;
      const itemsPerSecond =
        activeSessions.length > 0
          ? Number((activeSessions.length / Math.max(0.001, elapsedMs / 1000)).toFixed(2))
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
      await offlineStorage.setSettings(snapshot.data());
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

  stopRealtimeSyncFn = () => {
    unsubscribeSessions();
    unsubscribeSettings();
    unsubscribeGoals();
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
  const sessionDoc = doc(await getSessionsCollection(), session.id.toString());
  await setDoc(sessionDoc, serializeSessionForCloud(session), { merge: true });
}

export async function markSessionDeletedInCloud(id: number): Promise<void> {
  await ensureFirebase();
  const uid = resolveUid();
  if (!uid) return;
  const deletedAt = new Date();
  const sessionDoc = doc(await getSessionsCollection(), id.toString());
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
  const sessionDoc = doc(await getSessionsCollection(), id.toString());
  await deleteDoc(sessionDoc);
}
