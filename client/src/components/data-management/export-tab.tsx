import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Download } from 'lucide-react';
import { exportManager, ExportOptions } from '@/lib/export/export-manager';

export default function ExportTab() {
  // Simplified export state - always export everything as JSON
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    try {
      setExporting(true);

      // Simple export: everything in JSON format
      const exportOptions: ExportOptions = {
        includeTrainingSessions: true,
        includeDailyGoals: true,
        includeSettings: true,
        includeMetadata: true,
        format: 'json',
        compressed: false,
      };

      const result = await exportManager.exportData(exportOptions);

      // Create blob (always JSON string for simplified export)
      const blob = new Blob([result.data as string], {
        type: 'application/json',
      });

      // Try File System Access API for better file saving experience
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: result.filename,
            types: [
              {
                description: 'JSON files',
                accept: {
                  'application/json': ['.json'],
                },
              },
            ],
          });

          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();

          toast({
            title: 'Export Complete',
            description: `Successfully exported ${result.metadata.sessionCount} sessions to chosen location`,
          });
          return;
        } catch (saveError) {
          // User cancelled or other error, continue to other methods
          if ((saveError as Error).name !== 'AbortError') {
            console.warn('File System Access API failed:', saveError);
          }
        }
      }

      // Try Web Share API (mobile native sharing)
      if (navigator.share && navigator.canShare) {
        try {
          const file = new File([blob], result.filename, {
            type: 'application/json',
          });

          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: 'Chess Training Data Export',
              text: `Complete backup of ${result.metadata.sessionCount} training sessions`,
              files: [file],
            });

            toast({
              title: 'Export Complete',
              description: `Successfully shared ${result.metadata.sessionCount} sessions`,
            });
            return;
          }
        } catch (shareError) {
          console.warn('Share API failed, falling back to download:', shareError);
        }
      }

      // Fallback to traditional download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Export Complete',
        description: `Successfully downloaded ${result.metadata.sessionCount} sessions`,
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'Failed to export data',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Download className="h-5 w-5" />
          <span>Export Training Data</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 text-center">
          <p className="text-sm text-gray-600">
            Export all your training data (sessions, goals, settings) in JSON format.
          </p>
          <div className="space-y-1 text-sm text-gray-500">
            <div>✓ Training Sessions & Games</div>
            <div>✓ Daily Goals & Progress</div>
            <div>✓ Settings & Preferences</div>
            <div>✓ Backup Metadata</div>
          </div>
        </div>

        <Button onClick={handleExport} disabled={exporting} className="w-full">
          {exporting ? 'Exporting...' : 'Export & Save Data'}
        </Button>

        <p className="text-center text-xs text-gray-500">
          Choose where to save: Local storage, Google Drive, or share to other apps
        </p>
      </CardContent>
    </Card>
  );
}
