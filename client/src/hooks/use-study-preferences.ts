import { useState, useEffect } from 'react';
import {
  DEFAULT_STUDY_PREFERENCES,
  getUserStudyPreferences,
  normalizeStudyPreferences,
  updateUserStudyPreferences,
} from '@/lib/firebase/settings';
import { repairTagVocabularies } from '@/lib/tag-vocabulary';
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

// The realtime settings listener merges another device's vocabulary into
// IndexedDB, but this cache is only filled on load, so without this the tag
// pickers would keep showing the vocabulary as it stood when the tab opened —
// a tag added on a phone would not appear until a reload. Registered at module
// scope rather than in the hook so the cache stays current even while no picker
// is mounted; the next one to mount then renders the merged list immediately.
if (typeof window !== 'undefined') {
  window.addEventListener('cloud-sync:settings-merged', (event) => {
    const merged = (event as CustomEvent).detail as { studyPreferences?: unknown } | undefined;
    if (!merged?.studyPreferences) return;
    // Same healing the load path applies: the merged record comes straight from
    // a Firestore payload, so its lastModified may still be a raw Timestamp.
    const healed = normalizeStudyPreferences(merged.studyPreferences);
    if (healed) setGlobalPreferences(healed);
  });
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
  try {
    if (globalLoadingPromise) {
      await globalLoadingPromise;
    } else if (!globalPreferences) {
      globalLoadingPromise = getUserStudyPreferences();
      const result = await globalLoadingPromise;
      globalLoadingPromise = null;
      setGlobalPreferences(result);
    }

    await recoverTagVocabularies();
  } catch (error) {
    globalLoadingPromise = null;
    console.warn('Failed to preload study preferences:', error);
  }
}

// Recovery runs once per app load: a vocabulary that survived one check has
// nothing to recover on the next, and repeating it would re-read every session.
let vocabularyRecovery: Promise<void> | null = null;

/**
 * Restore tag vocabularies that were reset by a bad preferences read, using the
 * tags recorded on logged sessions. A no-op for healthy accounts.
 */
async function recoverTagVocabularies(): Promise<void> {
  if (vocabularyRecovery) return vocabularyRecovery;

  vocabularyRecovery = (async () => {
    const current = globalPreferences;
    if (!current) return;

    const repaired = await repairTagVocabularies(current, DEFAULT_STUDY_PREFERENCES.customTags);
    if (repaired === current) return;

    await updateUserStudyPreferences(repaired);
    setGlobalPreferences(repaired);
  })().catch((error) => {
    // Best-effort recovery: the app is fully usable without it, and the user can
    // always re-add tags by hand — but log with context so it stays diagnosable.
    console.warn('Failed to recover tag vocabularies from sessions:', error);
  });

  return vocabularyRecovery;
}

// Function to update preferences and invalidate cache
export async function updateStudyPreferences(preferences: UserStudyPreferences): Promise<void> {
  await updateUserStudyPreferences(preferences);

  // Update global cache and notify all mounted consumers
  setGlobalPreferences(preferences);
}

/**
 * Publish an already-saved preferences document to the cache without writing it
 * again. For callers that used a dedicated mutator (addCustomMistakeTag and
 * friends) the save has happened; re-running updateStudyPreferences on the
 * result would only repeat the validate → read → write cycle and queue a second
 * Firestore round trip.
 */
export function publishStudyPreferences(preferences: UserStudyPreferences): void {
  setGlobalPreferences(preferences);
}
