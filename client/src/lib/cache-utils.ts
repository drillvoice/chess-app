import { TrainingSession } from '@shared/schema';

// Cache keys
const CACHE_KEYS = {
  SESSIONS: 'chess-logger-sessions',
  STATISTICS: 'chess-logger-statistics',
  WEEKLY_GOAL: 'chess-logger-weekly-goal',
  LAST_UPDATED: 'chess-logger-last-updated',
};

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

export interface CachedData<T> {
  data: T;
  timestamp: number;
}

export class DataCache {
  private static isExpired(cachedItem: CachedData<any>): boolean {
    return Date.now() - cachedItem.timestamp > CACHE_DURATION;
  }

  static get<T>(key: string): T | null {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const parsedCache: CachedData<T> = JSON.parse(cached);

      if (this.isExpired(parsedCache)) {
        this.remove(key);
        return null;
      }

      return parsedCache.data;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  static set<T>(key: string, data: T): void {
    try {
      const cachedData: CachedData<T> = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(cachedData));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  static remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Cache remove error:', error);
    }
  }

  static clear(): void {
    try {
      Object.values(CACHE_KEYS).forEach((key) => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }
}

// Specific cache methods for our data types
export const SessionsCache = {
  get: () => DataCache.get<TrainingSession[]>(CACHE_KEYS.SESSIONS),
  set: (sessions: TrainingSession[]) => DataCache.set(CACHE_KEYS.SESSIONS, sessions),
  remove: () => DataCache.remove(CACHE_KEYS.SESSIONS),
};

export const StatisticsCache = {
  get: () => DataCache.get<any>(CACHE_KEYS.STATISTICS),
  set: (stats: any) => DataCache.set(CACHE_KEYS.STATISTICS, stats),
  remove: () => DataCache.remove(CACHE_KEYS.STATISTICS),
};

export const WeeklyGoalCache = {
  get: () => DataCache.get<TrainingSession | null>(CACHE_KEYS.WEEKLY_GOAL),
  set: (goal: TrainingSession | null) => DataCache.set(CACHE_KEYS.WEEKLY_GOAL, goal),
  remove: () => DataCache.remove(CACHE_KEYS.WEEKLY_GOAL),
};
