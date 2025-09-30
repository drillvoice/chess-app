import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Database } from 'lucide-react';
import FirebaseAuth from './firebase-auth';
// Dynamic import for firebase to maintain code splitting

function DataManagementContent() {
  const [clearingData, setClearingData] = useState(false);
  const { toast } = useToast();

  const handleClearLocalData = async () => {
    const shouldSkipConfirmation = import.meta.env.MODE === 'test';
    if (!shouldSkipConfirmation && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const confirmed = window.confirm('Are you sure? This will permanently delete all local data.');
      if (!confirmed) {
        return;
      }
    }

    try {
      setClearingData(true);
      const { SessionsCache } = await import('@/lib/cache-utils');
      const { offlineStorage } = await import('@/lib/offline-storage');
      SessionsCache.remove();
      await offlineStorage.clear();
      toast({
        title: 'Cleared',
        description: 'Local data removed from this device.',
      });
    } catch (_error) {
      toast({
        title: 'Error',
        description: 'Failed to clear local data',
        variant: 'destructive',
      });
    } finally {
      setClearingData(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Firebase Cloud Backup */}
      <div>
        <Label className="mb-3 block text-sm font-medium text-gray-700">Cloud Backup</Label>
        <div className="space-y-3">
          <FirebaseAuth />
          <p className="text-sm text-gray-600">
            Your data is automatically backed up to Firebase Cloud weekly when you're online. Manual
            backups can be triggered anytime from the backup status above.
          </p>
        </div>
      </div>

      {/* Enhanced Data Management */}
      <div>
        <Label className="mb-3 block text-sm font-medium text-gray-700">
          Advanced Data Management
        </Label>
        <div className="rounded-lg border p-4">
          <p className="mb-4 text-sm text-gray-600">
            Enhanced export/import with multiple formats, validation, and backup verification.
          </p>
          <div className="space-y-2">
            <div className="text-sm">✓ Multiple export formats (JSON, CSV, Backup)</div>
            <div className="text-sm">✓ Import validation and conflict resolution</div>
            <div className="text-sm">✓ Backup verification and restore points</div>
            <div className="text-sm">✓ Data integrity checks</div>
          </div>
        </div>
      </div>

      {/* Legacy Functions */}
      <div>
        <Label className="mb-2 block text-sm font-medium text-gray-700">Clear local data</Label>
        <p className="mb-3 text-sm text-gray-600">
          Remove all locally stored training data from this device. Cloud backups will remain
          unaffected and can be restored later.
        </p>
        <Button
          onClick={handleClearLocalData}
          className="w-full"
          variant="destructive"
          disabled={clearingData}
        >
          {clearingData ? 'Clearing...' : 'Clear local data'}
        </Button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> The enhanced data management system above provides comprehensive
          backup and restore capabilities. Your data is now safer with automatic weekly backups and
          advanced import/export options.
        </p>
      </div>
    </div>
  );
}

// Original component with Card wrapper for backward compatibility
export default function DataManagement() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Database className="h-5 w-5" />
          <span>Data management</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataManagementContent />
      </CardContent>
    </Card>
  );
}

// Export the content component for use in accordions
export { DataManagementContent };
