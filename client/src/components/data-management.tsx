import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Download, Upload, Database } from 'lucide-react';

import { useQueryClient } from '@tanstack/react-query';
import FirebaseAuth from './firebase-auth';
// Dynamic import for firebase to maintain code splitting

function DataManagementContent() {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleExport = async () => {
    try {
      const { exportData } = await import('@/lib/firebase');
      const data = await exportData();

      const blob = new Blob([data], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chess-training-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Success',
        description: 'Training data exported successfully!',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to export data',
        variant: 'destructive',
      });
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setProgress(null);
    try {
      const text = await file.text();
      const { importData } = await import('@/lib/firebase');
      const { imported, skipped } = await importData(text, (processed, total) => {
        setProgress({ processed, total });
      });

      // Refresh all queries to show imported data
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-goal'] });

      const pluralImported = imported === 1 ? 'session' : 'sessions';
      const pluralSkipped = skipped === 1 ? 'session' : 'sessions';
      const desc = skipped
        ? `${imported} ${pluralImported} imported, ${skipped} ${pluralSkipped} skipped`
        : `${imported} ${pluralImported} imported`;

      toast({
        title: 'Success',
        description: desc,
      });
    } catch (error) {
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Failed to import data.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
      setProgress(null);
      // Reset the input
      event.target.value = '';
    }
  };

  const handleClearLocalData = async () => {
    try {
      const { SessionsCache } = await import('@/lib/cache-utils');
      const { offlineStorage } = await import('@/lib/offline-storage');
      SessionsCache.remove();
      await offlineStorage.clear();
      toast({
        title: 'Cleared',
        description: 'Local data removed from this device.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to clear local data',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Firebase Cloud Sync */}
      <div>
        <Label className="mb-3 block text-sm font-medium text-gray-700">Cloud sync</Label>
        <div className="space-y-3">
          <FirebaseAuth />
          <p className="text-sm text-gray-600">
            Your data is automatically synced to Firebase Cloud for this device when you're online.
            Disabling cloud sync keeps existing data on this device unless you clear it below.
          </p>
        </div>
      </div>

      <div>
        <Label className="mb-2 block text-sm font-medium text-gray-700">Export data</Label>
        <p className="mb-3 text-sm text-gray-600">
          Download all your training sessions and goals as a JSON file
        </p>
        <Button onClick={handleExport} className="w-full" variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export data
        </Button>
      </div>

      <div>
        <Label className="mb-2 block text-sm font-medium text-gray-700">Import data</Label>
        <p className="mb-3 text-sm text-gray-600">
          Import a previously exported JSON file to restore your training data
        </p>
        <Label htmlFor="import-file" className="cursor-pointer">
          <Button asChild className="w-full" variant="outline" disabled={importing}>
            <span>
              <Upload className="mr-2 h-4 w-4" />
              {importing
                ? progress
                  ? `Importing ${progress.processed}/${progress.total}`
                  : 'Importing...'
                : 'Import data'}
            </span>
          </Button>
        </Label>
        <Input
          id="import-file"
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </div>

      <div>
        <Label className="mb-2 block text-sm font-medium text-gray-700">Clear local data</Label>
        <p className="mb-3 text-sm text-gray-600">
          Remove all locally stored training data from this device. Cloud data will remain
          unaffected.
        </p>
        <Button onClick={handleClearLocalData} className="w-full" variant="destructive">
          Clear local data
        </Button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Disabling cloud sync will stop future syncing but leaves existing
          data on this device. Use Clear Local Data above to remove it. Export regularly to keep a
          backup of your training history.
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
