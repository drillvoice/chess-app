import { Suspense, useState } from 'react';
import { DataManagement } from '@/components/lazy-components';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import LichessSettings from '@/components/lichess-settings';
import { diagnoseDatabase, logDatabaseDiagnostics, forceDatabaseUpgrade, clearDatabaseAndReinitialize } from '@/lib/debug-utils';

export default function Account() {
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    try {
      const diagnostics = await diagnoseDatabase();
      logDatabaseDiagnostics(diagnostics);
      alert('Diagnostics completed! Check console for details.');
    } catch (error) {
      console.error('Diagnostics failed:', error);
      alert('Diagnostics failed! Check console for details.');
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  const handleForceUpgrade = async () => {
    if (!confirm('This will force a database upgrade. Continue?')) return;
    setIsUpgrading(true);
    try {
      await forceDatabaseUpgrade();
      alert('Database upgrade completed! Please refresh the page.');
    } catch (error) {
      console.error('Upgrade failed:', error);
      alert('Upgrade failed! Check console for details.');
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!confirm('This will clear ALL local data and reinitialize the database. This action cannot be undone! Continue?')) return;
    setIsClearing(true);
    try {
      await clearDatabaseAndReinitialize();
      alert('Database cleared and reinitialized! Please refresh the page.');
    } catch (error) {
      console.error('Clear failed:', error);
      alert('Clear failed! Check console for details.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Manage your account settings and data.</p>
        </CardContent>
      </Card>
      
      {/* Debug Section */}
      <Card>
        <CardHeader>
          <CardTitle>Database Debug Tools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600 mb-4">
            Use these tools to diagnose and fix database issues after the recent upgrade.
          </p>
          
          <div className="space-y-2">
            <Button 
              onClick={handleRunDiagnostics} 
              disabled={isRunningDiagnostics}
              variant="outline"
              className="w-full"
            >
              {isRunningDiagnostics ? 'Running Diagnostics...' : '🔍 Run Database Diagnostics'}
            </Button>
            
            <Button 
              onClick={handleForceUpgrade} 
              disabled={isUpgrading}
              variant="outline"
              className="w-full"
            >
              {isUpgrading ? 'Upgrading...' : '🔄 Force Database Upgrade'}
            </Button>
            
            <Button 
              onClick={handleClearDatabase} 
              disabled={isClearing}
              variant="destructive"
              className="w-full"
            >
              {isClearing ? 'Clearing...' : '🗑️ Clear Database & Reinitialize'}
            </Button>
          </div>
          
          <p className="text-xs text-gray-500 mt-4">
            <strong>Note:</strong> The "Clear Database" option will delete all local data. 
            If you're logged in with cloud sync, your data should be restored from the cloud.
          </p>
        </CardContent>
      </Card>
      
      <LichessSettings />
      <Suspense fallback={<div>Loading account data...</div>}>
        <DataManagement />
      </Suspense>
    </div>
  );
}
