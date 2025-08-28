import { TrainingSession, UserStudyPreferences, userStudyPreferencesSchema } from '@shared/schema';
import { WeeklyGoalCache } from '../cache-utils';
import { offlineStorage } from '../offline-storage';
import {
  db,
  waitForAuth,
  doc,
  getDoc,
  setDoc,
  getCurrentUserId,
} from './core';
import { getAllSessions } from './firestore';

export class SettingsError extends Error {
  constructor(message: string, public cause?: Error) {
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
}

// Retrieve user settings, preferring cached offline data when available
export async function getUserSettings(): Promise<UserSettings> {
  // Try cached data first for instant loading
  try {
    const cached = await offlineStorage.getSettings();
    if (cached) {
      return cached as UserSettings;
    }
  } catch (error) {
    console.warn('Failed to read settings from offline storage:', error);
  }

  // No cached data, fetch from Firestore
  try {
    await waitForAuth();
    const settingsRef = doc(db, 'users', getCurrentUserId()!, 'settings', 'settings');
    const snapshot = await getDoc(settingsRef);
    const settings = snapshot.exists() ? (snapshot.data() as UserSettings) : {};

    // Cache the result
    try {
      await offlineStorage.setSettings(settings);
    } catch (cacheError) {
      console.warn('Failed to cache settings offline:', cacheError);
    }

    return settings;
  } catch (error) {
    console.error('Error getting user settings from Firestore:', error);
    if (error instanceof Error) {
      throw new SettingsError('Failed to load settings from cloud storage', error);
    }
    throw new SettingsError('Failed to load settings');
  }
}

// Update user settings in Firestore and offline storage
export async function updateUserSettings(settings: UserSettings): Promise<void> {
  console.log('🔧 updateUserSettings called with:', settings);

  // Merge incoming settings with any existing ones in offline storage
  let existingSettings: UserSettings = {};
  try {
    existingSettings = ((await offlineStorage.getSettings()) as UserSettings) || {};
  } catch (error) {
    console.warn('Failed to read settings from offline storage:', error);
  }
  const mergedSettings = { ...existingSettings, ...settings };
  
  try {
    await waitForAuth();
    console.log('✅ Authentication completed, current user ID:', getCurrentUserId());
  } catch (error) {
    console.error('❌ waitForAuth failed:', error);
    throw error;
  }

  // Save to Firestore first - this is the critical operation
  try {
    const userId = getCurrentUserId();
    if (!userId) {
      throw new Error('No authenticated user found after waitForAuth');
    }
    
    const settingsRef = doc(db, 'users', userId, 'settings', 'settings');
    console.log('💾 Attempting to save to Firestore path:', `users/${userId}/settings/settings`);
    
    await setDoc(settingsRef, settings, { merge: true });
    console.log('✅ Successfully saved to Firestore');
  } catch (error) {
    console.error('❌ Error updating user settings in Firestore:', error);
    if (error instanceof Error) {
      throw new SettingsError('Failed to save to cloud storage', error);
    }
    throw new SettingsError('Failed to save to cloud storage');
  }

  // Cache offline separately - don't fail the operation if this fails
  try {
    await offlineStorage.setSettings(mergedSettings);
  } catch (error) {
    console.warn('Failed to cache settings offline, but cloud save succeeded:', error);
    // Don't throw - the main save succeeded
  }
}

// Default study preferences for new users
const DEFAULT_STUDY_PREFERENCES: UserStudyPreferences = {
  customTags: ['reading', 'videos', 'coaching'],
  lastModified: new Date(),
};

// Retrieve user study preferences, with smart defaults for new users (OFFLINE-FIRST)
export async function getUserStudyPreferences(): Promise<UserStudyPreferences> {
  console.log('🏷️ getUserStudyPreferences - starting offline-first load');
  
  try {
    // 1. Try offline storage FIRST (instant response)
    console.log('📱 Trying offline storage first...');
    const cachedSettings = await offlineStorage.getSettings();
    
    if (cachedSettings?.studyPreferences) {
      console.log('📱 Found study preferences in offline storage:', cachedSettings.studyPreferences);
      const parsed = userStudyPreferencesSchema.safeParse(cachedSettings.studyPreferences);
      if (parsed.success) {
        console.log('✅ Offline study preferences valid, returning immediately');
        
        // Background sync from Firestore (non-blocking)
        queueMicrotask(() => syncStudyPreferencesFromFirestore());
        
        return parsed.data;
      } else {
        console.warn('❌ Invalid offline study preferences, will try Firestore:', parsed.error);
      }
    } else {
      console.log('📱 No study preferences in offline storage');
    }
    
    // 2. If no valid offline data, try Firestore (but with quick timeout)
    console.log('☁️ Trying Firestore with timeout...');
    const firestoreSettings = await Promise.race([
      getUserSettings(),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('Firestore timeout')), 3000)
      )
    ]);
    
    if (firestoreSettings?.studyPreferences) {
      const parsed = userStudyPreferencesSchema.safeParse(firestoreSettings.studyPreferences);
      if (parsed.success) {
        console.log('✅ Got study preferences from Firestore');
        // Cache for next time
        await offlineStorage.setSettings(firestoreSettings);
        return parsed.data;
      }
    }
    
    // 3. Fall back to defaults
    console.log('🎯 Using default study preferences');
    const defaults = DEFAULT_STUDY_PREFERENCES;
    
    // Save defaults to offline storage for next time
    try {
      const defaultSettings = { studyPreferences: defaults };
      await offlineStorage.setSettings(defaultSettings);
      console.log('💾 Saved default preferences to offline storage');
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
    console.log('🔄 Background sync: checking Firestore for updated study preferences...');
    const settings = await getUserSettings();
    
    if (settings.studyPreferences) {
      const parsed = userStudyPreferencesSchema.safeParse(settings.studyPreferences);
      if (parsed.success) {
        // Update offline cache with latest from Firestore
        await offlineStorage.setSettings(settings);
        console.log('🔄 Background sync: updated offline cache with Firestore data');
      }
    }
  } catch (error) {
    console.log('🔄 Background sync failed (this is normal if offline):', error instanceof Error ? error.message : error);
  }
}

