import { useQuery } from '@tanstack/react-query';

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
      const lastSynced = lastSyncedTs ? new Date(lastSyncedTs) : null;
      let state: SyncState;
      if (unsynced.length > 0) {
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
        lastSynced,
        lastAttempt,
        state,
      };
    },
    refetchInterval: 5000,
  });
}

export default useSyncStatus;
