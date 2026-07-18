import { logger } from './logger';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Utility for handling dynamic import failures with retry logic
export async function dynamicImportWithRetry<T>(
  importFn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await importFn();
    } catch (error) {
      lastError = error as Error;

      // If it's not a network-related error, don't retry
      if (!isNetworkError(error as Error)) {
        throw error;
      }

      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        console.error(`Dynamic import failed after ${maxRetries + 1} attempts:`, error);
        throw error;
      }

      // Wait before retrying with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`Dynamic import attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// Check if an error is network-related
export function isNetworkError(error: Error): boolean {
  const networkErrorPatterns = [
    'Failed to fetch',
    'NetworkError',
    'dynamically imported module',
    'ERR_NETWORK',
    'ERR_INTERNET_DISCONNECTED',
    'ERR_NETWORK_CHANGED',
  ];

  return networkErrorPatterns.some((pattern) => error.message.includes(pattern));
}

// Utility to clear app cache
export async function clearAppCache(): Promise<void> {
  try {
    // Clear service worker cache
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.includes('chess-training')) {
            return caches.delete(cacheName);
          }
        }),
      );
    }

    // Clear IndexedDB
    if ('indexedDB' in window) {
      const databases = await indexedDB.databases();
      await Promise.all(
        databases.map((db) => {
          if (db.name && db.name.includes('chess')) {
            return indexedDB.deleteDatabase(db.name);
          }
        }),
      );
    }

    // Unregister service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    logger.debug('App cache cleared successfully');
  } catch (error) {
    console.error('Failed to clear app cache:', error);
  }
}

// Utility to check if the app is running in a PWA context
export function isPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

// Utility to get app version for debugging
export function getAppVersion(): string {
  try {
    return import.meta.env.VITE_APP_VERSION || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Format a date for display in a consistent way
 */
export function formatSessionDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d
    .toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: 'numeric',
      hour12: true,
    })
    .replace(',', '');
}

/**
 * Check if a date is today
 */
export function isToday(date: Date | string): boolean {
  const d = date instanceof Date ? date : new Date(date);
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

/**
 * Get the start of today (midnight)
 */
export function getStartOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Get the start of the current week (Monday)
 */
export function getStartOfWeek(): Date {
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);
  return startOfWeek;
}

/**
 * Type-safe goal properties from TrainingSession
 */
export interface GoalProperties {
  goalTitle?: string;
  goalDescription?: string;
  goalWeekStart?: Date;
}

/**
 * Check if a TrainingSession has goal properties
 */
export function hasGoalProperties(session: any): session is GoalProperties {
  return (
    session &&
    (typeof session.goalTitle === 'string' ||
      typeof session.goalDescription === 'string' ||
      session.goalWeekStart instanceof Date)
  );
}

/**
 * Get goal properties from a TrainingSession
 */
export function getGoalProperties(session: any): GoalProperties | null {
  if (!hasGoalProperties(session)) {
    return null;
  }

  return {
    goalTitle: session.goalTitle,
    goalDescription: session.goalDescription,
    goalWeekStart:
      session.goalWeekStart instanceof Date
        ? session.goalWeekStart
        : session.goalWeekStart
          ? new Date(session.goalWeekStart)
          : undefined,
  };
}

// Daily Goals Validation Functions
export const DAILY_GOAL_LIMITS = {
  tacticsMinutes: { min: 0, max: 99 },
  gamesCount: { min: 0, max: 99 },
  studyMinutes: { min: 0, max: 99 },
} as const;

export interface GoalValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateTacticsMinutes(value: number): GoalValidationResult {
  if (value < DAILY_GOAL_LIMITS.tacticsMinutes.min) {
    return { isValid: false, error: 'Tactics minutes must be at least 0' };
  }
  if (value > DAILY_GOAL_LIMITS.tacticsMinutes.max) {
    return { isValid: false, error: 'Tactics minutes cannot exceed 99' };
  }
  if (!Number.isInteger(value)) {
    return { isValid: false, error: 'Tactics minutes must be a whole number' };
  }
  return { isValid: true };
}

export function validateGamesCount(value: number): GoalValidationResult {
  if (value < DAILY_GOAL_LIMITS.gamesCount.min) {
    return { isValid: false, error: 'Games count must be at least 0' };
  }
  if (value > DAILY_GOAL_LIMITS.gamesCount.max) {
    return { isValid: false, error: 'Games count cannot exceed 99' };
  }
  if (!Number.isInteger(value)) {
    return { isValid: false, error: 'Games count must be a whole number' };
  }
  return { isValid: true };
}

export function validateStudyMinutes(value: number): GoalValidationResult {
  if (value < DAILY_GOAL_LIMITS.studyMinutes.min) {
    return { isValid: false, error: 'Study minutes must be at least 0' };
  }
  if (value > DAILY_GOAL_LIMITS.studyMinutes.max) {
    return { isValid: false, error: 'Study minutes cannot exceed 99' };
  }
  if (!Number.isInteger(value)) {
    return { isValid: false, error: 'Study minutes must be a whole number' };
  }
  return { isValid: true };
}

export function hasActiveGoals(settings: any): boolean {
  if (!settings) return false;

  return (
    settings.tacticsMinutes > 0 ||
    settings.gamesCount > 0 ||
    settings.studyMinutes > 0 ||
    (Array.isArray(settings.tagGoals) && settings.tagGoals.length > 0)
  );
}

/**
 * Format study tags for display in history
 * Handles both new studyTags format and legacy studyType format
 */
export function formatStudyDisplay(session: any): string {
  const quantitySuffix =
    typeof session.quantity === 'number' && session.quantity > 0
      ? ` (${session.quantity} units${session.primaryStudyTag ? ` · ${session.primaryStudyTag}` : ''})`
      : '';

  // Try to parse studyTags first (new format)
  if (session.studyTags) {
    try {
      const tags =
        typeof session.studyTags === 'string' ? JSON.parse(session.studyTags) : session.studyTags;

      if (Array.isArray(tags) && tags.length > 0) {
        return `Study: ${tags.join(', ')}${quantitySuffix}`;
      }
    } catch (error) {
      console.warn('Failed to parse studyTags:', error);
    }
  }

  // Fall back to legacy studyType format
  if (session.studyType) {
    return `${session.studyType.charAt(0).toUpperCase()}${session.studyType.slice(1)} Study${quantitySuffix}`;
  }

  // Default fallback
  return `Study${quantitySuffix}`;
}
