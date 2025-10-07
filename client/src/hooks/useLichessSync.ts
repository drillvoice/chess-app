import { useEffect } from 'react';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

async function loadSettingsWithRetry(retries = 0): Promise<{ lichessUsername?: string }> {
  console.log(`🔄 [Settings Loader] Attempt ${retries + 1}/${MAX_RETRIES}`);
  try {
    const { getUserSettings } = await import('@/lib/firebase');
    console.log(`🔄 [Settings Loader] getUserSettings imported successfully`);
    const settings = await getUserSettings();
    console.log(`✅ [Settings Loader] Settings loaded:`, settings);
    return settings;
  } catch (error) {
    console.error(`❌ [Settings Loader] Failed (attempt ${retries + 1}/${MAX_RETRIES}):`, error);
    console.error(`❌ [Settings Loader] Error details:`, {
      name: error instanceof Error ? error.name : 'unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (retries < MAX_RETRIES - 1) {
      console.log(`⏳ [Settings Loader] Retrying in ${RETRY_DELAY}ms...`);
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
        console.log('🔄 [Lichess Sync] Initializing...');

        const { getFirebaseAuth } = await import('@/lib/firebaseClient');
        const auth = await getFirebaseAuth();
        console.log('🔄 [Lichess Sync] Firebase auth loaded, current user:', auth.currentUser?.uid || 'none');

        const { onAuthStateChanged } = await import('firebase/auth');
        const { startLichessSync } = await import('@/lib/lichess-sync');

        unsub = onAuthStateChanged(auth, async (user) => {
          console.log('🔄 [Lichess Sync] Auth state changed, user:', user?.uid || 'none', 'mounted:', mounted);
          if (!mounted) return;

          // Stop any existing sync
          if (stopSync) {
            console.log('🛑 [Lichess Sync] Stopping existing sync');
            stopSync();
            stopSync = undefined;
          }

          if (user) {
            console.log('👤 [Lichess Sync] User authenticated, loading settings...');
            try {
              const settings = await loadSettingsWithRetry();
              console.log('✅ [Lichess Sync] Settings loaded:', settings);

              if (!mounted) {
                console.log('⚠️ [Lichess Sync] Component unmounted, aborting');
                return;
              }

              if (settings.lichessUsername) {
                console.log('✅ [Lichess Sync] Starting sync for username:', settings.lichessUsername);
                stopSync = startLichessSync(settings.lichessUsername);
                console.log('✅ [Lichess Sync] Sync started successfully, stopSync function:', !!stopSync);
              } else {
                console.log('ℹ️ [Lichess Sync] No username configured in settings');
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
            console.log('🚫 [Lichess Sync] No user authenticated, sync not started');
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
      console.log('🧹 [Lichess Sync] Cleanup called');
      mounted = false;
      if (unsub) {
        console.log('🧹 [Lichess Sync] Unsubscribing from auth');
        unsub();
      }
      if (stopSync) {
        console.log('🧹 [Lichess Sync] Stopping sync');
        stopSync();
      }
    };
  }, []);
}
