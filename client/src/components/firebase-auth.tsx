import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud, CloudOff, LogOut } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { useSyncStatus, SyncState } from '@/hooks/useSyncStatus';

export default function FirebaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [reauthRequired, setReauthRequired] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: syncStatus, refetch: refetchSyncStatus } = useSyncStatus();

  useEffect(() => {
    const initAuth = async () => {
      try {
        const auth = await getFirebaseAuth();
        const { onAuthStateChanged, getRedirectResult } = await import('firebase/auth');
        const { refreshAuthState, verifyDataPresence, startSessionSync, stopSessionSync } =
          await import('@/lib/firebase');

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          setUser(user);
          setLoading(false);
          refetchSyncStatus();
          if (user) {
            setReauthRequired(false);
            // Only show sync UI and start syncing for non-anonymous users
            if (!user.isAnonymous) {
              try {
                await refreshAuthState();
                const verified = await verifyDataPresence();
                if (verified) {
                  await startSessionSync(() => {
                    queryClient.invalidateQueries({ queryKey: ['sessions'] });
                    queryClient.invalidateQueries({ queryKey: ['statistics'] });
                    queryClient.invalidateQueries({ queryKey: ['weekly-activity'] });
                    queryClient.invalidateQueries({ queryKey: ['weekly-goal'] });
                    refetchSyncStatus();
                  });
                }
              } catch (err) {
                console.error('Initial sync failed:', err);
              }
            } else {
              // Anonymous user - don't display as "signed in" but ensure they can use Firebase
              setUser(null); // Don't show as authenticated to user
              console.log('Anonymous user authenticated for device-specific storage');
            }
          } else {
            stopSessionSync();
          }
        });

        // Handle redirect result or persisted intent
        try {
          const redirectResult = await getRedirectResult(auth).catch(() => null);
          const redirectIntent = sessionStorage.getItem('redirectAuth');
          if (redirectResult || redirectIntent) {
            sessionStorage.removeItem('redirectAuth');
            try {
              await refreshAuthState();
              const verified = await verifyDataPresence();
              if (!verified) {
                toast({
                  title: 'Verification Failed',
                  description: 'Could not verify cloud data. Please try again.',
                  variant: 'destructive',
                });
              } else {
                await startSessionSync(() => {
                  queryClient.invalidateQueries({ queryKey: ['sessions'] });
                  queryClient.invalidateQueries({ queryKey: ['statistics'] });
                  queryClient.invalidateQueries({ queryKey: ['weekly-activity'] });
                  queryClient.invalidateQueries({ queryKey: ['weekly-goal'] });
                  refetchSyncStatus();
                });
                toast({
                  title: 'Connected',
                  description: 'Cloud sync enabled successfully!',
                });
              }
            } catch (error) {
              toast({
                title: 'Connection Failed',
                description:
                  error instanceof Error
                    ? error.message
                    : 'Could not enable cloud sync. Please try again.',
                variant: 'destructive',
              });
            }
          }
        } catch (error) {
          console.error('Redirect result handling failed:', error);
        }

        return unsubscribe;
      } catch (error) {
        console.error('Firebase auth initialization failed:', error);
        setLoading(false);
      }
    };

    let unsubscribe: (() => void) | undefined;
    initAuth().then((unsub) => {
      unsubscribe = unsub;
    });

    return () => unsubscribe?.();
  }, [toast, queryClient, refetchSyncStatus]);

  useEffect(() => {
    const handler = () => setReauthRequired(true);
    window.addEventListener('auth:reauth-required', handler);
    return () => window.removeEventListener('auth:reauth-required', handler);
  }, []);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      const { startAuthFlow, refreshAuthState, verifyDataPresence, startSessionSync } =
        await import('@/lib/firebase');
      try {
        await startAuthFlow();
      } catch (error: any) {
        if (
          error &&
          (error.code === 'auth/popup-blocked' ||
            error.code === 'auth/cancelled-popup-request' ||
            error.code === 'auth/operation-not-supported-in-this-environment')
        ) {
          sessionStorage.setItem('redirectAuth', 'true');
          await startAuthFlow(true);
        } else if (error && error.code === 'auth/credential-already-in-use') {
          // Handle case where user is already signed in with this Google account
          console.log('✅ User already signed in with this Google account');
          // Continue with the flow since the user is already authenticated
        } else {
          throw error;
        }
      }
      await refreshAuthState();
      const verified = await verifyDataPresence();
      if (!verified) {
        toast({
          title: 'Verification Failed',
          description: 'Could not verify cloud data. Please try again.',
          variant: 'destructive',
        });
        return;
      }
      await startSessionSync(() => {
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        queryClient.invalidateQueries({ queryKey: ['statistics'] });
        queryClient.invalidateQueries({ queryKey: ['weekly-activity'] });
        queryClient.invalidateQueries({ queryKey: ['weekly-goal'] });
        refetchSyncStatus();
      });
      toast({
        title: 'Connected',
        description: 'Cloud sync enabled successfully!',
      });
    } catch (error) {
      toast({
        title: 'Connection Failed',
        description:
          error instanceof Error ? error.message : 'Could not enable cloud sync. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setLoading(true);
      const auth = await getFirebaseAuth();
      const { signOut } = await import('firebase/auth');
      await signOut(auth);
      localStorage.removeItem('hasRealLogin');
      setReauthRequired(false);
      const { refreshAuthState, stopSessionSync } = await import('@/lib/firebase');
      await refreshAuthState();
      stopSessionSync();
      refetchSyncStatus();
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-activity'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-goal'] });
      toast({
        title: 'Disconnected',
        description: 'Cloud sync has been disabled. Local data remains on this device.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Could not disconnect from cloud sync.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <Cloud className="h-5 w-5 animate-pulse text-blue-600" />
            <div>
              <p className="text-sm text-gray-600">Initializing cloud sync...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentState = syncStatus?.state ?? (user ? SyncState.Synced : SyncState.Disabled);
  let statusMessage: string | null = null;
  if (syncStatus) {
    switch (currentState) {
      case SyncState.Disabled:
        statusMessage = `Cloud sync disabled — last synced ${
          syncStatus.lastSynced
            ? formatDistanceToNow(syncStatus.lastSynced, { addSuffix: true })
            : 'never'
        }`;
        break;
      case SyncState.Pending:
        statusMessage = `${syncStatus.unsyncedCount} session(s) pending sync${
          syncStatus.lastSynced
            ? ` — last synced ${formatDistanceToNow(syncStatus.lastSynced, { addSuffix: true })}`
            : ''
        }`;
        break;
      case SyncState.Syncing:
        statusMessage = `Syncing ${syncStatus.unsyncedCount} session(s)…`;
        break;
      case SyncState.Synced:
        statusMessage = `All data up to date — last synced ${
          syncStatus.lastSynced
            ? formatDistanceToNow(syncStatus.lastSynced, { addSuffix: true })
            : 'never'
        }`;
        break;
    }
  }

  return (
    <Card className={user ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center space-x-2 text-sm">
          {user ? (
            <>
              <Cloud className="h-4 w-4 text-green-600" />
              <span>Cloud Sync Active</span>
            </>
          ) : (
            <>
              <CloudOff className="h-4 w-4 text-gray-600" />
              <span>Cloud Sync Disabled</span>
            </>
          )}
        </CardTitle>
        {statusMessage && <p className="text-xs text-gray-500">{statusMessage}</p>}
      </CardHeader>
      <CardContent className="pt-0">
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Avatar className="h-6 w-6">
                <AvatarImage src={user.photoURL ?? undefined} alt={user.displayName ?? ''} />
                <AvatarFallback>{user.displayName?.[0] ?? user.email?.[0] ?? 'U'}</AvatarFallback>
              </Avatar>
              <span>{user.displayName || user.email || 'User'}</span>
            </div>
            <p className="text-xs text-gray-500">
              Your training data is automatically synced across all your devices.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={loading}
              className="w-full"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Disable Cloud Sync
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {reauthRequired ? (
              <>
                <p className="text-sm text-gray-600">
                  Your previous session was lost. Re-enable cloud sync to continue.
                </p>
                <Button
                  onClick={handleSignIn}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  <Cloud className="mr-2 h-4 w-4" />
                  Re-enable Cloud Sync
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Enable cloud sync to access your training data from any device.
                </p>
                <Button
                  onClick={handleSignIn}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  <Cloud className="mr-2 h-4 w-4" />
                  Enable Cloud Sync
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
