import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, Database, FolderOpen, FolderX, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { localStorage } from "@/lib/storage";
// import FirebaseAuth from "./firebase-auth";

export default function DataManagement() {
  const [importing, setImporting] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [forceSyncLoading, setForceSyncLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleExport = async () => {
    try {
      const response = await fetch("/api/export");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chess-training-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "Training data exported successfully!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export data",
        variant: "destructive",
      });
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      await apiRequest("POST", "/api/import", { data: text });
      
      // Refresh all queries to show imported data
      queryClient.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-goal"] });
      
      toast({
        title: "Success",
        description: "Training data imported successfully!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to import data. Please check the file format.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      // Reset the input
      event.target.value = '';
    }
  };

  const handleEnableFileSync = async () => {
    if (!localStorage.isFileSystemSyncSupported()) {
      toast({
        title: "Not Supported",
        description: "File System Access API not supported in this browser",
        variant: "destructive",
      });
      return;
    }

    setSyncLoading(true);
    try {
      const success = await localStorage.enableFileSystemSync();
      if (success) {
        setSyncEnabled(true);
        toast({
          title: "Success",
          description: "Automatic file backup enabled! Your data will be automatically saved to the selected folder.",
        });
      } else {
        toast({
          title: "Cancelled",
          description: "Folder selection was cancelled",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to enable automatic backup",
        variant: "destructive",
      });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleDisableFileSync = async () => {
    setSyncLoading(true);
    try {
      await localStorage.disableFileSystemSync();
      setSyncEnabled(false);
      toast({
        title: "Success",
        description: "Automatic file backup disabled",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to disable automatic backup",
        variant: "destructive",
      });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleForceSync = async () => {
    setForceSyncLoading(true);
    try {
      await localStorage.forceSyncNow();
      
      // Refresh all queries to show synced data
      queryClient.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-goal"] });
      
      toast({
        title: "Success",
        description: "Data synchronized successfully!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sync data. Please check your connection.",
        variant: "destructive",
      });
    } finally {
      setForceSyncLoading(false);
    }
  };

  // Check sync status on component mount
  useEffect(() => {
    setSyncEnabled(localStorage.isFileSystemSyncEnabled());
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Database className="w-5 h-5" />
          <span>Data Management</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Firebase Cloud Sync - Temporarily disabled */}
        {/* <div>
          <Label className="text-sm font-medium text-gray-700 mb-3 block">
            Cloud Sync
          </Label>
          <div className="space-y-3">
            <FirebaseAuth />
            <Button 
              onClick={handleForceSync} 
              className="w-full" 
              variant="outline"
              disabled={forceSyncLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${forceSyncLoading ? 'animate-spin' : ''}`} />
              {forceSyncLoading ? "Syncing..." : "Force Sync Now"}
            </Button>
          </div>
        </div> */}

        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Backup Your Data
          </Label>
          <p className="text-sm text-gray-600 mb-3">
            Download all your training sessions and goals as a JSON file
          </p>
          <Button onClick={handleExport} className="w-full" variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Data
          </Button>
        </div>

        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Restore Your Data
          </Label>
          <p className="text-sm text-gray-600 mb-3">
            Import a previously exported JSON file to restore your training data
          </p>
          <Label htmlFor="import-file" className="cursor-pointer">
            <Button asChild className="w-full" variant="outline" disabled={importing}>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                {importing ? "Importing..." : "Import Data"}
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
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Automatic File Backup
          </Label>
          <p className="text-sm text-gray-600 mb-3">
            {syncEnabled 
              ? "Your data is automatically saved to a local folder after every change" 
              : "Enable automatic backup to save your data to a local folder"}
          </p>
          {syncEnabled ? (
            <Button 
              onClick={handleDisableFileSync} 
              className="w-full" 
              variant="outline"
              disabled={syncLoading}
            >
              <FolderX className="w-4 h-4 mr-2" />
              {syncLoading ? "Disabling..." : "Disable Auto-Backup"}
            </Button>
          ) : (
            <Button 
              onClick={handleEnableFileSync} 
              className="w-full" 
              variant="outline"
              disabled={syncLoading || !localStorage.isFileSystemSyncSupported()}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              {syncLoading ? "Enabling..." : "Enable Auto-Backup"}
            </Button>
          )}
          {!localStorage.isFileSystemSyncSupported() && (
            <p className="text-xs text-gray-500 mt-2">
              Auto-backup requires a modern browser with File System Access API support
            </p>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> {syncEnabled 
              ? "With auto-backup enabled, your data is automatically saved to your chosen folder after every session. You can still export manually as needed."
              : "Data is stored locally while you use the app. Export regularly to keep a backup of your training history."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}