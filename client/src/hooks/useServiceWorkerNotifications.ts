// hooks/useServiceWorkerNotifications.ts
import { logger } from '@/lib/logger';
import { useEffect, useState } from 'react';

interface NotificationState {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  timestamp: number;
}

export function useServiceWorkerNotifications() {
  const [notification, setNotification] = useState<NotificationState | null>(null);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    hasPendingSync: boolean;
    lastSyncTime?: number;
  }>({ hasPendingSync: false });

  useEffect(() => {
    // Handler for offline sessions synced
    const handleOfflineSync = (event: CustomEvent) => {
      setNotification({
        message: `${event.detail.count} offline session(s) synchronized!`,
        type: 'success',
        timestamp: Date.now(),
      });
      setSyncStatus((prev) => ({ ...prev, hasPendingSync: false, lastSyncTime: Date.now() }));

      // Auto-clear after 5 seconds
      setTimeout(() => setNotification(null), 5000);
    };

    // Handler for sync failures
    const handleSyncFailed = (_event: CustomEvent) => {
      setNotification({
        message: 'Some offline sessions failed to sync. Will retry automatically.',
        type: 'warning',
        timestamp: Date.now(),
      });
      setTimeout(() => setNotification(null), 8000);
    };

    // Handler for fresh data
    const handleFreshData = (event: CustomEvent) => {
      // Could trigger data refresh in your app
      logger.debug('Fresh data available for:', event.detail.endpoint);
      // Optionally show subtle notification
      // setNotification({
      //   message: 'Data updated',
      //   type: 'info',
      //   timestamp: Date.now()
      // });
    };

    // Handler for offline session stored
    const handleOfflineStore = (_event: CustomEvent) => {
      setNotification({
        message: 'Session saved offline - will sync when online',
        type: 'info',
        timestamp: Date.now(),
      });
      setSyncStatus((prev) => ({ ...prev, hasPendingSync: true }));
      setTimeout(() => setNotification(null), 4000);
    };

    // Handler for app updates
    const handleAppUpdate = (event: CustomEvent) => {
      setNotification({
        message: event.detail.message,
        type: 'info',
        timestamp: Date.now(),
      });
      // Don't auto-clear this one
    };

    // Handler for SW updates
    const handleSWUpdate = () => {
      setIsUpdateAvailable(true);
    };

    // Handler for storage persistence status
    const handleStorageStatus = (event: CustomEvent) => {
      if (!event.detail.persistent) {
        setNotification({
          message: 'Limited offline storage - data may be cleared by browser',
          type: 'warning',
          timestamp: Date.now(),
        });
        setTimeout(() => setNotification(null), 10000);
      }
    };

    // Add event listeners
    window.addEventListener('offline-sessions-synced', handleOfflineSync as EventListener);
    window.addEventListener('sync-failed', handleSyncFailed as EventListener);
    window.addEventListener('fresh-data-available', handleFreshData as EventListener);
    window.addEventListener('session-stored-offline', handleOfflineStore as EventListener);
    window.addEventListener('app-updated', handleAppUpdate as EventListener);
    window.addEventListener('sw-update-available', handleSWUpdate);
    window.addEventListener('storage-persistence-status', handleStorageStatus as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('offline-sessions-synced', handleOfflineSync as EventListener);
      window.removeEventListener('sync-failed', handleSyncFailed as EventListener);
      window.removeEventListener('fresh-data-available', handleFreshData as EventListener);
      window.removeEventListener('session-stored-offline', handleOfflineStore as EventListener);
      window.removeEventListener('app-updated', handleAppUpdate as EventListener);
      window.removeEventListener('sw-update-available', handleSWUpdate);
      window.removeEventListener(
        'storage-persistence-status',
        handleStorageStatus as EventListener,
      );
    };
  }, []);

  const clearNotification = () => setNotification(null);

  const refreshApp = () => {
    window.location.reload();
  };

  return {
    notification,
    isUpdateAvailable,
    syncStatus,
    clearNotification,
    refreshApp,
  };
}
