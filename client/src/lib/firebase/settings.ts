import { logger } from '../logger';
import {
  MAX_CUSTOM_MISTAKE_TAGS,
  MAX_CUSTOM_STUDY_TAGS,
  TrainingSession,
  UserStudyPreferences,
  normalizeStudyTagKey,
  userStudyPreferencesSchema,
} from '@shared/schema';
import { WeeklyGoalCache } from '../cache-utils';
import { normalizeTagVocabulary } from '../tag-vocabulary';
import { offlineStorage } from '../offline-storage';
import { db, waitForAuth, doc, getDoc, setDoc, getCurrentUserId } from './core';
import { getAllSessions } from './firestore';
import { mergeSettingsForSync, normalizeTagConfigs } from './sync/reconciliation';
import { toDate } from './sync/serialization';

export class SettingsError extends Error {
  constructor(
    message: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'SettingsError';
  }
}

export async function getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
  try {
    // Try cache first for instant loading
    const cachedGoal = WeeklyGoalCache.get();
    if (cachedGoal !== null) {
      // Return cached data immediately, then update in background
      updateWeeklyGoalInBackground();
      return cachedGoal || undefined;
    }

    // If no cache, calculate from sessions
    return await calculateWeeklyGoal();
  } catch (error) {
    console.error('Error getting weekly goal:', error);
    return undefined;
  }
}

async function calculateWeeklyGoal(): Promise<TrainingSession | undefined> {
  try {
    const sessions = await getAllSessions();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const goal = sessions.find((session) => session.type === 'goal' && session.date >= oneWeekAgo);

    // Cache the result (including null/undefined)
    WeeklyGoalCache.set(goal || null);

    return goal;
  } catch (error) {
    console.error('Error calculating weekly goal:', error);
    // Cache null on error to prevent repeated failures
    WeeklyGoalCache.set(null);
    return undefined;
  }
}

async function updateWeeklyGoalInBackground(): Promise<void> {
  try {
    await calculateWeeklyGoal();
    // Cache will be updated in calculateWeeklyGoal
  } catch (error) {
    console.error('Weekly goal background update failed:', error);
  }
}

export interface UserSettings {
  lichessUsername?: string;
  studyPreferences?: UserStudyPreferences;
  lastModified?: Date | string;
}

