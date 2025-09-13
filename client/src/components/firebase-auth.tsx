import { useState, useEffect } from 'react';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, DatabaseBackup, Upload, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import {
  backupAllSessionsToCloud,
  getBackupStatus,
  isBackupNeeded,
} from '@/lib/firebase/firestore-backup';

interface BackupStatus {
  lastBackup: Date | null;
  sessionCount: number;
  needsBackup: boolean;
}

export default function FirebaseAuth() {
  const [isBackupActive, setIsBackupActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const initAuth = async () => {
      try {
        const auth = await getFirebaseAuth();
        const { onAuthStateChanged } = await import('firebase/auth');
        const { ensureAuthentication } = await import('@/lib/firebase/core');

        // Ensure anonymous authentication for backup
        await ensureAuthentication();

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          setIsBackupActive(!!user);
          setLoading(false);

          if (user) {
            console.log('Anonymous backup authentication active');
            // Load backup status
            try {
              const status = await getBackupStatus();
              setBackupStatus(status);
            } catch (error) {
              console.error('Failed to get backup status:', error);
            }
          }
        });

        return unsubscribe;
      } catch (error) {
        console.error('Firebase backup initialization failed:', error);
        setLoading(false);
      }
    };

    let unsubscribe: (() => void) | undefined;
    initAuth().then((unsub) => {
      unsubscribe = unsub;
    });

    return () => unsubscribe?.();
  }, []);

  const handleManualBackup = async () => {
    try {
      setIsBackingUp(true);
      await backupAllSessionsToCloud();

      // Refresh backup status
      const status = await getBackupStatus();
      setBackupStatus(status);

      toast({
        title: 'Backup Complete',
        description: `${status.sessionCount} sessions backed up to cloud storage.`,
      });
    } catch (error) {
      toast({
        title: 'Backup Failed',
        description: error instanceof Error ? error.message : 'Could not backup to cloud.',
        variant: 'destructive',
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const checkForAutoBackup = async () => {
    try {
      const needsBackup = await isBackupNeeded();
      if (needsBackup) {
        console.log('Performing automatic weekly backup...');
        await backupAllSessionsToCloud();
        const status = await getBackupStatus();
        setBackupStatus(status);
      }
    } catch (error) {
      console.error('Auto backup failed:', error);
    }
  };

  // Check for auto backup on component mount
  useEffect(() => {
    if (isBackupActive && !loading) {
      checkForAutoBackup();
    }
  }, [isBackupActive, loading]);

  if (loading) {
    return (
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <DatabaseBackup className="h-5 w-5 animate-pulse text-blue-600" />
            <div>
              <p className="text-sm text-gray-600">Initializing backup system...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  let statusMessage: string | null = null;
  if (backupStatus) {
    if (backupStatus.lastBackup) {
      const timeAgo = formatDistanceToNow(backupStatus.lastBackup, { addSuffix: true });
      statusMessage = `${backupStatus.sessionCount} sessions — last backed up ${timeAgo}`;
      if (backupStatus.needsBackup) {
        statusMessage += ' (backup recommended)';
      }
    } else {
      statusMessage = `${backupStatus.sessionCount} sessions — never backed up`;
    }
  }

  return (
    <Card
      className={isBackupActive ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center space-x-2 text-sm">
          {isBackupActive ? (
            <>
              <DatabaseBackup className="h-4 w-4 text-green-600" />
              <span>Cloud Backup Active</span>
            </>
          ) : (
            <>
              <Database className="h-4 w-4 text-gray-600" />
              <span>Backup Initializing</span>
            </>
          )}
        </CardTitle>
        {statusMessage && <p className="text-xs text-gray-500">{statusMessage}</p>}
      </CardHeader>
      <CardContent className="pt-0">
        {isBackupActive ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Your training sessions are automatically backed up weekly to secure cloud storage.
            </p>

            <div className="flex gap-2">
              <Button
                onClick={handleManualBackup}
                disabled={isBackingUp}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                <Upload className={`mr-2 h-3 w-3 ${isBackingUp ? 'animate-pulse' : ''}`} />
                {isBackingUp ? 'Backing up...' : 'Backup Now'}
              </Button>

              {backupStatus?.needsBackup && (
                <div className="flex items-center text-xs text-amber-600">
                  <Calendar className="mr-1 h-3 w-3" />
                  <span>Recommended</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Backup system is starting up...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
