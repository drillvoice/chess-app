import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function ClearLocalData() {
  const [clearingData, setClearingData] = useState(false);
  const { toast } = useToast();

  const handleClearLocalData = async () => {
    const shouldSkipConfirmation = import.meta.env.MODE === 'test';
    if (
      !shouldSkipConfirmation &&
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function'
    ) {
      const confirmed = window.confirm(
        'Are you sure? This will permanently delete all local data.',
      );
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
    } catch (error) {
      console.error('Failed to clear local data', error);
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Clear local data</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
