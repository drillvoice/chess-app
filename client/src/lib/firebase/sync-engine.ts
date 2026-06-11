import type { QuerySnapshot } from 'firebase/firestore';
import { type DailyGoalSettings, type TrainingSession } from '@shared/schema';
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
import {
  deserializeSessionFromCloud,
  normalizeSessionForSync,
  serializeSessionForCloud,
  toDate,
} from './sync/serialization';
import {
  areSameTagConfigs,
  areSameTagSet,
  isCloudNewer,
  mergeSessionCollections,
  mergeSettingsForSync,
  reconcileRealtimeSnapshot,
} from './sync/reconciliation';
import { backfillSessionsToCloud, type BackfillProgress } from './sync/backfill';
import {
  deserializeRepertoireFromCloud,
  reconcileRepertoireSnapshot,
  serializeRepertoireForCloud,
} from './sync/repertoire-sync';
import { logger } from '../logger';
import type { OpeningRepertoire } from '../opening-trainer/types';

export { mergeSessionCollections, mergeSettingsForSync, reconcileRealtimeSnapshot };

/**
 * Coerce a persisted/synced value to a finite number or undefined. Guards
 * against NaN/Infinity arriving from Firestore for optional numeric fields
 * (see CLAUDE.md: persisted numbers are untrusted input).
 */
function finiteOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

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
  failedUploadCount: number;
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

