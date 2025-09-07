import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { retryPendingSync } from '@/lib/firebase';

export default function CloudSyncStatus() {
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { code?: string };
      setErrorCode(detail?.code ?? 'unknown');
    };
    window.addEventListener('cloudsync:error', handler);
    return () => window.removeEventListener('cloudsync:error', handler);
  }, []);

  if (!errorCode) return null;

  const message = errorCode.startsWith('auth/')
    ? 'Authentication lost. Re-enable Cloud Sync'
    : 'Network error. Sync paused';

  const handleRetry = async () => {
    setErrorCode(null);
    try {
      await retryPendingSync();
    } catch {
      // retry will schedule its own attempts
    }
  };

  return (
    <div className="fixed right-4 top-36 z-50 max-w-sm duration-300 animate-in slide-in-from-top-2">
      <Alert variant="destructive">
        <CloudOff className="h-4 w-4" />
        <AlertTitle>Cloud Sync stopped</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <span>{message}</span>
          <Button size="sm" onClick={handleRetry} className="self-start">
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