// Update user study preferences (OFFLINE-FIRST)
export async function updateUserStudyPreferences(preferences: UserStudyPreferences): Promise<void> {
  console.log('🏷️ updateUserStudyPreferences called with:', preferences);
  
  try {
    // Validate the preferences data
    const validatedPreferences = userStudyPreferencesSchema.parse(preferences);
    
    // Add timestamp
    const preferencesWithTimestamp = {
      ...validatedPreferences,
      lastModified: new Date(),
    };
    
    // 1. Save to offline storage FIRST (instant feedback)
    console.log('💾 Saving to offline storage first...');
    try {
      const currentOfflineSettings = await offlineStorage.getSettings() || {};
      const updatedOfflineSettings = {
        ...currentOfflineSettings,
        studyPreferences: preferencesWithTimestamp,
      };
      
      await offlineStorage.setSettings(updatedOfflineSettings);
      console.log('✅ Study preferences saved to offline storage');
    } catch (offlineError) {
      console.error('❌ Failed to save to offline storage:', offlineError);
      throw new SettingsError('Failed to save preferences offline', offlineError instanceof Error ? offlineError : undefined);
    }
    
    // 2. Queue Firestore sync in background (non-blocking)
    queueMicrotask(() => syncStudyPreferencesToFirestore(preferencesWithTimestamp));
    
    console.log('✅ Study preferences updated successfully (offline-first)');
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
    console.log('🔄 Background sync: saving study preferences to Firestore...');
    
    // Get current settings from Firestore (with timeout)
    const currentSettings = await Promise.race([
      getUserSettings(),
      new Promise<UserSettings>((_, reject) => 
        setTimeout(() => reject(new Error('Firestore timeout')), 5000)
      )
    ]);
    
    // Update with new study preferences
    const updatedSettings: UserSettings = {
      ...currentSettings,
      studyPreferences: preferences,
    };
    
    // Save to Firestore
    await updateUserSettings(updatedSettings);
    console.log('🔄 Background sync: study preferences saved to Firestore');
    
  } catch (error) {
    console.log('🔄 Background Firestore sync failed (this is normal if offline):', error instanceof Error ? error.message : error);
    // Don't throw - the offline save already succeeded
  }
}

// Add a custom tag to user preferences
export async function addCustomStudyTag(tagName: string): Promise<void> {
  console.log('🆕 Adding custom study tag:', tagName);
  
  try {
    const currentPreferences = await getUserStudyPreferences();
    
    // Check if tag already exists (case-insensitive)
    const existingTag = currentPreferences.customTags.find(
      tag => tag.toLowerCase() === tagName.toLowerCase()
    );
    
    if (existingTag) {
      console.log('Tag already exists:', existingTag);
      return; // No need to add
    }
    
    // Add new tag (alphabetically sorted)
    const updatedTags = [...currentPreferences.customTags, tagName].sort();
    
    const updatedPreferences: UserStudyPreferences = {
      ...currentPreferences,
      customTags: updatedTags,
    };
    
    await updateUserStudyPreferences(updatedPreferences);
    console.log('✅ Custom tag added successfully');
  } catch (error) {
    console.error('❌ Error adding custom study tag:', error);
    if (error instanceof Error) {
      throw new SettingsError('Failed to add custom study tag', error);
    }
    throw new SettingsError('Failed to add custom study tag');
  }
}

// Remove a custom tag from user preferences
export async function removeCustomStudyTag(tagName: string): Promise<void> {
  console.log('🗑️ Removing custom study tag:', tagName);
  
  try {
    const currentPreferences = await getUserStudyPreferences();
    
    // Remove the tag (case-sensitive match)
    const updatedTags = currentPreferences.customTags.filter(tag => tag !== tagName);
    
    if (updatedTags.length === currentPreferences.customTags.length) {
      console.log('Tag not found:', tagName);
      return; // Tag wasn't found, no change needed
    }
    
    const updatedPreferences: UserStudyPreferences = {
      ...currentPreferences,
      customTags: updatedTags,
    };
    
    await updateUserStudyPreferences(updatedPreferences);
    console.log('✅ Custom tag removed successfully');
  } catch (error) {
    console.error('❌ Error removing custom study tag:', error);
    if (error instanceof Error) {
      throw new SettingsError('Failed to remove custom study tag', error);
    }
    throw new SettingsError('Failed to remove custom study tag');
  }
}