async function backfillLocalOnlySessionsToCloud(
  sessionsToUpload: TrainingSession[],
  options: BackfillOptions = {},
): Promise<{ uploadedCount: number; failedCount: number; failureSamples: string[] }> {
  return backfillSessionsToCloud(sessionsToUpload, upsertSessionToCloud, {
    ...options,
    onFailure: (detail, samples) => {
      publishStatus({ latestFailure: detail, failureSamples: samples });
    },
  });
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

async function fetchCloudSettings(uid: string): Promise<unknown> {
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
  let failedUploadCount = 0;
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
      failedUploadCount += 1;
      logger.warn(`Failed uploading merged session ${session.id} to cloud`, error);
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

  // Don't silently clear the error state when some uploads failed — surface it
  // so a partial migration is visible rather than reported as a clean sync.
  const uploadError =
    failedUploadCount > 0
      ? `${failedUploadCount} of ${mergedValid.length} sessions failed to upload during migration`
      : null;
  await Promise.all([
    offlineStorage.setSyncInitializedForUid(uid),
    offlineStorage.setSyncCurrentUid(uid),
    uploadError
      ? offlineStorage.setSyncLastError(uploadError)
      : offlineStorage.clearSyncLastError(),
  ]);
  if (uploadError) {
    logger.warn(uploadError);
  }

  publishStatus({
    state: uploadError ? 'error' : 'synced',
    phase: 'Migration complete',
    processed: uploadTotal,
    total: uploadTotal,
    ...progressMetrics(uploadTotal, uploadTotal, migrationStart),
    lastSyncedAt: new Date(),
    lastError: uploadError,
  });

  const summary: MigrationSummary = {
    localCount: localSessions.length,
    cloudCount: cloudSessions.length,
    mergedCount: mergedValid.length,
    uploadedCount,
    failedUploadCount,
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

  // onSnapshot can fire again before the previous async read-modify-write
  // (getSessions → reconcile → setSessions) finishes. Without serialization the
  // two runs interleave and the later setSessions clobbers the earlier one.
  // Chain each snapshot so they apply strictly in order.
  let sessionSnapshotChain: Promise<void> = Promise.resolve();
  const applySessionsSnapshot = async (snapshot: QuerySnapshot): Promise<void> => {
    {
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
              logger.info(
                `Cloud sync backfilled ${uploadedCount}/${localOnlyToUpload.length} local-only sessions after reconciliation`,
              );
              publishStatus({ backfilledCount: uploadedCount });
              if (failedCount > 0) {
                logger.warn(
                  `Cloud sync failed to backfill ${failedCount} local-only sessions after reconciliation`,
                );
              }
            },
          );
        });
      }
      if (tombstonedIds.length > 0) {
        logger.info(
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
    }
  };

  const handleSessionsSnapshotError = async (error: unknown): Promise<void> => {
    const message = error instanceof Error ? error.message : 'Session sync failed';
    await offlineStorage.setSyncLastError(message);
    publishStatus({ state: 'error', lastError: message });
  };

  const unsubscribeSessions = onSnapshot(
    query(sessionsRef),
    (snapshot) => {
      sessionSnapshotChain = sessionSnapshotChain
        .then(() => applySessionsSnapshot(snapshot))
        .catch(handleSessionsSnapshotError);
    },
    (error) => {
      void handleSessionsSnapshotError(error);
    },
  );

  const unsubscribeSettings = onSnapshot(
    settingsRef,
    async (snapshot) => {
      if (!snapshot.exists()) return;
      const localSettings = await offlineStorage.getSettings();
      const cloudSettings = snapshot.data();
      const mergedSettings = mergeSettingsForSync(localSettings, cloudSettings);
      await offlineStorage.setSettings(mergedSettings);

      const cloudStudyPreferences = cloudSettings?.studyPreferences as
        | Record<string, unknown>
        | undefined;
      const mergedStudyPreferences = mergedSettings?.studyPreferences as
        | Record<string, unknown>
        | undefined;
      const cloudTags = cloudStudyPreferences?.customTags;
      const mergedTags = mergedStudyPreferences?.customTags;
      const cloudTagConfigs = cloudStudyPreferences?.tagConfigs;
      const mergedTagConfigs = mergedStudyPreferences?.tagConfigs;
      if (
        !areSameTagSet(cloudTags, mergedTags) ||
        !areSameTagConfigs(cloudTagConfigs, mergedTagConfigs)
      ) {
        queueMicrotask(async () => {
          try {
            await setDoc(settingsRef, mergedSettings, { merge: true });
          } catch (error) {
            logger.warn('Failed to backfill merged study tags to cloud settings', error);
          }
        });
      }
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
        // These are optional numbers persisted in Firestore (untrusted input).
        // `?? fallback` would let a NaN/Infinity through; coerce non-finite
        // values to undefined so corruption can't reach goal arithmetic.
        tacticsMinutes: finiteOrUndefined(payload.tacticsMinutes),
        gamesCount: finiteOrUndefined(payload.gamesCount),
        studyMinutes: finiteOrUndefined(payload.studyMinutes),
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

  const unsubscribeRepertoires = onSnapshot(
    query(repertoiresCollection(uid)),
    async (snapshot) => {
      const remoteRepertoires = snapshot.docs.map((entry) =>
        deserializeRepertoireFromCloud({ ...entry.data(), id: entry.data()?.id ?? entry.id }),
      );
      const localRepertoires = await offlineStorage.getOpeningRepertoires();
      const { nextLocal, localOnlyToUpload } = reconcileRepertoireSnapshot(
        localRepertoires,
        remoteRepertoires,
      );
      await offlineStorage.setOpeningRepertoires(nextLocal);
      if (localOnlyToUpload.length > 0) {
        queueMicrotask(() => {
          Promise.all(
            localOnlyToUpload.map((repertoire) =>
              upsertRepertoireToCloud(repertoire).catch((error) => {
                logger.warn(`Failed to backfill repertoire ${repertoire.id} to cloud`, error);
              }),
            ),
          ).catch(() => {});
        });
      }
    },
    async (error) => {
      // Keep repertoire sync failures isolated from the primary session status.
      const message = error instanceof Error ? error.message : 'Repertoire sync failed';
      logger.warn('Cloud repertoire sync error:', message);
    },
  );

  const unsubscribeSessionsReplaced = sessionEvents.on('sessionsReplaced', () => {
    queueMicrotask(() => {
      backfillMissingLocalSessionsToCloud()
        .then(({ candidateCount, uploadedCount, failedCount }) => {
          if (candidateCount === 0) return;
          logger.info(
            `Cloud sync backfilled ${uploadedCount}/${candidateCount} sessions after a local bulk replace`,
          );
          publishStatus({ backfilledCount: uploadedCount });
          if (failedCount > 0) {
            logger.warn(
              `Cloud sync failed to backfill ${failedCount} local sessions after a local bulk replace`,
            );
          }
        })
        .catch((error) => {
          logger.warn('Cloud sync bulk-replace backfill failed:', error);
        });
    });
  });

  queueMicrotask(() => {
    backfillMissingLocalSessionsToCloud()
      .then(({ candidateCount, uploadedCount, failedCount }) => {
        if (candidateCount === 0) return;
        logger.info(
          `Cloud sync startup backfill uploaded ${uploadedCount}/${candidateCount} local-only sessions`,
        );
        publishStatus({ backfilledCount: uploadedCount });
        if (failedCount > 0) {
          logger.warn(`Cloud sync startup backfill failed for ${failedCount} sessions`);
        }
      })
      .catch((error) => {
        logger.warn('Cloud sync startup backfill failed:', error);
      });
  });

  stopRealtimeSyncFn = () => {
    unsubscribeSessions();
    unsubscribeSettings();
    unsubscribeGoals();
    unsubscribeRepertoires();
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

function repertoiresCollection(uid: string) {
  return collection(db, 'users', uid, 'openingRepertoires');
}

export async function upsertRepertoireToCloud(repertoire: OpeningRepertoire): Promise<void> {
  await ensureFirebase();
  const uid = resolveUid();
  if (!uid) return;
  const ref = doc(repertoiresCollection(uid), repertoire.id);
  await setDoc(ref, serializeRepertoireForCloud(repertoire), { merge: true });
}

export async function markRepertoireDeletedInCloud(id: string): Promise<void> {
  await ensureFirebase();
  const uid = resolveUid();
  if (!uid) return;
  const nowIso = new Date().toISOString();
  const ref = doc(repertoiresCollection(uid), id);
  await setDoc(ref, { id, deletedAt: nowIso, updatedAt: nowIso }, { merge: true });
}

async function fetchCloudRepertoires(uid: string): Promise<OpeningRepertoire[]> {
  const snapshot = await getDocs(query(repertoiresCollection(uid)));
  return snapshot.docs.map((item) =>
    deserializeRepertoireFromCloud({ ...item.data(), id: item.data()?.id ?? item.id }),
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
