import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Utility for handling dynamic import failures with retry logic
export async function dynamicImportWithRetry<T>(
  importFn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
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
      await new Promise(resolve => setTimeout(resolve, delay));
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
    'ERR_NETWORK_CHANGED'
  ];
  
  return networkErrorPatterns.some(pattern => 
    error.message.includes(pattern)
  );
}

// Utility to clear app cache
export async function clearAppCache(): Promise<void> {
  try {
    // Clear service worker cache
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.includes('chess-training')) {
            return caches.delete(cacheName);
          }
        })
      );
    }
    
    // Clear IndexedDB
    if ('indexedDB' in window) {
      const databases = await indexedDB.databases();
      await Promise.all(
        databases.map(db => {
          if (db.name && db.name.includes('chess')) {
            return indexedDB.deleteDatabase(db.name);
          }
        })
      );
    }
    
    // Unregister service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(registration => registration.unregister())
      );
    }
    
    console.log('App cache cleared successfully');
  } catch (error) {
    console.error('Failed to clear app cache:', error);
  }
}

// Utility to check if the app is running in a PWA context
export function isPWA(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true;
}

// Utility to get app version for debugging
export function getAppVersion(): string {
  try {
    // Try to get version from the version.json file
    return (window as any).__APP_VERSION__ || 'unknown';
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
  return session && (
    typeof session.goalTitle === 'string' ||
    typeof session.goalDescription === 'string' ||
    session.goalWeekStart instanceof Date
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
    goalWeekStart: session.goalWeekStart instanceof Date 
      ? session.goalWeekStart 
      : session.goalWeekStart ? new Date(session.goalWeekStart) : undefined,
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
    (settings.tacticsMinutes > 0) ||
    (settings.gamesCount > 0) ||
    (settings.studyMinutes > 0)
  );
}

// Progress Calculation Types and Utilities
export interface GoalProgress {
  current: number;
  target: number;
  percentage: number;
  isComplete: boolean;
}

export interface DailyGoalsProgress {
  tactics: GoalProgress;
  games: GoalProgress;
  study: GoalProgress;
  hasAnyProgress: boolean;
  totalCompleted: number;
  totalGoals: number;
}

/**
 * Get today's date range (start and end of day)
 */
export function getTodayDateRange(): { start: Date; end: Date } {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return { start, end };
}

/**
 * Check if a session is from today
 */
export function isSessionFromToday(session: any): boolean {
  if (!session?.date) return false;
  
  const sessionDate = new Date(session.date);
  const today = new Date();
  
  return (
    sessionDate.getFullYear() === today.getFullYear() &&
    sessionDate.getMonth() === today.getMonth() &&
    sessionDate.getDate() === today.getDate()
  );
}

/**
 * Calculate progress for a single goal type
 */
export function calculateGoalProgress(
  current: number,
  target: number
): GoalProgress {
  if (target <= 0) {
    return {
      current: 0,
      target: 0,
      percentage: 0,
      isComplete: false,
    };
  }

  const percentage = Math.min((current / target) * 100, 100);
  const isComplete = current >= target;

  return {
    current,
    target,
    percentage: Math.round(percentage),
    isComplete,
  };
}

/**
 * Calculate total minutes from tactics sessions
 */
export function calculateTacticsMinutes(sessions: any[]): number {
  return sessions
    .filter(session => session.type === 'tactics' && session.duration)
    .reduce((total, session) => total + (session.duration || 0), 0);
}

/**
 * Calculate total games count from game sessions
 */
export function calculateGamesCount(sessions: any[]): number {
  return sessions.filter(session => session.type === 'game').length;
}

/**
 * Calculate total minutes from study sessions
 */
export function calculateStudyMinutes(sessions: any[]): number {
  return sessions
    .filter(session => session.type === 'study' && session.duration)
    .reduce((total, session) => total + (session.duration || 0), 0);
}

/**
 * Calculate progress for all daily goals based on today's sessions
 */
export function calculateDailyGoalsProgress(
  settings: any,
  todaySessions: any[]
): DailyGoalsProgress {
  if (!settings || !todaySessions) {
    return {
      tactics: calculateGoalProgress(0, 0),
      games: calculateGoalProgress(0, 0),
      study: calculateGoalProgress(0, 0),
      hasAnyProgress: false,
      totalCompleted: 0,
      totalGoals: 0,
    };
  }

  // Calculate current progress for each goal type
  const tacticsCurrent = calculateTacticsMinutes(todaySessions);
  const gamesCurrent = calculateGamesCount(todaySessions);
  const studyCurrent = calculateStudyMinutes(todaySessions);

  // Calculate progress for each goal
  const tactics = calculateGoalProgress(tacticsCurrent, settings.tacticsMinutes || 0);
  const games = calculateGoalProgress(gamesCurrent, settings.gamesCount || 0);
  const study = calculateGoalProgress(studyCurrent, settings.studyMinutes || 0);

  // Calculate overall progress
  const totalCompleted = [tactics, games, study].filter(goal => goal.isComplete).length;
  const totalGoals = [tactics.target, games.target, study.target].filter(target => target > 0).length;
  const hasAnyProgress = tactics.current > 0 || games.current > 0 || study.current > 0;

  return {
    tactics,
    games,
    study,
    hasAnyProgress,
    totalCompleted,
    totalGoals,
  };
}
