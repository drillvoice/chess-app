import { TrainingSession } from '@shared/schema';
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
  await waitForAuth();

  // Save to Firestore first - this is the critical operation
  try {
    const settingsRef = doc(db, 'users', getCurrentUserId()!, 'settings', 'settings');
    await setDoc(settingsRef, settings, { merge: true });
  } catch (error) {
    console.error('Error updating user settings in Firestore:', error);
    if (error instanceof Error) {
      throw new SettingsError('Failed to save to cloud storage', error);
    }
    throw new SettingsError('Failed to save to cloud storage');
  }

  // Cache offline separately - don't fail the operation if this fails
  try {
    await offlineStorage.setSettings(settings);
  } catch (error) {
    console.warn('Failed to cache settings offline, but cloud save succeeded:', error);
    // Don't throw - the main save succeeded
  }
}
