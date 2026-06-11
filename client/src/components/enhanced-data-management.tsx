import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download,
  Upload,
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Database,
} from 'lucide-react';

import { exportManager, ExportOptions } from '@/lib/export/export-manager';
import {
  importManager,
  ImportOptions,
  ImportPreview,
  ImportProgress,
} from '@/lib/import/import-manager';
import {
  backupVerificationManager,
  BackupHealth,
  RestorePoint,
} from '@/lib/backup/backup-verification';

export default function EnhancedDataManagement() {
  // Simplified export state - always export everything as JSON
  const [exporting, setExporting] = useState(false);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    conflictResolution: 'skip',
    validateSchema: true,
    createBackup: true,
    dryRun: false,
  });

  // Backup verification state
  const [backupHealth, setBackupHealth] = useState<BackupHealth | null>(null);
  const [restorePoints, setRestorePoints] = useState<RestorePoint[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Clear local data state
  const [clearingData, setClearingData] = useState(false);

  const deviceFileInputRef = useRef<HTMLInputElement>(null);
  const cloudFileInputRef = useRef<HTMLInputElement>(null);
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

  const handleImportPreview = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setSelectedImportFile(file);
      const content = await file.text();
      const preview = await importManager.previewImport(content);
      setImportPreview(preview);

      if (!preview.validation.valid) {
        toast({
          title: 'Import Validation Failed',
          description: `${preview.validation.errors.length} errors found in import file`,
          variant: 'destructive',
        });
      }
    } catch (_error) {
      setSelectedImportFile(null);
      setImportPreview(null);
      toast({
        title: 'Preview Failed',
        description: 'Could not preview import file',
        variant: 'destructive',
      });
    }
  };

  const handleImport = async () => {
    if (!importPreview || !selectedImportFile) {
      toast({
        title: 'No file selected',
        description: 'Choose an import file first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setImporting(true);
      setImportProgress(null);

      const content = await selectedImportFile.text();

      const result = await importManager.importData(content, importOptions, (progress) =>
        setImportProgress(progress),
      );

      if (result.success) {
        toast({
          title: 'Import Complete',
          description: `Imported ${result.imported.sessions} sessions successfully`,
        });
        setImportPreview(null);
        setSelectedImportFile(null);
        if (deviceFileInputRef.current) deviceFileInputRef.current.value = '';
        if (cloudFileInputRef.current) cloudFileInputRef.current.value = '';
      } else {
        toast({
          title: 'Import Partially Failed',
          description: `${result.errors.length} errors occurred during import`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Failed to import data',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const handleBackupVerification = async () => {
    try {
      setVerifying(true);
      const health = await backupVerificationManager.calculateBackupHealth();
      const points = await backupVerificationManager.getAvailableRestorePoints();
      setBackupHealth(health);
      setRestorePoints(points);

      toast({
        title: 'Backup Verification Complete',
        description: `Backup health: ${health.overallHealth}%`,
      });
    } catch (_error) {
      toast({
        title: 'Verification Failed',
        description: 'Could not verify backup integrity',
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleRestore = async (restorePointId: string) => {
    try {
      setRestoring(true);

      const result = await backupVerificationManager.restoreFromPoint(
        restorePointId,
        {
          includeTrainingSessions: true,
          includeDailyGoals: true,
          includeSettings: false,
          createBackup: true,
        },
        (progress) => {
          toast({
            title: `Restore Progress: ${Math.round(progress.percent)}%`,
            description: progress.phase,
          });
        },
      );

      if (result.success) {
        toast({
          title: 'Restore Complete',
          description: `Restored ${result.restored.sessions} sessions`,
        });
      } else {
        toast({
          title: 'Restore Failed',
          description: result.errors.join(', '),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Restore Failed',
        description: error instanceof Error ? error.message : 'Restore operation failed',
        variant: 'destructive',
      });
    } finally {
      setRestoring(false);
    }
  };

  const getHealthBadgeVariant = (health: number) => {
    if (health >= 80) return 'default';
    if (health >= 60) return 'secondary';
    return 'destructive';
  };

  const getHealthIcon = (health: number) => {
    if (health >= 80) return CheckCircle;
    if (health >= 60) return AlertTriangle;
    return XCircle;
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="export" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="export">Export Data</TabsTrigger>
          <TabsTrigger value="import">Import Data</TabsTrigger>
          <TabsTrigger value="backup">Backup Verification</TabsTrigger>
        </TabsList>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-4">
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
        </TabsContent>

        {/* Import Tab */}
        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Upload className="h-5 w-5" />
                <span>Import Training Data</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Import Source Options */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card className="border border-gray-200">
                  <CardContent className="space-y-3 p-4 text-center">
                    <Upload className="mx-auto h-8 w-8 text-blue-600" />
                    <h4 className="font-medium">Import from Device</h4>
                    <p className="text-sm text-gray-600">
                      Choose a backup file from your device storage
                    </p>
                    <Input
                      type="file"
                      accept=".json,.csv"
                      onChange={handleImportPreview}
                      ref={deviceFileInputRef}
                      className="cursor-pointer"
                    />
                  </CardContent>
                </Card>

                <Card className="border border-green-200">
                  <CardContent className="space-y-3 p-4 text-center">
                    <Database className="mx-auto h-8 w-8 text-green-600" />
                    <h4 className="font-medium">Import from Google Drive</h4>
                    <p className="text-sm text-gray-600">
                      Select a backup file from Google Drive or cloud storage
                    </p>
                    <Input
                      type="file"
                      accept=".json,.csv"
                      onChange={handleImportPreview}
                      ref={cloudFileInputRef}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-green-600">Uses your device's native file picker</p>
                  </CardContent>
                </Card>
              </div>

              {/* Import Options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="conflict-resolution">Conflict Resolution</Label>
                  <Select
                    value={importOptions.conflictResolution}
                    onValueChange={(value: ImportOptions['conflictResolution']) =>
                      setImportOptions((prev) => ({ ...prev, conflictResolution: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Skip Duplicates</SelectItem>
                      <SelectItem value="overwrite">Overwrite Existing</SelectItem>
                      <SelectItem value="merge">Merge Data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="validate-schema"
                      checked={importOptions.validateSchema}
                      onCheckedChange={(checked) =>
                        setImportOptions((prev) => ({ ...prev, validateSchema: !!checked }))
                      }
                    />
                    <Label htmlFor="validate-schema">Validate Data Schema</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="create-backup"
                      checked={importOptions.createBackup}
                      onCheckedChange={(checked) =>
                        setImportOptions((prev) => ({ ...prev, createBackup: !!checked }))
                      }
                    />
                    <Label htmlFor="create-backup">Create Backup First</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="dry-run"
                      checked={importOptions.dryRun}
                      onCheckedChange={(checked) =>
                        setImportOptions((prev) => ({ ...prev, dryRun: !!checked }))
                      }
                    />
                    <Label htmlFor="dry-run">Dry Run (Preview Only)</Label>
                  </div>
                </div>
              </div>

              {/* Import Preview */}
              {importPreview && (
                <div className="space-y-3 rounded-lg border p-4">
                  <h4 className="flex items-center space-x-2 font-medium">
                    <Database className="h-4 w-4" />
                    <span>Import Preview</span>
                    <Badge variant={importPreview.validation.valid ? 'default' : 'destructive'}>
                      {importPreview.validation.valid ? 'Valid' : 'Invalid'}
                    </Badge>
                  </h4>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>Total Sessions: {importPreview.totalSessions}</div>
                    <div>New Sessions: {importPreview.newSessions}</div>
                    <div>Duplicates: {importPreview.duplicateSessions}</div>
                    <div>Invalid: {importPreview.invalidSessions}</div>
                    <div>Has Settings: {importPreview.hasSettings ? '✓' : '✗'}</div>
                    <div>Has Daily Goals: {importPreview.hasDailyGoals ? '✓' : '✗'}</div>
                  </div>

                  {importPreview.conflicts.length > 0 && (
                    <div>
                      <Label>Conflicts Found:</Label>
                      <div className="space-y-1">
                        {importPreview.conflicts.slice(0, 3).map((conflict, i) => (
                          <div key={i} className="text-sm text-muted-foreground">
                            Session {conflict.existingId}: {conflict.type}
                          </div>
                        ))}
                        {importPreview.conflicts.length > 3 && (
                          <div className="text-sm text-muted-foreground">
                            +{importPreview.conflicts.length - 3} more conflicts
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {importPreview.validation.errors.length > 0 && (
                    <div>
                      <Label className="text-destructive">Validation Errors:</Label>
                      <div className="space-y-1">
                        {importPreview.validation.errors.slice(0, 3).map((error, i) => (
                          <div key={i} className="text-sm text-destructive">
                            {error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Import Progress */}
              {importProgress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{importProgress.phase}</span>
                    <span>
                      {importProgress.actualProcessed !== undefined && importProgress.actualTotal
                        ? `${importProgress.actualProcessed}/${importProgress.actualTotal} sessions`
                        : `${Math.round(importProgress.processed)}%`}
                    </span>
                  </div>
                  <Progress value={(importProgress.processed / importProgress.total) * 100} />
                </div>
              )}

              <Button
                onClick={handleImport}
                disabled={
                  !importPreview ||
                  !selectedImportFile ||
                  importing ||
                  !importPreview.validation.valid
                }
                className="w-full"
              >
                {importing ? 'Importing...' : 'Import Data'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backup Verification Tab */}
        <TabsContent value="backup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Backup Verification & Restore</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handleBackupVerification} disabled={verifying} className="w-full">
                {verifying ? 'Verifying...' : 'Verify Backup Integrity'}
              </Button>

              {/* Backup Health */}
              {backupHealth && (
                <div className="space-y-3 rounded-lg border p-4">
                  <h4 className="flex items-center space-x-2 font-medium">
                    {(() => {
                      const Icon = getHealthIcon(backupHealth.overallHealth);
                      return <Icon className="h-4 w-4" />;
                    })()}
                    <span>Backup Health</span>
                    <Badge variant={getHealthBadgeVariant(backupHealth.overallHealth)}>
                      {backupHealth.overallHealth}%
                    </Badge>
                  </h4>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>Data Integrity: {backupHealth.dataIntegrity}%</div>
                    <div>Completeness: {backupHealth.completeness}%</div>
                    <div>Consistency: {backupHealth.consistency}%</div>
                    <div>Last Backup: {backupHealth.lastBackupAge}h ago</div>
                  </div>
                </div>
              )}

              {/* Restore Points */}
              {restorePoints.length > 0 && (
                <div className="space-y-3">
                  <Label>Available Restore Points</Label>
                  {restorePoints.map((point) => (
                    <div key={point.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Clock className="h-4 w-4" />
                          <span className="font-medium">{point.description}</span>
                          <Badge variant="outline">
                            {point.source === 'cloud_backup' ? 'Cloud' : 'Local'}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleRestore(point.id)}
                          disabled={restoring}
                        >
                          {restoring ? 'Restoring...' : 'Restore'}
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-sm text-muted-foreground">
                        <div>Sessions: {point.sessionCount}</div>
                        <div>Settings: {point.hasSettings ? '✓' : '✗'}</div>
                        <div>Goals: {point.hasDailyGoals ? '✓' : '✗'}</div>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {point.timestamp.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
    </div>
  );
}
