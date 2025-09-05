import { useQuery } from '@tanstack/react-query';

interface SyncStatus {
  unsyncedCount: number;
  lastSynced: Date | null;
  lastAttempt: Date | null;
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
      return {
        unsyncedCount: unsynced.length,
        lastSynced: lastSyncedTs ? new Date(lastSyncedTs) : null,
        lastAttempt,
      };
    },
    refetchInterval: 5000,
  });
}

export default useSyncStatus;

