import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
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
  forceUploadAllLocalSessionsToCloud,
  getPendingAccountSwitch,
  initializeCloudSyncForCurrentUser,
  refreshAuthState,
  startAuthFlow,
  stopSessionSync,
} from '@/lib/firebase';
import { getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';
import type { MigrationSummary } from '@/lib/firebase';
import type { User } from 'firebase/auth';

type PendingAccountSwitch = ReturnType<typeof getPendingAccountSwitch>;

interface RepairProgress {
  processed: number;
  total: number;
  uploadedCount: number;
  failedCount: number;
}

interface AuthState {
  authReady: boolean;
  currentUser: User | null;
  isProcessing: boolean;
  migrationSummary: MigrationSummary | null;
  pendingSwitch: PendingAccountSwitch;
  repairProgress: RepairProgress | null;
}

type AuthAction =
  | { type: 'AUTH_USER_CHANGED'; user: User | null }
  | { type: 'AUTH_INIT_FAILED' }
  | { type: 'PROCESSING_STARTED' }
  | { type: 'PROCESSING_FINISHED' }
  | {
      type: 'SYNC_INITIALIZED';
      summary: MigrationSummary | null;
      pendingSwitch: PendingAccountSwitch;
    }
  | { type: 'PENDING_SWITCH_REFRESHED'; pendingSwitch: PendingAccountSwitch }
  | { type: 'SIGNED_OUT' }
  | { type: 'REPAIR_PROGRESS_UPDATED'; progress: RepairProgress | null };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_USER_CHANGED': {
      if (action.user) {
        return { ...state, authReady: true, currentUser: action.user };
      }
      return {
        ...state,
        authReady: true,
        currentUser: null,
        migrationSummary: null,
        pendingSwitch: null,
      };
    }
    case 'AUTH_INIT_FAILED':
      return { ...state, authReady: true };
    case 'PROCESSING_STARTED':
      return { ...state, isProcessing: true };
    case 'PROCESSING_FINISHED':
      return { ...state, isProcessing: false };
    case 'SYNC_INITIALIZED':
      return { ...state, migrationSummary: action.summary, pendingSwitch: action.pendingSwitch };
    case 'PENDING_SWITCH_REFRESHED':
      return { ...state, pendingSwitch: action.pendingSwitch };
    case 'SIGNED_OUT':
      return { ...state, migrationSummary: null, pendingSwitch: null };
    case 'REPAIR_PROGRESS_UPDATED':
      return { ...state, repairProgress: action.progress };
    default:
      return state;
  }
}

function createInitialAuthState(): AuthState {
  return {
    authReady: false,
    currentUser: null,
    isProcessing: false,
    migrationSummary: null,
    pendingSwitch: getPendingAccountSwitch(),
    repairProgress: null,
  };
}

