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
        setLoadError(null);
        const settings = await getUserSettings();
        if (mounted && settings?.lichessUsername) {
          const savedUsername = settings.lichessUsername.trim().toLowerCase();
          setUsername(savedUsername);
          setOriginalUsername(savedUsername);
        }
      } catch (error) {
        console.warn('Failed to load settings', error);
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
    // Don't save if there's a validation error
    if (validationError) {
      toast({
        title: 'Invalid Username',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    const trimmedValue = username.trim().toLowerCase();

    // Don't save if nothing changed
    if (trimmedValue === originalUsername) {
      toast({
        title: 'No Changes',
        description: 'Username is already saved',
      });
      return;
    }

    setIsLoading(true);

    try {
      await updateUserSettings({ lichessUsername: trimmedValue });
      setOriginalUsername(trimmedValue);
      setUsername(trimmedValue);

      // Restart Lichess sync with new username
      const { restartLichessSync } = await import('@/lib/lichess-sync');
      restartLichessSync(trimmedValue || undefined);

      toast({
        title: 'Saved',
        description: 'Lichess username updated successfully',
      });
    } catch (error) {
      console.error('Save error:', error);

      let errorTitle = 'Error';
      let errorMessage = 'Failed to save username';

      if (error instanceof SettingsError) {
        errorTitle = 'Save Failed';
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
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
