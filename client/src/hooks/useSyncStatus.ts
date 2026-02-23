import { useQuery } from '@tanstack/react-query';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { getCloudSyncStatus } from '@/lib/firebase';

export enum SyncState {
  Disabled = 'disabled',
  Pending = 'pending',
  Syncing = 'syncing',
  Synced = 'synced',
}

interface SyncStatus {
  unsyncedCount: number;
  lastSynced: Date | null;
  lastAttempt: Date | null;
  state: SyncState;
  lastError?: string | null;
  phase?: string | null;
  processed?: number;
  total?: number;
  progressPct?: number;
  elapsedMs?: number | null;
  itemsPerSecond?: number | null;
  lastBatchSize?: number;
}

export function useSyncStatus() {
  return useQuery<SyncStatus>({
    queryKey: ['sync-status'],
    queryFn: async () => {
      const { offlineStorage } = await import('@/lib/offline-storage');
      const [unsynced, lastSyncedTs, lastAttempt] = await Promise.all([
        offlineStorage.getUnsyncedSessions(),
        offlineStorage.getLastSyncedTimestamp(),
        offlineStorage.getLastSyncAttempt(),
      ]);
      const cloudStatus = getCloudSyncStatus();
      const lastSynced = lastSyncedTs ? new Date(lastSyncedTs) : null;
      const auth = await getFirebaseAuth();
      const user = auth.currentUser;
      let state: SyncState;
      if (!user || user.isAnonymous || cloudStatus.state === 'disabled') {
        state = unsynced.length > 0 ? SyncState.Pending : SyncState.Disabled;
      } else if (cloudStatus.state === 'error') {
        state = SyncState.Pending;
      } else if (cloudStatus.state === 'syncing' || cloudStatus.state === 'initializing') {
        state = SyncState.Syncing;
      } else if (unsynced.length > 0) {
        if (lastAttempt && (!lastSynced || lastAttempt > lastSynced)) {
          state = SyncState.Syncing;
        } else {
          state = SyncState.Pending;
        }
      } else {
        state = SyncState.Synced;
      }
      return {
        unsyncedCount: unsynced.length,
        lastSynced: cloudStatus.lastSyncedAt ?? lastSynced,
        lastAttempt,
        state,
        lastError: cloudStatus.lastError,
        phase: cloudStatus.phase,
        processed: cloudStatus.processed,
        total: cloudStatus.total,
        progressPct: cloudStatus.progressPct,
        elapsedMs: cloudStatus.elapsedMs,
        itemsPerSecond: cloudStatus.itemsPerSecond,
        lastBatchSize: cloudStatus.lastBatchSize,
      };
    },
    refetchInterval: 30000,
  });
}

export default useSyncStatus;
