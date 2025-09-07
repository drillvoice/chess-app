import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';

export default function PersistentStorageWarning() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleDenied = () => setVisible(true);
    window.addEventListener('storage:persistent-denied', handleDenied);
    return () => {
      window.removeEventListener('storage:persistent-denied', handleDenied);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed right-4 top-20 z-50 max-w-sm duration-300 animate-in slide-in-from-top-2">
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Storage is not persistent</AlertTitle>
        <AlertDescription>
          <p>
            Your browser may clear saved sessions under storage pressure. Enable persistent storage
            or back up your data to keep Cloud Sync stable.
          </p>
          <p className="mt-2">
            <a
              href="https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Learn how to enable persistent storage
            </a>
            .
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
