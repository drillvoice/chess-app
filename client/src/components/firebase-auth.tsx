import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, DatabaseBackup } from 'lucide-react';

export default function FirebaseAuth() {
  const [isBackupActive, setIsBackupActive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const auth = await getFirebaseAuth();
        const { onAuthStateChanged } = await import('firebase/auth');
        const { ensureAuthentication } = await import('@/lib/firebase');

        // Ensure anonymous authentication for backup
        await ensureAuthentication();

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          setIsBackupActive(!!user);
          setLoading(false);
          
          if (user) {
            console.log('Anonymous backup active for device storage');
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

  return (
    <Card className={isBackupActive ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}>
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
              <span>Local Storage Only</span>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isBackupActive ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Your training data is automatically backed up to the cloud for this device.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Backup system is initializing...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
