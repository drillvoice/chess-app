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

export function useStudyPreferences(): UseStudyPreferencesReturn {
  const [preferences, setPreferences] = useState<UserStudyPreferences | null>(globalPreferences);
  const [isLoading, setIsLoading] = useState(!globalPreferences);
  const [error, setError] = useState<string | null>(null);

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
        globalPreferences = result;
        globalLoadingPromise = null;
        
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
      globalPreferences = result;
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
    globalPreferences = await globalLoadingPromise;
    globalLoadingPromise = null;
  } catch (error) {
    globalLoadingPromise = null;
    console.warn('Failed to preload study preferences:', error);
  }
}

// Function to update preferences and invalidate cache
export async function updateStudyPreferences(preferences: UserStudyPreferences): Promise<void> {
  await updateUserStudyPreferences(preferences);
  
  // Update global cache
  globalPreferences = preferences;
}
