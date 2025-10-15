import { useEffect } from 'react';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

const isDebugLoggingEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_LICHESS_SYNC_DEBUG === 'true';

const debugLog = (...args: Parameters<typeof console.log>) => {
  if (isDebugLoggingEnabled) {
    console.log(...args);
  }
};

async function loadSettingsWithRetry(retries = 0): Promise<{ lichessUsername?: string }> {
  debugLog(`🔄 [Settings Loader] Attempt ${retries + 1}/${MAX_RETRIES}`);
  try {
    const { getUserSettings } = await import('@/lib/firebase');
    debugLog(`🔄 [Settings Loader] getUserSettings imported successfully`);
    const settings = await getUserSettings();
    debugLog(`✅ [Settings Loader] Settings loaded:`, settings);
    return settings;
  } catch (error) {
    console.error(`❌ [Settings Loader] Failed (attempt ${retries + 1}/${MAX_RETRIES}):`, error);
    console.error(`❌ [Settings Loader] Error details:`, {
      name: error instanceof Error ? error.name : 'unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (retries < MAX_RETRIES - 1) {
      debugLog(`⏳ [Settings Loader] Retrying in ${RETRY_DELAY}ms...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return loadSettingsWithRetry(retries + 1);
    }

    // After max retries, return empty settings
    console.error(`❌ [Settings Loader] Max retries reached. Lichess sync will not start.`);
    return {};
  }
}

export function useLichessSync() {
  useEffect(() => {
    let stopSync: (() => void) | undefined;
    let unsub: (() => void) | undefined;
    let mounted = true;

    const init = async () => {
      try {
        debugLog('🔄 [Lichess Sync] Initializing...');

        const { getFirebaseAuth } = await import('@/lib/firebaseClient');
        const auth = await getFirebaseAuth();
        debugLog('🔄 [Lichess Sync] Firebase auth loaded, current user:', auth.currentUser?.uid || 'none');

        const { onAuthStateChanged } = await import('firebase/auth');
        const { startLichessSync } = await import('@/lib/lichess-sync');

        unsub = onAuthStateChanged(auth, async (user) => {
          debugLog('🔄 [Lichess Sync] Auth state changed, user:', user?.uid || 'none', 'mounted:', mounted);
          if (!mounted) return;

          // Stop any existing sync
          if (stopSync) {
            debugLog('🛑 [Lichess Sync] Stopping existing sync');
            stopSync();
            stopSync = undefined;
          }

          if (user) {
            debugLog('👤 [Lichess Sync] User authenticated, loading settings...');
            try {
              const settings = await loadSettingsWithRetry();
              debugLog('✅ [Lichess Sync] Settings loaded:', settings);

              if (!mounted) {
                debugLog('⚠️ [Lichess Sync] Component unmounted, aborting');
                return;
              }

              if (settings.lichessUsername) {
                debugLog('✅ [Lichess Sync] Starting sync for username:', settings.lichessUsername);
                stopSync = startLichessSync(settings.lichessUsername);
                debugLog('✅ [Lichess Sync] Sync started successfully, stopSync function:', !!stopSync);
              } else {
                debugLog('ℹ️ [Lichess Sync] No username configured in settings');
              }
            } catch (err) {
              if (!mounted) return;
              console.error('❌ [Lichess Sync] Failed to start sync:', err);
              console.error('❌ [Lichess Sync] Error details:', {
                name: err instanceof Error ? err.name : 'unknown',
                message: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined,
              });
            }
          } else {
            debugLog('🚫 [Lichess Sync] No user authenticated, sync not started');
          }
        });
      } catch (err) {
        if (!mounted) return;
        console.error('❌ [Lichess Sync] Init failed:', err);
        console.error('❌ [Lichess Sync] Init error details:', {
          name: err instanceof Error ? err.name : 'unknown',
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
    };

    init();

    return () => {
      debugLog('🧹 [Lichess Sync] Cleanup called');
      mounted = false;
      if (unsub) {
        debugLog('🧹 [Lichess Sync] Unsubscribing from auth');
        unsub();
      }
      if (stopSync) {
        debugLog('🧹 [Lichess Sync] Stopping sync');
        stopSync();
      }
    };
  }, []);
}
