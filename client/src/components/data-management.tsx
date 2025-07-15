import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, Database, FolderOpen, FolderX, Smartphone, Share, Cloud, CloudOff, Settings } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { localStorage } from "@/lib/storage";

export default function DataManagement() {
  const [importing, setImporting] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [mobileBackupLoading, setMobileBackupLoading] = useState(false);
  const [googleDriveEnabled, setGoogleDriveEnabled] = useState(false);
  const [googleDriveLoading, setGoogleDriveLoading] = useState(false);
  const [showGoogleDriveConfig, setShowGoogleDriveConfig] = useState(false);
  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");
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

  // Check sync status on component mount
  useEffect(() => {
    setSyncEnabled(localStorage.isFileSystemSyncEnabled());
    setGoogleDriveEnabled(localStorage.isGoogleDriveSyncEnabled());
  }, []);

  const handleMobileBackup = async () => {
    setMobileBackupLoading(true);
    try {
      await localStorage.createMobileBackup();
      toast({
        title: "Success",
        description: "Backup created! You can now save it to your device.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create backup",
        variant: "destructive",
      });
    } finally {
      setMobileBackupLoading(false);
    }
  };

  const handleGoogleDriveConfig = () => {
    if (clientId && apiKey) {
      localStorage.configureGoogleDrive(clientId, apiKey);
      setShowGoogleDriveConfig(false);
      toast({
        title: "Success",
        description: "Google Drive credentials configured. You can now enable sync.",
      });
    } else {
      toast({
        title: "Error",
        description: "Please enter both Client ID and API Key",
        variant: "destructive",
      });
    }
  };

  const handleEnableGoogleDrive = async () => {
    setGoogleDriveLoading(true);
    try {
      const success = await localStorage.enableGoogleDriveSync();
      if (success) {
        setGoogleDriveEnabled(true);
        toast({
          title: "Success",
          description: "Google Drive sync enabled! Your data will now sync automatically.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to enable Google Drive sync. Please check your credentials.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to enable Google Drive sync",
        variant: "destructive",
      });
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  const handleDisableGoogleDrive = async () => {
    setGoogleDriveLoading(true);
    try {
      await localStorage.disableGoogleDriveSync();
      setGoogleDriveEnabled(false);
      toast({
        title: "Success",
        description: "Google Drive sync disabled",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to disable Google Drive sync",
        variant: "destructive",
      });
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  const handleSyncToGoogleDrive = async () => {
    setGoogleDriveLoading(true);
    try {
      const success = await localStorage.syncToGoogleDrive();
      if (success) {
        toast({
          title: "Success",
          description: "Data synced to Google Drive successfully!",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to sync to Google Drive",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sync to Google Drive",
        variant: "destructive",
      });
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  const handleSyncFromGoogleDrive = async () => {
    setGoogleDriveLoading(true);
    try {
      const success = await localStorage.syncFromGoogleDrive();
      if (success) {
        // Refresh all queries to show synced data
        queryClient.invalidateQueries({ queryKey: ["/api/training-sessions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
        queryClient.invalidateQueries({ queryKey: ["/api/weekly-goal"] });
        
        toast({
          title: "Success",
          description: "Data synced from Google Drive successfully!",
        });
      } else {
        toast({
          title: "Info",
          description: "No new data found in Google Drive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sync from Google Drive",
        variant: "destructive",
      });
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isFileSystemSupported = localStorage.isFileSystemSyncSupported();
  const isMobileBackupSupported = localStorage.isMobileBackupSupported();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Database className="w-5 h-5" />
          <span>Data Management</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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

        {/* Desktop File System Backup */}
        {isFileSystemSupported && (
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
                disabled={syncLoading}
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                {syncLoading ? "Enabling..." : "Enable Auto-Backup"}
              </Button>
            )}
          </div>
        )}

        {/* Mobile Backup */}
        {!isFileSystemSupported && (
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              <Smartphone className="w-4 h-4 inline mr-1" />
              Mobile Backup
            </Label>
            <p className="text-sm text-gray-600 mb-3">
              {isMobileBackupSupported 
                ? "Create a backup file that you can share or save to your device" 
                : "Create a backup file that will be downloaded to your device"}
            </p>
            <Button 
              onClick={handleMobileBackup} 
              className="w-full" 
              variant="outline"
              disabled={mobileBackupLoading}
            >
              {isMobileBackupSupported ? (
                <Share className="w-4 h-4 mr-2" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {mobileBackupLoading ? "Creating..." : isMobileBackupSupported ? "Share Backup" : "Download Backup"}
            </Button>
            {localStorage.isBackupNeeded() && (
              <p className="text-xs text-amber-600 mt-2">
                💡 It's been a while since your last backup. Consider creating one now.
              </p>
            )}
          </div>
        )}

        {/* Google Drive Cloud Sync */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            <Cloud className="w-4 h-4 inline mr-1" />
            Google Drive Cloud Sync
          </Label>
          <p className="text-sm text-gray-600 mb-3">
            {googleDriveEnabled 
              ? "Your data automatically syncs to Google Drive after every change" 
              : "Enable automatic sync to Google Drive for cloud backup"}
          </p>
          
          {!showGoogleDriveConfig && !googleDriveEnabled && (
            <Button 
              onClick={() => setShowGoogleDriveConfig(true)}
              className="w-full mb-2" 
              variant="outline"
            >
              <Settings className="w-4 h-4 mr-2" />
              Configure Google Drive
            </Button>
          )}

          {showGoogleDriveConfig && (
            <div className="space-y-3 mb-3 p-3 border rounded-md">
              <div>
                <Label htmlFor="client-id" className="text-sm font-medium">
                  Google Client ID
                </Label>
                <Input
                  id="client-id"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Enter your Google Client ID"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="api-key" className="text-sm font-medium">
                  Google API Key
                </Label>
                <Input
                  id="api-key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Google API Key"
                  className="mt-1"
                />
              </div>
              <div className="flex space-x-2">
                <Button 
                  onClick={handleGoogleDriveConfig}
                  className="flex-1"
                  variant="outline"
                >
                  Save Configuration
                </Button>
                <Button 
                  onClick={() => setShowGoogleDriveConfig(false)}
                  className="flex-1"
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {googleDriveEnabled ? (
            <div className="space-y-2">
              <Button 
                onClick={handleDisableGoogleDrive} 
                className="w-full" 
                variant="outline"
                disabled={googleDriveLoading}
              >
                <CloudOff className="w-4 h-4 mr-2" />
                {googleDriveLoading ? "Disabling..." : "Disable Google Drive Sync"}
              </Button>
              <div className="flex space-x-2">
                <Button 
                  onClick={handleSyncToGoogleDrive}
                  className="flex-1 text-xs"
                  variant="outline"
                  disabled={googleDriveLoading}
                >
                  <Upload className="w-3 h-3 mr-1" />
                  Sync To Drive
                </Button>
                <Button 
                  onClick={handleSyncFromGoogleDrive}
                  className="flex-1 text-xs"
                  variant="outline"
                  disabled={googleDriveLoading}
                >
                  <Download className="w-3 h-3 mr-1" />
                  Sync From Drive
                </Button>
              </div>
            </div>
          ) : (
            !showGoogleDriveConfig && (
              <Button 
                onClick={handleEnableGoogleDrive} 
                className="w-full" 
                variant="outline"
                disabled={googleDriveLoading}
              >
                <Cloud className="w-4 h-4 mr-2" />
                {googleDriveLoading ? "Enabling..." : "Enable Google Drive Sync"}
              </Button>
            )
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> {googleDriveEnabled 
              ? "With Google Drive sync enabled, your data is automatically backed up to the cloud after every session. You can also use manual sync buttons as needed."
              : syncEnabled 
                ? "With auto-backup enabled, your data is automatically saved to your chosen folder after every session. You can still export manually as needed."
                : isFileSystemSupported 
                  ? "Data is stored locally while you use the app. Export regularly to keep a backup of your training history."
                  : "Your data is stored locally on your device. Use the mobile backup feature to save copies to your Downloads folder or share with other apps. The app will remind you when it's time to backup."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}