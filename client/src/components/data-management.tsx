import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, Database } from "lucide-react";

import { useQueryClient } from "@tanstack/react-query";
import FirebaseAuth from "./firebase-auth";

export default function DataManagement() {
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleExport = async () => {
    try {
      const { exportData } = await import("@/lib/firebase-utils");
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
      const { importData } = await import("@/lib/firebase-utils");
      await importData(text);
      
      // Refresh all queries to show imported data
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["statistics"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-goal"] });
      
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



  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Database className="w-5 h-5" />
          <span>Data Management</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Firebase Cloud Sync */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-3 block">
            Cloud Sync
          </Label>
          <div className="space-y-3">
            <FirebaseAuth />
            <p className="text-sm text-gray-600">
              Your data is automatically synced to Firebase Cloud when you're online.
            </p>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Export Data
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
            Import Data
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

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> Your data is automatically saved to Firebase Cloud and synced across your devices. Export regularly to keep a backup of your training history.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}