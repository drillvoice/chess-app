import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getUserSettings, updateUserSettings, SettingsError } from '@/lib/firebase';

function LichessSettingsContent() {
  const [username, setUsername] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const { toast } = useToast();

  // Validation function
  const validateUsername = (username: string): string | null => {
    const normalized = username.trim().toLowerCase();
    if (!normalized) return null; // Allow empty username
    if (normalized.length < 3) return 'Username must be at least 3 characters';
    if (normalized.length > 20) return 'Username must be 20 characters or less';
    if (!/^[a-z0-9_-]+$/.test(normalized)) {
      return 'Username can only contain letters, numbers, underscores, and hyphens';
    }
    return null;
  };

  // Load settings on component mount
  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      try {
        console.log('🔄 Loading Lichess settings...');
        setLoadError(null);
        const settings = await getUserSettings();
        console.log('✅ Settings loaded:', settings);
        if (mounted && settings?.lichessUsername) {
          const savedUsername = settings.lichessUsername.trim().toLowerCase();
          setUsername(savedUsername);
          setOriginalUsername(savedUsername);
          console.log('📝 Username loaded:', savedUsername);
        }
      } catch (error) {
        console.error('❌ Failed to load settings:', error);
        if (mounted) {
          const errorMessage =
            error instanceof SettingsError
              ? 'Could not load your Lichess username from cloud storage'
              : 'Failed to load settings';
          setLoadError(errorMessage);
        }
      }
    };

    loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  // Validate username as user types
  useEffect(() => {
    const error = validateUsername(username);
    setValidationError(error);
  }, [username]);

  const handleSave = async () => {
    console.log('💾 Starting save process...');
    
    // Don't save if there's a validation error
    if (validationError) {
      console.log('❌ Validation error:', validationError);
      toast({
        title: 'Invalid Username',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    const trimmedValue = username.trim().toLowerCase();
    console.log('📝 Saving username:', trimmedValue);

    // Don't save if nothing changed
    if (trimmedValue === originalUsername) {
      console.log('ℹ️ No changes detected');
      toast({
        title: 'No Changes',
        description: 'Username is already saved',
      });
      return;
    }

    setIsLoading(true);
    console.log('⏳ Setting loading state...');

    try {
      console.log('🔧 Calling updateUserSettings...');
      await updateUserSettings({ lichessUsername: trimmedValue });
      console.log('✅ Settings updated successfully');
      
      setOriginalUsername(trimmedValue);
      setUsername(trimmedValue);

      // Restart Lichess sync with new username
      console.log('🔄 Restarting Lichess sync...');
      const { restartLichessSync } = await import('@/lib/lichess-sync');
      restartLichessSync(trimmedValue || undefined);

      console.log('🎉 Save process completed successfully');
      toast({
        title: 'Saved',
        description: 'Lichess username updated successfully',
      });
    } catch (error) {
      console.error('❌ Save error:', error);

      let errorTitle = 'Error';
      let errorMessage = 'Failed to save username';

      if (error instanceof SettingsError) {
        errorTitle = 'Save Failed';
        errorMessage = error.message;
        console.error('❌ SettingsError details:', error.cause);
      } else if (error instanceof Error) {
        errorMessage = error.message;
        console.error('❌ Error details:', error.stack);
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      console.log('🏁 Clearing loading state');
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  };

  const handleDebugTest = async () => {
    try {
      const { testSettingsStorage, testFirebaseSettings } = await import('@/lib/debug-utils');
      
      console.log('🧪 Starting debug tests...');
      await testSettingsStorage();
      await testFirebaseSettings();
      
      toast({
        title: 'Debug Test Complete',
        description: 'Check console for test results',
      });
    } catch (error) {
      console.error('Debug test failed:', error);
      toast({
        title: 'Debug Test Failed',
        description: 'Check console for details',
        variant: 'destructive',
      });
    }
  };

  const hasUnsavedChanges = username.trim().toLowerCase() !== originalUsername;

  return (
    <div className="space-y-4">
      {loadError && <div className="rounded bg-red-50 p-2 text-sm text-red-600">{loadError}</div>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <Label htmlFor="lichess-username" className="sr-only">
            Lichess Username
          </Label>
          <Input
            id="lichess-username"
            placeholder="Enter your Lichess username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className={validationError ? 'border-red-500' : ''}
          />
          {validationError && <p className="mt-1 text-sm text-red-600">{validationError}</p>}
        </div>

        <Button
          onClick={handleSave}
          disabled={isLoading || !!validationError || !hasUnsavedChanges}
          className="shrink-0"
        >
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <p className="text-xs text-gray-600">
        Link your Lichess account to automatically import completed games into your training log.
      </p>

      {/* Debug section - only show in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-4 p-3 bg-gray-50 rounded border">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Debug Tools</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDebugMode(!isDebugMode)}
            >
              {isDebugMode ? 'Hide' : 'Show'}
            </Button>
          </div>
          
          {isDebugMode && (
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDebugTest}
                className="w-full"
              >
                Test Storage
              </Button>
              <p className="text-xs text-gray-500">
                Current username: {originalUsername || 'none'}<br/>
                Has changes: {hasUnsavedChanges ? 'yes' : 'no'}<br/>
                Loading: {isLoading ? 'yes' : 'no'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Original component with Card wrapper for backward compatibility
export default function LichessSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lichess integration</CardTitle>
      </CardHeader>
      <CardContent>
        <LichessSettingsContent />
      </CardContent>
    </Card>
  );
}

// Export the content component for use in accordions
export { LichessSettingsContent };
