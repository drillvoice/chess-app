import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Cloud, CloudOff, Loader2, UserRound } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSyncStatus, SyncState as SyncStateEnum } from '@/hooks/useSyncStatus';
import {
  acknowledgeAccountSwitch,
  getPendingAccountSwitch,
  initializeCloudSyncForCurrentUser,
  refreshAuthState,
  startAuthFlow,
  stopSessionSync,
} from '@/lib/firebase';
import { getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';
import type { MigrationSummary } from '@/lib/firebase';
import type { User } from 'firebase/auth';

export default function FirebaseAuth() {
  const { toast } = useToast();
  const syncStatus = useSyncStatus();

  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [migrationSummary, setMigrationSummary] = useState<MigrationSummary | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState(getPendingAccountSwitch());

  const runSyncInitialization = useCallback(async () => {
    const summary = await initializeCloudSyncForCurrentUser();
    setMigrationSummary(summary);
    setPendingSwitch(getPendingAccountSwitch());
    return summary;
  }, []);

  const handleEnable = useCallback(
    async (forceRedirect = false) => {
      try {
        setIsProcessing(true);
        await startAuthFlow(forceRedirect);
        if (forceRedirect) {
          sessionStorage.setItem('redirectAuth', 'true');
          return;
        }
        await refreshAuthState();
        const summary = await runSyncInitialization();
        if (summary) {
          toast({
            title: 'Migration complete',
            description: `Merged ${summary.mergedCount} sessions across your local and cloud data.`,
          });
        } else {
          toast({
            title: 'Connected',
            description: 'Cloud sync is enabled and will keep this account updated in real time.',
          });
        }
      } catch (error) {
        if (!forceRedirect && (error as any)?.code === 'auth/popup-blocked') {
          sessionStorage.setItem('redirectAuth', 'true');
          await handleEnable(true);
          return;
        }
        toast({
          title: 'Sign-in failed',
          description: error instanceof Error ? error.message : 'Unable to start cloud sync.',
          variant: 'destructive',
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [runSyncInitialization, toast],
  );

  const handleDisable = useCallback(async () => {
    try {
      const auth = await getFirebaseAuth();
      await signOut(auth);
      await stopSessionSync();
      await refreshAuthState();
      setMigrationSummary(null);
      setPendingSwitch(null);
      toast({
        title: 'Cloud sync disabled',
        description: 'Local data remains available offline on this device.',
      });
    } catch (error) {
      toast({
        title: 'Sign-out failed',
        description: error instanceof Error ? error.message : 'Could not disable cloud sync.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleKeepSeparateProfiles = useCallback(async () => {
    try {
      setIsProcessing(true);
      await acknowledgeAccountSwitch(true);
      const summary = await runSyncInitialization();
      setPendingSwitch(getPendingAccountSwitch());
      toast({
        title: 'Account switched',
        description: summary
          ? `Local snapshot saved and ${summary.mergedCount} sessions synced for the selected account.`
          : 'Local data kept separate and new account sync has started.',
      });
    } catch (error) {
      toast({
        title: 'Could not switch account',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [runSyncInitialization, toast]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    const setupAuth = async () => {
      try {
        const auth = await getFirebaseAuth();
        if (!mounted) return;

        unsubscribe = onAuthStateChanged(auth, async (user) => {
          setAuthReady(true);
          setCurrentUser(user && !user.isAnonymous ? user : null);
          if (user && !user.isAnonymous) {
            try {
              await runSyncInitialization();
            } catch (error) {
              console.error('Failed to initialize cloud sync:', error);
            }
          } else {
            setMigrationSummary(null);
            setPendingSwitch(null);
          }
        });

        if (sessionStorage.getItem('redirectAuth') === 'true') {
          try {
            await getRedirectResult(auth);
            await refreshAuthState();
            await runSyncInitialization();
            sessionStorage.removeItem('redirectAuth');
            toast({
              title: 'Connected',
              description: 'Cloud sync is enabled and will keep this account updated in real time.',
            });
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
        console.error('Firebase auth initialization failed:', error);
        setAuthReady(true);
      }
    };

    setupAuth();
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [runSyncInitialization, toast]);

  const syncInfo = syncStatus?.data;

  const statusMessage = useMemo(() => {
    if (!syncInfo) return null;
    if (pendingSwitch) {
      return `Account switch detected (${pendingSwitch.previousUid} -> ${pendingSwitch.nextUid})`;
    }
    if (syncInfo.state === SyncStateEnum.Syncing) {
      return 'Syncing latest account changes...';
    }
    if (syncInfo.state === SyncStateEnum.Synced && syncInfo.lastSynced) {
      return `Synced ${formatDistanceToNow(syncInfo.lastSynced, { addSuffix: true })}`;
    }
    if (syncInfo.lastError) {
      return syncInfo.lastError;
    }
    return null;
  }, [pendingSwitch, syncInfo]);

  const progressLabel = useMemo(() => {
    if (!syncInfo) return null;
    if (syncInfo.state !== SyncStateEnum.Syncing) return null;
    const processed = syncInfo.processed ?? 0;
    const total = syncInfo.total ?? 0;
    if (total > 0) {
      return `${processed}/${total} items synced`;
    }
    if (syncInfo.lastBatchSize && syncInfo.lastBatchSize > 0) {
      return `${syncInfo.lastBatchSize} items in latest sync batch`;
    }
    return 'Preparing sync...';
  }, [syncInfo]);

  const speedLabel = useMemo(() => {
    if (!syncInfo) return null;
    if (!syncInfo.itemsPerSecond || syncInfo.itemsPerSecond <= 0) return null;
    return `${syncInfo.itemsPerSecond.toFixed(2)} items/sec`;
  }, [syncInfo]);

  const identity = currentUser?.email || currentUser?.displayName || currentUser?.uid || null;

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
              Real-time sync is active for this account. Local changes are stored instantly and
              synced across your signed-in devices.
            </p>
            {identity && (
              <div className="flex items-center gap-2 rounded-md border border-green-200 bg-white/70 p-2 text-xs text-gray-700">
                <UserRound className="h-3.5 w-3.5" />
                <span className="truncate">{identity}</span>
              </div>
            )}
            {migrationSummary && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
                Merged {migrationSummary.mergedCount} sessions (local {migrationSummary.localCount}
                , cloud {migrationSummary.cloudCount}, conflicts resolved{' '}
                {migrationSummary.collisionsResolved}).
              </div>
            )}
            {syncInfo?.state === SyncStateEnum.Syncing && (
              <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-800">
                <div className="font-medium">
                  {syncInfo.phase || 'Synchronizing account data'}
                </div>
                <Progress
                  value={Math.max(0, Math.min(100, syncInfo.progressPct ?? 0))}
                  className="h-2 bg-sky-100"
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{progressLabel}</span>
                  {speedLabel && <span>{speedLabel}</span>}
                  {typeof syncInfo.elapsedMs === 'number' && syncInfo.elapsedMs >= 0 && (
                    <span>{(syncInfo.elapsedMs / 1000).toFixed(1)}s elapsed</span>
                  )}
                </div>
              </div>
            )}
            {pendingSwitch && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Account switch requires confirmation</span>
                </div>
                <p>
                  To avoid mixing accounts, keep profiles separate before syncing this Google
                  account.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleKeepSeparateProfiles}
                  disabled={isProcessing}
                >
                  Keep profiles separate and continue
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleDisable} variant="secondary" disabled={isProcessing}>
                <CloudOff className="mr-2 h-4 w-4" /> Disable cloud sync
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-600">
              Sign in with Google to sync sessions, daily goals, and settings across devices in
              real time.
            </p>
            <Button onClick={() => handleEnable()} disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Cloud className="mr-2 h-4 w-4" />
              )}
              {isProcessing ? 'Connecting…' : 'Sign in with Google'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