export default function FirebaseAuth() {
  const { toast } = useToast();
  const syncStatus = useSyncStatus();

  const [state, dispatch] = useReducer(authReducer, undefined, createInitialAuthState);
  const { authReady, currentUser, isProcessing, migrationSummary, pendingSwitch, repairProgress } =
    state;
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  const runSyncInitialization = useCallback(async () => {
    const summary = await initializeCloudSyncForCurrentUser();
    dispatch({ type: 'SYNC_INITIALIZED', summary, pendingSwitch: getPendingAccountSwitch() });
    return summary;
  }, []);

  const handleEnable = useCallback(
    async (forceRedirect = false) => {
      try {
        dispatch({ type: 'PROCESSING_STARTED' });
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
        dispatch({ type: 'PROCESSING_FINISHED' });
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
      dispatch({ type: 'SIGNED_OUT' });
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

  const handleRepairCloudData = useCallback(async () => {
    try {
      dispatch({ type: 'PROCESSING_STARTED' });
      dispatch({
        type: 'REPAIR_PROGRESS_UPDATED',
        progress: { processed: 0, total: 0, uploadedCount: 0, failedCount: 0 },
      });
      const summary = await forceUploadAllLocalSessionsToCloud({
        onProgress: (progress) => {
          dispatch({ type: 'REPAIR_PROGRESS_UPDATED', progress });
        },
      });
      if (summary.failedCount > 0) {
        toast({
          title: 'Repair partially complete',
          description: `Uploaded ${summary.uploadedCount}/${summary.totalLocalCount} sessions. ${summary.failedCount} failed; keep this screen open and retry.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Cloud repair complete',
          description: `Uploaded ${summary.uploadedCount} local sessions to cloud.`,
        });
      }
    } catch (error) {
      toast({
        title: 'Cloud repair failed',
        description: error instanceof Error ? error.message : 'Could not force upload local data.',
        variant: 'destructive',
      });
    } finally {
      dispatch({ type: 'REPAIR_PROGRESS_UPDATED', progress: null });
      dispatch({ type: 'PROCESSING_FINISHED' });
    }
  }, [toast]);

  const handleKeepSeparateProfiles = useCallback(async () => {
    try {
      dispatch({ type: 'PROCESSING_STARTED' });
      await acknowledgeAccountSwitch(true);
      const summary = await runSyncInitialization();
      dispatch({ type: 'PENDING_SWITCH_REFRESHED', pendingSwitch: getPendingAccountSwitch() });
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
      dispatch({ type: 'PROCESSING_FINISHED' });
    }
  }, [runSyncInitialization, toast]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    // Concern 1: keep component state in sync with the Firebase auth user.
    const subscribeToAuthChanges = (auth: Awaited<ReturnType<typeof getFirebaseAuth>>) => {
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        const signedInUser = user && !user.isAnonymous ? user : null;
        dispatch({ type: 'AUTH_USER_CHANGED', user: signedInUser });
        if (signedInUser) {
          try {
            await runSyncInitialization();
          } catch (error) {
            console.error('Failed to initialize cloud sync:', error);
          }
        }
      });
    };

    // Concern 2: complete a sign-in that was started via redirect (popup blocked).
    const completePendingRedirectSignIn = async (
      auth: Awaited<ReturnType<typeof getFirebaseAuth>>,
    ) => {
      if (sessionStorage.getItem('redirectAuth') !== 'true') return;
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
    };

    const setupAuth = async () => {
      try {
        const auth = await getFirebaseAuth();
        if (!mounted) return;
        subscribeToAuthChanges(auth);
        await completePendingRedirectSignIn(auth);
      } catch (error) {
        console.error('Firebase auth initialization failed:', error);
        dispatch({ type: 'AUTH_INIT_FAILED' });
      }
    };

    setupAuth();
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [runSyncInitialization, toast]);

  const syncInfo = syncStatus?.data;

  useEffect(() => {
    if (!syncInfo || syncInfo.state !== SyncStateEnum.Syncing) {
      return;
    }
    const timer = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [syncInfo]);

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

  const liveElapsedMs = useMemo(() => {
    if (!syncInfo) return null;
    if (syncInfo.state !== SyncStateEnum.Syncing) {
      return syncInfo.elapsedMs ?? null;
    }
    if (syncInfo.startedAt) {
      return Math.max(0, nowTick - new Date(syncInfo.startedAt).getTime());
    }
    return syncInfo.elapsedMs ?? null;
  }, [nowTick, syncInfo]);

  const diagnosticsText = useMemo(() => {
    const lines = [
      `time=${new Date().toISOString()}`,
      `state=${syncInfo?.state ?? 'unknown'}`,
      `phase=${syncInfo?.phase ?? 'n/a'}`,
      `processed=${syncInfo?.processed ?? 0}`,
      `total=${syncInfo?.total ?? 0}`,
      `progressPct=${syncInfo?.progressPct ?? 0}`,
      `lastSynced=${syncInfo?.lastSynced?.toISOString?.() ?? 'n/a'}`,
      `lastError=${syncInfo?.lastError ?? 'n/a'}`,
      `latestFailure=${(syncInfo as any)?.latestFailure ?? 'n/a'}`,
      `reconciledLocalOnlyCount=${(syncInfo as any)?.reconciledLocalOnlyCount ?? 0}`,
      `backfilledCount=${(syncInfo as any)?.backfilledCount ?? 0}`,
      `repairProgress=${repairProgress ? `${repairProgress.processed}/${repairProgress.total}` : 'n/a'}`,
      `repairUploaded=${repairProgress?.uploadedCount ?? 0}`,
      `repairFailed=${repairProgress?.failedCount ?? 0}`,
    ];
    const samples = ((syncInfo as any)?.failureSamples ?? []) as string[];
    if (samples.length > 0) {
      lines.push('failureSamples=');
      samples.forEach((sample, index) => lines.push(`${index + 1}. ${sample}`));
    }
    return lines.join('\n');
  }, [repairProgress, syncInfo]);

  const handleCopyDiagnostics = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsText);
      toast({
        title: 'Diagnostics copied',
        description: 'Troubleshooting details copied to clipboard.',
      });
    } catch (error) {
      toast({
        title: 'Copy failed',
        description: error instanceof Error ? error.message : 'Could not copy diagnostics.',
        variant: 'destructive',
      });
    }
  }, [diagnosticsText, toast]);

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
                Merged {migrationSummary.mergedCount} sessions (local {migrationSummary.localCount},
                cloud {migrationSummary.cloudCount}, conflicts resolved{' '}
                {migrationSummary.collisionsResolved}).
              </div>
            )}
            {syncInfo?.state === SyncStateEnum.Syncing && (
              <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-800">
                <div className="font-medium">{syncInfo.phase || 'Synchronizing account data'}</div>
                <Progress
                  value={Math.max(0, Math.min(100, syncInfo.progressPct ?? 0))}
                  className="h-2 bg-sky-100"
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{progressLabel}</span>
                  {speedLabel && <span>{speedLabel}</span>}
                  {typeof liveElapsedMs === 'number' && liveElapsedMs >= 0 && (
                    <span>{(liveElapsedMs / 1000).toFixed(1)}s elapsed</span>
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
              <Button onClick={handleRepairCloudData} variant="outline" disabled={isProcessing}>
                <Cloud className="mr-2 h-4 w-4" /> Repair cloud data
              </Button>
              <Button
                onClick={() => setShowTroubleshooting((prev) => !prev)}
                variant="outline"
                disabled={isProcessing}
              >
                {showTroubleshooting ? 'Hide troubleshooting' : 'Show troubleshooting'}
              </Button>
              <Button onClick={handleDisable} variant="secondary" disabled={isProcessing}>
                <CloudOff className="mr-2 h-4 w-4" /> Disable cloud sync
              </Button>
            </div>
            {isProcessing && repairProgress && (
              <div className="rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-800">
                Repair progress: {repairProgress.processed}/{repairProgress.total || '?'} processed
                {repairProgress.total > 0
                  ? ` (${repairProgress.uploadedCount} uploaded, ${repairProgress.failedCount} failed)`
                  : ''}
              </div>
            )}
            {showTroubleshooting && (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <div className="font-medium">Advanced troubleshooting</div>
                <div>Phase: {syncInfo?.phase || 'n/a'}</div>
                <div>
                  Sync progress: {syncInfo?.processed ?? 0}/{syncInfo?.total ?? 0}
                </div>
                <div>Latest failure: {(syncInfo as any)?.latestFailure || 'n/a'}</div>
                {Array.isArray((syncInfo as any)?.failureSamples) &&
                  ((syncInfo as any).failureSamples as string[]).length > 0 && (
                    <div>
                      Recent failures:
                      <div className="mt-1 space-y-1">
                        {((syncInfo as any).failureSamples as string[]).map((sample, idx) => (
                          <div key={`${sample}-${idx}`} className="break-words">
                            {idx + 1}. {sample}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                <Button size="sm" variant="outline" onClick={handleCopyDiagnostics}>
                  Copy diagnostics
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-gray-600">
              Sign in with Google to sync sessions, daily goals, and settings across devices in real
              time.
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
