// Cache warming utilities to ensure data is available immediately

import { logger } from './logger';
import { queryClient } from './queryClient';

interface CacheWarmingConfig {
  sessions: boolean;
  statistics: boolean;
  weeklyGoal: boolean;
}

export async function warmCache(config: Partial<CacheWarmingConfig> = {}) {
  const { sessions = true, statistics = true, weeklyGoal = true } = config;

  const warmingPromises: Promise<void>[] = [];

  // Warm sessions cache
  if (sessions) {
    warmingPromises.push(
      queryClient
        .prefetchQuery({
          queryKey: ['sessions'],
          queryFn: async () => {
            const { getAllSessions } = await import('@/lib/firebase');
            return await getAllSessions();
          },
          staleTime: 5 * 60 * 1000,
        })
        .catch((error) => {
          console.warn('Failed to warm sessions cache:', error);
        }),
    );
  }

  // Warm statistics cache
  if (statistics) {
    warmingPromises.push(
      queryClient
        .prefetchQuery({
          queryKey: ['statistics'],
          queryFn: async () => {
            const { getStatistics } = await import('@/lib/firebase');
            return await getStatistics();
          },
          staleTime: 5 * 60 * 1000,
        })
        .catch((error) => {
          console.warn('Failed to warm statistics cache:', error);
        }),
    );
  }

  // Warm weekly goal cache
  if (weeklyGoal) {
    warmingPromises.push(
      queryClient
        .prefetchQuery({
          queryKey: ['weekly-goal'],
          queryFn: async () => {
            const { getCurrentWeeklyGoal } = await import('@/lib/firebase');
            return await getCurrentWeeklyGoal();
          },
          staleTime: 5 * 60 * 1000,
        })
        .catch((error) => {
          console.warn('Failed to warm weekly goal cache:', error);
        }),
    );
  }

  // Wait for all warming to complete
  await Promise.allSettled(warmingPromises);
  logger.debug('Cache warming completed');
}

// Warm cache on app startup
export function initializeCacheWarming() {
  // Warm cache after a short delay to let the app initialize
  setTimeout(() => {
    warmCache().catch((error) => {
      console.warn('Cache warming failed:', error);
    });
  }, 1000);
}

// Warm cache when coming back online
export function setupOnlineCacheWarming() {
  const handleOnline = () => {
    logger.debug('Back online - warming cache');
    warmCache().catch((error) => {
      console.warn('Online cache warming failed:', error);
    });
  };

  window.addEventListener('online', handleOnline);

  return () => {
    window.removeEventListener('online', handleOnline);
  };
}
