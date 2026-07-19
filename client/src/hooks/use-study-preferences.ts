import { useState, useEffect } from 'react';
import { getUserStudyPreferences, updateUserStudyPreferences } from '@/lib/firebase/settings';
import type { UserStudyPreferences } from '@shared/schema';

interface UseStudyPreferencesReturn {
  preferences: UserStudyPreferences | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Global cache to avoid multiple simultaneous requests
let globalPreferences: UserStudyPreferences | null = null;
let globalLoadingPromise: Promise<UserStudyPreferences> | null = null;

// Mounted hook instances subscribe here so a preferences update from one
// component (e.g. adding a tag in the study modal) propagates to every other
// consumer (e.g. the goal-settings tag dropdown) without a page reload.
const listeners = new Set<(prefs: UserStudyPreferences | null) => void>();

function setGlobalPreferences(prefs: UserStudyPreferences | null): void {
  globalPreferences = prefs;
  listeners.forEach((listener) => listener(prefs));
}

export function useStudyPreferences(): UseStudyPreferencesReturn {
  const [preferences, setPreferences] = useState<UserStudyPreferences | null>(globalPreferences);
  const [isLoading, setIsLoading] = useState(!globalPreferences);
  const [error, setError] = useState<string | null>(null);

  // Stay in sync with cache updates made by other components
  useEffect(() => {
    const listener = (prefs: UserStudyPreferences | null) => setPreferences(prefs);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const loadPreferences = async () => {
      // If we already have global preferences, use them immediately
      if (globalPreferences) {
        setPreferences(globalPreferences);
        setIsLoading(false);
        return;
      }

      // If there's already a loading promise, wait for it
      if (globalLoadingPromise) {
        try {
          const result = await globalLoadingPromise;
          setPreferences(result);
          setIsLoading(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load preferences');
          setIsLoading(false);
        }
        return;
      }

      // Start loading
      setIsLoading(true);
      setError(null);

      try {
        globalLoadingPromise = getUserStudyPreferences();
        const result = await globalLoadingPromise;

        // Update global cache
        globalLoadingPromise = null;
        setGlobalPreferences(result);

        setPreferences(result);
        setIsLoading(false);
      } catch (err) {
        globalLoadingPromise = null;
        setError(err instanceof Error ? err.message : 'Failed to load preferences');
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, []);

  const refetch = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Clear global cache to force fresh load
      globalPreferences = null;
      globalLoadingPromise = null;

      const result = await getUserStudyPreferences();
      setGlobalPreferences(result);
      setPreferences(result);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
      setIsLoading(false);
    }
  };

  return {
    preferences,
    isLoading,
    error,
    refetch,
  };
}

// Function to preload preferences (call this early in app initialization)
export async function preloadStudyPreferences(): Promise<void> {
  if (globalPreferences || globalLoadingPromise) {
    return; // Already loading or loaded
  }

  try {
    globalLoadingPromise = getUserStudyPreferences();
    const result = await globalLoadingPromise;
    globalLoadingPromise = null;
    setGlobalPreferences(result);
  } catch (error) {
    globalLoadingPromise = null;
    console.warn('Failed to preload study preferences:', error);
  }
}

// Function to update preferences and invalidate cache
export async function updateStudyPreferences(preferences: UserStudyPreferences): Promise<void> {
  await updateUserStudyPreferences(preferences);

  // Update global cache and notify all mounted consumers
  setGlobalPreferences(preferences);
}
