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
import { Upload, Database } from 'lucide-react';
import {
  importManager,
  ImportOptions,
  ImportPreview,
  ImportProgress,
} from '@/lib/import/import-manager';

export default function ImportTab() {
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

  const deviceFileInputRef = useRef<HTMLInputElement>(null);
  const cloudFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

  return (
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
              <p className="text-sm text-gray-600">Choose a backup file from your device storage</p>
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
            !importPreview || !selectedImportFile || importing || !importPreview.validation.valid
          }
          className="w-full"
        >
          {importing ? 'Importing...' : 'Import Data'}
        </Button>
      </CardContent>
    </Card>
  );
}
