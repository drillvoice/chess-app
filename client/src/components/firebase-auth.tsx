import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  Cloud,
  CloudOff,
  DatabaseBackup,
  Loader2,
  RefreshCcw,
  Upload,
} from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSyncStatus, SyncState as SyncStateEnum } from '@/hooks/useSyncStatus';
import {
  startAuthFlow,
  refreshAuthState,
  verifyDataPresence,
  startSessionSync,
  stopSessionSync,
} from '@/lib/firebase';
import {
  backupAllSessionsToCloud,
  getBackupStatus,
  isBackupNeeded,
} from '@/lib/firebase/firestore-backup';
import { getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';

type BackupStatus = {
  lastBackup: Date | null;
  sessionCount: number;
  needsBackup: boolean;
};

export default function FirebaseAuth() {
  const { toast } = useToast();
  const syncStatus = useSyncStatus();

  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [reauthRequired, setReauthRequired] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [isBackupRunning, setIsBackupRunning] = useState(false);
  const connectedFlowRunningRef = useRef(false);

  const loadBackupStatus = useCallback(async () => {
    try {
      const status = await getBackupStatus();
      setBackupStatus({
        lastBackup: status.lastBackup,
        sessionCount: status.sessionCount,
        needsBackup: status.needsBackup,
      });
    } catch (error) {
      console.error('Error getting backup status:', error);
    }
  }, []);

  const runAutoBackup = useCallback(async () => {
    try {
      const needsBackup = await isBackupNeeded();
      if (needsBackup) {
        console.log('Performing automatic weekly backup...');
        await backupAllSessionsToCloud();
        await loadBackupStatus();
      }
    } catch (error) {
      console.error('Auto backup failed:', error);
    }
  }, [loadBackupStatus]);

  const handleConnectedFlow = useCallback(
    async (fromRedirect = false) => {
      if (connectedFlowRunningRef.current) {
        return;
      }
      connectedFlowRunningRef.current = true;
      setIsVerifying(true);
      try {
        await refreshAuthState();
        const verified = await verifyDataPresence();

        if (verified) {
          await startSessionSync();
          toast({
            title: 'Connected',
            description: 'Cloud sync is enabled and your sessions will back up automatically.',
          });
          setReauthRequired(false);
          await loadBackupStatus();
          await runAutoBackup();
        } else {
          toast({
            title: 'Verification Failed',
            description: 'We could not verify cloud data. Please try again later.',
            variant: 'destructive',
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to connect to cloud sync.';
        toast({
          title: 'Connection Failed',
          description: message,
          variant: 'destructive',
        });
        if (!fromRedirect) {
          sessionStorage.removeItem('redirectAuth');
        }
      } finally {
        connectedFlowRunningRef.current = false;
        setIsVerifying(false);
        if (!fromRedirect) {
          sessionStorage.removeItem('redirectAuth');
        }
      }
    },
    [loadBackupStatus, runAutoBackup, toast],
  );

  const handleEnable = useCallback(
    async (forceRedirect = false) => {
      try {
        setIsProcessing(true);
        await startAuthFlow(forceRedirect);
        if (forceRedirect) {
          sessionStorage.setItem('redirectAuth', 'true');
        }
        await handleConnectedFlow(forceRedirect);
      } catch (error) {
        if (!forceRedirect && (error as any)?.code === 'auth/popup-blocked') {
          sessionStorage.setItem('redirectAuth', 'true');
          await handleEnable(true);
          return;
        }

        const message = error instanceof Error ? error.message : 'Unable to start cloud sync.';
        toast({
          title: 'Sign-in failed',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [handleConnectedFlow, toast],
  );

  const handleDisable = useCallback(async () => {
    try {
      const auth = await getFirebaseAuth();
      await signOut(auth);
      await Promise.resolve(stopSessionSync());
      await refreshAuthState();
      toast({ title: 'Cloud sync disabled', description: 'Local data remains available offline.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not disable cloud sync.';
      toast({ title: 'Sign-out failed', description: message, variant: 'destructive' });
    }
  }, [toast]);

  const handleManualBackup = useCallback(async () => {
    try {
      setIsBackupRunning(true);
      await backupAllSessionsToCloud();
      await loadBackupStatus();
      toast({
        title: 'Backup Complete',
        description: 'Training sessions stored safely in the cloud.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloud backup failed.';
      toast({ title: 'Backup Failed', description: message, variant: 'destructive' });
    } finally {
      setIsBackupRunning(false);
    }
  }, [loadBackupStatus, toast]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    const setupAuth = async () => {
      try {
        const auth = await getFirebaseAuth();
        if (!mounted) return;

        unsubscribe = onAuthStateChanged(auth, async (user) => {
          setAuthReady(true);
          setCurrentUser(user);
          if (user) {
            await handleConnectedFlow();
          } else {
            setBackupStatus(null);
          }
        });

        if (sessionStorage.getItem('redirectAuth') === 'true') {
          try {
            await getRedirectResult(auth);
            await handleConnectedFlow(true);
          } catch (error) {
            console.error('Redirect authentication failed:', error);
            toast({
              title: 'Connection Failed',
              description: 'Unable to complete sign-in. Please try again.',
              variant: 'destructive',
            });
            sessionStorage.removeItem('redirectAuth');
          }
        }
      } catch (error) {
        console.error('Firebase auth initialisation failed:', error);
        setAuthReady(true);
      }
    };

    const handleReauthEvent = () => setReauthRequired(true);

    setupAuth();
    window.addEventListener('auth:reauth-required', handleReauthEvent);

    return () => {
      mounted = false;
      unsubscribe?.();
      window.removeEventListener('auth:reauth-required', handleReauthEvent);
    };
  }, [handleConnectedFlow, toast]);

  const syncInfo = syncStatus?.data;

  const statusMessage = useMemo(() => {
    if (isVerifying) {
      return 'Verifying cloud sync...';
    }

    if (!syncInfo) return null;

    if (syncInfo.state === SyncStateEnum.Pending && syncInfo.unsyncedCount > 0) {
      return `${syncInfo.unsyncedCount} session(s) pending sync`;
    }

    if (syncInfo.state === SyncStateEnum.Syncing) {
      return `Syncing ${syncInfo.unsyncedCount} session(s)…`;
    }

    if (syncInfo.state === SyncStateEnum.Synced && syncInfo.lastSynced) {
      return `Synced ${formatDistanceToNow(syncInfo.lastSynced, { addSuffix: true })}`;
    }

    return null;
  }, [isVerifying, syncInfo]);

  const actionButtonLabel = reauthRequired ? 'Re-enable cloud sync' : 'Enable cloud sync';

  return (
    <Card className={currentUser ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {currentUser ? (
            <Cloud className="h-4 w-4 text-green-600" />
          ) : (
            <CloudOff className="h-4 w-4 text-gray-500" />
          )}
          <span>{currentUser ? 'Cloud sync enabled' : 'Cloud sync disabled'}</span>
        </CardTitle>
        {statusMessage && <p className="text-xs text-gray-500">{statusMessage}</p>}
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {!authReady ? (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking authentication...</span>
          </div>
        ) : currentUser ? (
          <>
            <p className="text-xs text-gray-600">
              Your sessions will automatically sync whenever you go online. You can run a manual
              backup at any time.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleDisable} variant="secondary" disabled={isProcessing}>
                <CloudOff className="mr-2 h-4 w-4" /> Disable cloud sync
              </Button>
              <Button onClick={handleManualBackup} variant="outline" disabled={isBackupRunning}>
                {isBackupRunning ? (
                  <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {isBackupRunning ? 'Backing up...' : 'Backup now'}
              </Button>
            </div>
            {backupStatus && (
              <div className="mt-2 rounded-md border border-gray-200 bg-white/60 p-3 text-xs text-gray-600">
                <div className="flex items-center gap-2 font-medium text-gray-700">
                  <DatabaseBackup className="h-4 w-4 text-blue-500" />
                  <span>Cloud backup summary</span>
                </div>
                <div className="mt-1 text-gray-500">
                  {backupStatus.lastBackup
                    ? `Last backup ${formatDistanceToNow(backupStatus.lastBackup, { addSuffix: true })}`
                    : 'No backups yet'}
                  {` • ${backupStatus.sessionCount} session(s) stored`}
                  {backupStatus.needsBackup ? ' • Backup recommended' : ''}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-gray-600">
              Enable cloud sync to keep your training data safe across devices.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleEnable()} disabled={isProcessing}>
                {isProcessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Cloud className="mr-2 h-4 w-4" />
                )}
                {isProcessing ? 'Connecting…' : actionButtonLabel}
              </Button>
            </div>
            {reauthRequired && (
              <div className="flex items-center gap-2 text-xs text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                <span>Cloud sync needs to be re-enabled to continue.</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
