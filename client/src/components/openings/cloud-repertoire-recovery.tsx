import { useCallback, useState } from 'react';
import { ChevronDown, CloudDownload, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  listCloudRepertoires,
  restoreCloudRepertoire,
  type CloudRepertoireRecord,
} from '@/lib/firebase/repertoires';

// Answers "is my repertoire actually backed up?" from a device that never held
// it. A repertoire missing here was never uploaded; one listed as deleted is
// still recoverable, which the reconciler cannot do on its own once the device
// that held the local copy is gone.

interface CloudRepertoireRecoveryProps {
  /** Called with the restored repertoire id so the page can select it. */
  onRestored?: (id: string) => void;
}

function describeStatus(record: CloudRepertoireRecord): { label: string; tone: string } {
  if (record.deletedAt) {
    return { label: 'Deleted in cloud', tone: 'text-red-700' };
  }
  if (!record.presentLocally) {
    return { label: 'Not on this device', tone: 'text-amber-700' };
  }
  return { label: 'On this device', tone: 'text-green-700' };
}

export function CloudRepertoireRecovery({ onRestored }: CloudRepertoireRecoveryProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [records, setRecords] = useState<CloudRepertoireRecord[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listCloudRepertoires();
      setSignedOut(result === null);
      setRecords(result);
    } catch (loadError) {
      // Surface the real message: a rules rejection and an offline device look
      // identical from the UI otherwise.
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleToggle = useCallback(() => {
    setIsOpen((open) => {
      if (!open && records === null) void load();
      return !open;
    });
  }, [load, records]);

  const handleRestore = useCallback(
    async (record: CloudRepertoireRecord) => {
      setRestoringId(record.id);
      try {
        const restored = await restoreCloudRepertoire(record.id);
        toast({
          title: 'Repertoire restored',
          description: `"${restored.name}" is back on this device and re-uploaded to the cloud.`,
        });
        onRestored?.(restored.id);
        await load();
      } catch (restoreError) {
        toast({
          title: 'Restore failed',
          description:
            restoreError instanceof Error ? restoreError.message : 'Could not restore it.',
          variant: 'destructive',
        });
      } finally {
        setRestoringId(null);
      }
    },
    [load, onRestored, toast],
  );

  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 p-4"
        onClick={handleToggle}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <CloudDownload className="h-4 w-4 text-gray-600" />
          <h3 className="text-base font-semibold text-gray-800">Cloud backup</h3>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <CardContent className="space-y-3 px-4 pb-4 pt-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-600">
              Every repertoire this account has in the cloud, including ones deleted from another
              device.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void load()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
              Could not read the cloud backup: {error}
            </p>
          )}

          {!error && signedOut && (
            <p className="text-sm text-gray-500">
              Sign in to cloud sync on the Account page to see what is backed up.
            </p>
          )}

          {!error && !signedOut && records?.length === 0 && (
            <p className="text-sm text-gray-500">
              This account has no repertoires in the cloud. Anything imported on a device that never
              finished syncing was not backed up.
            </p>
          )}

          {!error && !signedOut && records && records.length > 0 && (
            <div className="space-y-2">
              {records.map((record) => {
                const status = describeStatus(record);
                const canRestore = Boolean(record.deletedAt) || !record.presentLocally;
                return (
                  <div key={record.id} className="rounded-md border border-gray-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{record.name}</p>
                        <p className="text-xs text-gray-500">
                          {record.side === 'black' ? 'Black' : 'White'} • {record.moveCount} move
                          {record.moveCount === 1 ? '' : 's'} • updated{' '}
                          {new Date(record.updatedAt).toLocaleDateString()}
                        </p>
                        <p className={`text-xs font-medium ${status.tone}`}>{status.label}</p>
                      </div>
                      {canRestore && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleRestore(record)}
                          disabled={restoringId !== null}
                        >
                          {restoringId === record.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CloudDownload className="mr-2 h-4 w-4" />
                          )}
                          Restore
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
