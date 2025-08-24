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
  const [diagnosticResults, setDiagnosticResults] = useState<string>('');

  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    setDiagnosticResults('');
    try {
      const diagnostics = await diagnoseDatabase();
      logDatabaseDiagnostics(diagnostics);
      
      // Create a visual summary
      const summary = `
🔍 Database Diagnostics Results:

📊 Database Version: ${diagnostics.databaseVersion}
📁 Object Stores: ${diagnostics.objectStores.join(', ')}
📈 Sessions Count: ${diagnostics.sessionsCount}
📊 Statistics Exists: ${diagnostics.statisticsExists ? '✅' : '❌'}
⚙️ Settings Exists: ${diagnostics.settingsExists ? '✅' : '❌'}
🎯 Daily Goals Exists: ${diagnostics.dailyGoalsExists ? '✅' : '❌'}

${diagnostics.hasErrors ? '❌ Errors Found:' : '✅ No errors detected'}
${diagnostics.errors.map(error => `  - ${error}`).join('\n')}
      `.trim();
      
      setDiagnosticResults(summary);
    } catch (error) {
      console.error('Diagnostics failed:', error);
      setDiagnosticResults(`❌ Diagnostics failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  const handleForceUpgrade = async () => {
    if (!confirm('This will force a database upgrade. Continue?')) return;
    setIsUpgrading(true);
    try {
      await forceDatabaseUpgrade();
      setDiagnosticResults('✅ Database upgrade completed! Please refresh the page.');
    } catch (error) {
      console.error('Upgrade failed:', error);
      setDiagnosticResults(`❌ Upgrade failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!confirm('This will clear ALL local data and reinitialize the database. This action cannot be undone! Continue?')) return;
    setIsClearing(true);
    try {
      await clearDatabaseAndReinitialize();
      setDiagnosticResults('✅ Database cleared and reinitialized! Please refresh the page.');
    } catch (error) {
      console.error('Clear failed:', error);
      setDiagnosticResults(`❌ Clear failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
          
          {/* Diagnostic Results Display */}
          {diagnosticResults && (
            <div className="mt-4 p-3 bg-gray-50 rounded-md">
              <h4 className="font-semibold mb-2">Diagnostic Results:</h4>
              <pre className="text-xs whitespace-pre-wrap text-gray-700">
                {diagnosticResults}
              </pre>
            </div>
          )}
          
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