// Retrieve user settings, preferring cached offline data when available
export async function getUserSettings(): Promise<UserSettings> {
  logger.debug('📱 getUserSettings called');

  // Try cached data first for instant loading
  try {
    const cached = await offlineStorage.getSettings();
    if (cached) {
      logger.debug('✅ Found cached settings:', cached);
      return cached as UserSettings;
    }
    logger.debug('📱 No cached settings found');
  } catch (error) {
    console.warn('Failed to read settings from offline storage:', error);
  }

  // No cached data, try to fetch from Firestore (with timeout)
  try {
    const settings = await fetchSettingsFromFirestore();

    // Cache the result
    try {
      await offlineStorage.updateSettings((existing) => ({ ...(existing ?? {}), ...settings }));
      logger.debug('✅ Settings cached to offline storage');
    } catch (cacheError) {
      console.warn('Failed to cache settings offline:', cacheError);
    }

    return settings;
  } catch (error) {
    console.error('❌ Error getting user settings from Firestore:', error);
    throw new SettingsError(
      'Failed to load settings from cloud storage',
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Read the cloud settings document, bypassing the offline cache that
 * getUserSettings prefers. Callers that exist to reconcile with the cloud need
 * the real remote copy — reading through the cache would just hand them back
 * what they already have.
 */
async function fetchSettingsFromFirestore(): Promise<UserSettings> {
  logger.debug('☁️ Attempting to fetch from Firestore...');
  await waitForAuth();
  const settingsRef = doc(db, 'users', getCurrentUserId()!, 'settings', 'settings');
  const snapshot = await getDoc(settingsRef);
  const settings = snapshot.exists() ? (snapshot.data() as UserSettings) : {};
  logger.debug('✅ Firestore settings loaded:', settings);
  return settings;
}

// Update user settings in Firestore and offline storage
export async function updateUserSettings(settings: UserSettings): Promise<void> {
  logger.debug('🔧 updateUserSettings called with:', settings);

  // Always save to offline storage first (offline-first approach). The merge
  // runs inside updateSettings so it sees whatever else has been written since
  // this call started — concurrent writers used to overwrite each other here.
  let mergedSettingsWithTimestamp: UserSettings = { ...settings, lastModified: new Date() };
  try {
    logger.debug('📱 Saving to offline storage first...');
    mergedSettingsWithTimestamp = (await offlineStorage.updateSettings((existing) => ({
      ...(existing ?? {}),
      ...settings,
      lastModified: new Date(),
    }))) as UserSettings;
    logger.debug('✅ Successfully saved to offline storage', mergedSettingsWithTimestamp);
  } catch (error) {
    console.warn('❌ Failed to save to offline storage:', error);
    // Continue even if offline caching fails
  }

  // Try to save to Firestore (but don't fail if it doesn't work)
  try {
    logger.debug('🔐 Waiting for authentication...');
    await waitForAuth();
    logger.debug('✅ Authentication completed, current user ID:', getCurrentUserId());
  } catch (error) {
    console.warn('⚠️ Authentication failed, settings saved locally only:', error);
    // Don't throw - the offline save already succeeded
    return;
  }

  // Save to Firestore
  try {
    const userId = getCurrentUserId();
    if (!userId) {
      console.warn('⚠️ No authenticated user found, settings saved locally only');
      return;
    }

    const settingsRef = doc(db, 'users', userId, 'settings', 'settings');
    logger.debug('💾 Attempting to save to Firestore path:', `users/${userId}/settings/settings`);

    await setDoc(settingsRef, mergedSettingsWithTimestamp, { merge: true });
    logger.debug('✅ Successfully saved to Firestore');
  } catch (error) {
    console.error('⚠️ Failed to save to Firestore:', error);
    throw new SettingsError(
      'Failed to save to cloud storage',
      error instanceof Error ? error : undefined,
    );
  }
}

// Default study preferences for new users
export const DEFAULT_STUDY_PREFERENCES: UserStudyPreferences = {
  customTags: ['reading', 'videos', 'coaching'],
  tagConfigs: {},
  // Deliberately empty: the mistake vocabulary is entirely user-defined.
  customMistakeTags: [],
  lastModified: new Date(),
};

function pruneTagConfigs(
  tagConfigs: NonNullable<UserStudyPreferences['tagConfigs']>,
  tags: string[],
): UserStudyPreferences['tagConfigs'] {
  const allowedKeys = new Set(tags.map((tag) => normalizeStudyTagKey(tag)));
  const pruned = Object.fromEntries(
    Object.entries(tagConfigs ?? {}).filter(([key]) => allowedKeys.has(normalizeStudyTagKey(key))),
  );
  return pruned;
}

/**
 * Heal a persisted preferences record instead of discarding it.
 *
 * The tag vocabularies are the only copy of the user's tags — nothing else in the
 * app can reconstruct `customMistakeTags` — so a single bad field must never cost
 * the whole document. The realistic offender is `lastModified`: cloud payloads
 * carry a Firestore `Timestamp`, and structured-cloning one into IndexedDB strips
 * its prototype, leaving `{seconds, nanoseconds}` that `isoDateOptional` rejects.
 * Before this healer that failed the whole `safeParse`, and the caller fell back to
 * DEFAULT_STUDY_PREFERENCES — wiping the mistake vocabulary and resetting the study
 * tags to the seeded three. Returns null only when there is genuinely nothing usable.
 */
export function normalizeStudyPreferences(raw: unknown): UserStudyPreferences | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  const candidate: Record<string, unknown> = { ...record };

  if ('lastModified' in candidate) {
    const lastModified = toDate(candidate.lastModified);
    if (lastModified) {
      candidate.lastModified = lastModified;
    } else {
      logger.warn('Dropping unreadable study preferences lastModified', {
        value: record.lastModified,
      });
      delete candidate.lastModified;
    }
  }

  // Only rewrite keys the record actually has: an older document that predates a
  // field must keep getting the schema default rather than an empty list.
  if (candidate.customTags !== undefined) {
    candidate.customTags = normalizeTagVocabulary(candidate.customTags, MAX_CUSTOM_STUDY_TAGS);
  }
  if (candidate.customMistakeTags !== undefined) {
    candidate.customMistakeTags = normalizeTagVocabulary(
      candidate.customMistakeTags,
      MAX_CUSTOM_MISTAKE_TAGS,
    );
  }
  if (candidate.tagConfigs !== undefined) {
    candidate.tagConfigs = normalizeTagConfigs(candidate.tagConfigs);
  }

  const parsed = userStudyPreferencesSchema.safeParse(candidate);
  if (!parsed.success) {
    console.warn('Study preferences could not be healed, falling back to defaults:', parsed.error);
    return null;
  }

  return parsed.data;
}

// Retrieve user study preferences, with smart defaults for new users (OFFLINE-FIRST)
export async function getUserStudyPreferences(): Promise<UserStudyPreferences> {
  logger.debug('🏷️ getUserStudyPreferences - starting offline-first load');

  try {
    // 1. Try offline storage FIRST (instant response)
    logger.debug('📱 Trying offline storage first...');
    const cachedSettings = await offlineStorage.getSettings();

    if (cachedSettings?.studyPreferences) {
      logger.debug(
        '📱 Found study preferences in offline storage:',
        cachedSettings.studyPreferences,
      );
      const healed = normalizeStudyPreferences(cachedSettings.studyPreferences);
      if (healed) {
        logger.debug('✅ Offline study preferences usable, returning immediately');

        // Background sync from Firestore (non-blocking)
        queueMicrotask(() => syncStudyPreferencesFromFirestore());

        return healed;
      }
      console.warn('❌ Unusable offline study preferences, will try Firestore');
    } else {
      logger.debug('📱 No study preferences in offline storage');
    }

    // 2. If no valid offline data, try Firestore (but with quick timeout)
    logger.debug('☁️ Trying Firestore with timeout...');
    const firestoreSettings = await Promise.race([
      getUserSettings(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore timeout')), 3000),
      ),
    ]);

    if (firestoreSettings?.studyPreferences) {
      const healed = normalizeStudyPreferences(firestoreSettings.studyPreferences);
      if (healed) {
        logger.debug('✅ Got study preferences from Firestore');
        // Cache the healed preferences, not the raw doc: writing the raw
        // `lastModified` back would re-poison the cache on the next read.
        await offlineStorage.updateSettings((existing) => ({
          ...(existing ?? {}),
          ...firestoreSettings,
          studyPreferences: healed,
        }));
        return healed;
      }
    }

    // 3. Fall back to defaults
    logger.debug('🎯 Using default study preferences');
    const defaults = DEFAULT_STUDY_PREFERENCES;

    // Save defaults to offline storage for next time, merging into the existing
    // record — the settings store holds one document, so writing only
    // `studyPreferences` would drop lichessUsername and every synced key with it.
    try {
      await offlineStorage.updateSettings((current) => ({
        ...(current ?? {}),
        studyPreferences: defaults,
      }));
      logger.debug('💾 Saved default preferences to offline storage');
    } catch (cacheError) {
      console.warn('Failed to cache default preferences:', cacheError);
    }

    return defaults;
  } catch (error) {
    console.error('❌ Error in getUserStudyPreferences:', error);
    // Always return defaults to keep app functional
    return DEFAULT_STUDY_PREFERENCES;
  }
}

// Background sync function (non-blocking)
async function syncStudyPreferencesFromFirestore(): Promise<void> {
  try {
    logger.debug('🔄 Background sync: checking Firestore for updated study preferences...');
    const cloudSettings = await fetchSettingsFromFirestore();

    if (cloudSettings.studyPreferences) {
      // Merge rather than overwrite: the cloud copy may be missing tags this
      // device added while offline, and mergeSettingsForSync also unions the tag
      // vocabularies and converts Firestore Timestamps before they reach IndexedDB.
      // The merge runs inside updateSettings so a tag saved while the cloud read
      // was in flight is merged in rather than overwritten by this write.
      await offlineStorage.updateSettings((localSettings) =>
        mergeSettingsForSync(localSettings ?? {}, cloudSettings),
      );
      logger.debug('🔄 Background sync: merged Firestore study preferences into offline cache');
    }
  } catch (error) {
    logger.debug(
      '🔄 Background sync failed (this is normal if offline):',
      error instanceof Error ? error.message : error,
    );
  }
}

// Update user study preferences (OFFLINE-FIRST)
export async function updateUserStudyPreferences(preferences: UserStudyPreferences): Promise<void> {
  logger.debug('🏷️ updateUserStudyPreferences called with:', preferences);

  try {
    // Validate the preferences data
    const validatedPreferences = userStudyPreferencesSchema.parse({
      ...preferences,
      tagConfigs: pruneTagConfigs(preferences.tagConfigs ?? {}, preferences.customTags ?? []),
    });

    // Add timestamp
    const preferencesWithTimestamp = {
      ...validatedPreferences,
      lastModified: new Date(),
    };

    // 1. Save to offline storage FIRST (instant feedback)
    logger.debug('💾 Saving to offline storage first...');
    try {
      await offlineStorage.updateSettings((currentOfflineSettings) => ({
        ...(currentOfflineSettings ?? {}),
        studyPreferences: preferencesWithTimestamp,
      }));
      logger.debug('✅ Study preferences saved to offline storage');
    } catch (offlineError) {
      console.error('❌ Failed to save to offline storage:', offlineError);
      throw new SettingsError(
        'Failed to save preferences offline',
        offlineError instanceof Error ? offlineError : undefined,
      );
    }

    // 2. Queue Firestore sync in background (non-blocking)
    queueMicrotask(() => syncStudyPreferencesToFirestore(preferencesWithTimestamp));

    logger.debug('✅ Study preferences updated successfully (offline-first)');
  } catch (error) {
    console.error('❌ Error updating study preferences:', error);
    if (error instanceof Error) {
      throw new SettingsError('Failed to save study preferences', error);
    }
    throw new SettingsError('Failed to save study preferences');
  }
}

// Background sync to Firestore (non-blocking)
async function syncStudyPreferencesToFirestore(preferences: UserStudyPreferences): Promise<void> {
  try {
    logger.debug('🔄 Background sync: saving study preferences to Firestore...');

    // Get current settings from Firestore (with timeout)
    const currentSettings = await Promise.race([
      getUserSettings(),
      new Promise<UserSettings>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore timeout')), 5000),
      ),
    ]);

    // Update with new study preferences
    const updatedSettings: UserSettings = {
      ...currentSettings,
      studyPreferences: preferences,
    };

    // Save to Firestore
    await updateUserSettings(updatedSettings);
    logger.debug('🔄 Background sync: study preferences saved to Firestore');
  } catch (error) {
    logger.debug(
      '🔄 Background Firestore sync failed (this is normal if offline):',
      error instanceof Error ? error.message : error,
    );
    // Don't throw - the offline save already succeeded
  }
}

/**
 * Add a tag to the study vocabulary and return the saved preferences.
 *
 * Returning the new document lets callers refresh the in-memory cache without
 * issuing a second save of their own: the UI used to follow this with a full
 * updateStudyPreferences write, which repeated the whole validate → read →
 * write cycle and queued a second Firestore round trip for one added tag.
 */
export async function addCustomStudyTag(tagName: string): Promise<UserStudyPreferences> {
  logger.debug('🆕 Adding custom study tag:', tagName);

  try {
    const currentPreferences = await getUserStudyPreferences();

    // Check if tag already exists (case-insensitive)
    const existingTag = currentPreferences.customTags.find(
      (tag) => tag.toLowerCase() === tagName.toLowerCase(),
    );

    if (existingTag) {
      logger.debug('Tag already exists:', existingTag);
      return currentPreferences; // No need to add
    }

    // Add new tag (alphabetically sorted)
    const updatedTags = [...currentPreferences.customTags, tagName].sort();

    const updatedPreferences: UserStudyPreferences = {
      ...currentPreferences,
      customTags: updatedTags,
      tagConfigs: pruneTagConfigs(currentPreferences.tagConfigs ?? {}, updatedTags),
    };

    await updateUserStudyPreferences(updatedPreferences);
    logger.debug('✅ Custom tag added successfully');
    return updatedPreferences;
  } catch (error) {
    console.error('❌ Error adding custom study tag:', error);
    if (error instanceof Error) {
      throw new SettingsError('Failed to add custom study tag', error);
    }
    throw new SettingsError('Failed to add custom study tag');
  }
}

// Remove a custom tag from user preferences
export async function removeCustomStudyTag(tagName: string): Promise<UserStudyPreferences> {
  logger.debug('🗑️ Removing custom study tag:', tagName);

  try {
    const currentPreferences = await getUserStudyPreferences();

    // Remove the tag (case-sensitive match)
    const updatedTags = currentPreferences.customTags.filter((tag) => tag !== tagName);

    if (updatedTags.length === currentPreferences.customTags.length) {
      logger.debug('Tag not found:', tagName);
      return currentPreferences; // Tag wasn't found, no change needed
    }

    const updatedPreferences: UserStudyPreferences = {
      ...currentPreferences,
      customTags: updatedTags,
      tagConfigs: pruneTagConfigs(currentPreferences.tagConfigs ?? {}, updatedTags),
    };

    await updateUserStudyPreferences(updatedPreferences);
    logger.debug('✅ Custom tag removed successfully');
    return updatedPreferences;
  } catch (error) {
    console.error('❌ Error removing custom study tag:', error);
    if (error instanceof Error) {
      throw new SettingsError('Failed to remove custom study tag', error);
    }
    throw new SettingsError('Failed to remove custom study tag');
  }
}

// Add a mistake tag to the user's game-mistake vocabulary
export async function addCustomMistakeTag(tagName: string): Promise<UserStudyPreferences> {
  logger.debug('🆕 Adding custom mistake tag:', tagName);

  try {
    const currentPreferences = await getUserStudyPreferences();
    const currentTags = currentPreferences.customMistakeTags ?? [];

    // Check if tag already exists (case-insensitive)
    const existingTag = currentTags.find((tag) => tag.toLowerCase() === tagName.toLowerCase());

    if (existingTag) {
      logger.debug('Mistake tag already exists:', existingTag);
      return currentPreferences; // No need to add
    }

    // Add new tag (alphabetically sorted)
    const updatedTags = [...currentTags, tagName].sort();

    const updatedPreferences: UserStudyPreferences = {
      ...currentPreferences,
      customMistakeTags: updatedTags,
    };
    await updateUserStudyPreferences(updatedPreferences);
    logger.debug('✅ Custom mistake tag added successfully');
    return updatedPreferences;
  } catch (error) {
    console.error('❌ Error adding custom mistake tag:', error);
    if (error instanceof Error) {
      throw new SettingsError('Failed to add custom mistake tag', error);
    }
    throw new SettingsError('Failed to add custom mistake tag');
  }
}

// Remove a mistake tag from the user's game-mistake vocabulary
export async function removeCustomMistakeTag(tagName: string): Promise<UserStudyPreferences> {
  logger.debug('🗑️ Removing custom mistake tag:', tagName);

  try {
    const currentPreferences = await getUserStudyPreferences();
    const currentTags = currentPreferences.customMistakeTags ?? [];

    // Remove the tag (case-sensitive match)
    const updatedTags = currentTags.filter((tag) => tag !== tagName);

    if (updatedTags.length === currentTags.length) {
      logger.debug('Mistake tag not found:', tagName);
      return currentPreferences; // Tag wasn't found, no change needed
    }

    const updatedPreferences: UserStudyPreferences = {
      ...currentPreferences,
      customMistakeTags: updatedTags,
    };
    await updateUserStudyPreferences(updatedPreferences);
    logger.debug('✅ Custom mistake tag removed successfully');
    return updatedPreferences;
  } catch (error) {
    console.error('❌ Error removing custom mistake tag:', error);
    if (error instanceof Error) {
      throw new SettingsError('Failed to remove custom mistake tag', error);
    }
    throw new SettingsError('Failed to remove custom mistake tag');
  }
}
