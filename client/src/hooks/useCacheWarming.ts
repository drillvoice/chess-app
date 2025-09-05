import { useEffect } from 'react';
import { initializeCacheWarming, setupOnlineCacheWarming } from '@/lib/cache-warming';
import { preloadStudyPreferences } from '@/hooks/use-study-preferences';

export function useCacheWarming() {
  useEffect(() => {
    initializeCacheWarming();
    const cleanupOnlineWarming = setupOnlineCacheWarming();
    preloadStudyPreferences();

    return () => {
      if (cleanupOnlineWarming) cleanupOnlineWarming();
    };
  }, []);
}
