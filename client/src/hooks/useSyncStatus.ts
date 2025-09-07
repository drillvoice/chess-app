import { useQuery } from '@tanstack/react-query';
import { getFirebaseAuth } from '@/lib/firebaseClient';

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
      const auth = await getFirebaseAuth();
      const user = auth.currentUser;
      let state: SyncState;
      if (!user || user.isAnonymous) {
        state = unsynced.length > 0 ? SyncState.Pending : SyncState.Disabled;
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
        lastSynced,
        lastAttempt,
        state,
      };
    },
    refetchInterval: 5000,
  });
}

export default useSyncStatus;
