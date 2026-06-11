import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ExportTab from '@/components/data-management/export-tab';
import ImportTab from '@/components/data-management/import-tab';
import BackupTab from '@/components/data-management/backup-tab';
import ClearLocalData from '@/components/data-management/clear-local-data';

// Composition shell: each section owns its own state and side effects.
// See client/src/components/data-management/ for the implementations.
export default function EnhancedDataManagement() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="export" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="export">Export Data</TabsTrigger>
          <TabsTrigger value="import">Import Data</TabsTrigger>
          <TabsTrigger value="backup">Backup Verification</TabsTrigger>
        </TabsList>

        <TabsContent value="export" className="space-y-4">
          <ExportTab />
        </TabsContent>

        <TabsContent value="import" className="space-y-4">
          <ImportTab />
        </TabsContent>

        <TabsContent value="backup" className="space-y-4">
          <BackupTab />
        </TabsContent>
      </Tabs>

      <ClearLocalData />
    </div>
  );
}
