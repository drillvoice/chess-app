import { useEffect } from 'react';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

async function loadSettingsWithRetry(retries = 0): Promise<{ lichessUsername?: string }> {
  try {
    const { getUserSettings } = await import('@/lib/firebase');
    const settings = await getUserSettings();
    console.log('📱 Lichess sync: Settings loaded successfully', settings);
    return settings;
  } catch (error) {
    console.error(`Failed to load settings (attempt ${retries + 1}/${MAX_RETRIES}):`, error);

    if (retries < MAX_RETRIES - 1) {
      console.log(`Retrying in ${RETRY_DELAY}ms...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return loadSettingsWithRetry(retries + 1);
    }

    // After max retries, return empty settings
    console.error('Max retries reached. Lichess sync will not start.');
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
        console.log('🔄 Initializing Lichess sync...');

        const { getFirebaseAuth } = await import('@/lib/firebaseClient');
        const auth = await getFirebaseAuth();
        const { onAuthStateChanged } = await import('firebase/auth');
        const { startLichessSync } = await import('@/lib/lichess-sync');

        unsub = onAuthStateChanged(auth, async (user) => {
          if (!mounted) return;

          // Stop any existing sync
          if (stopSync) {
            console.log('🛑 Stopping existing Lichess sync');
            stopSync();
            stopSync = undefined;
          }

          if (user) {
            console.log('👤 User authenticated, loading settings for Lichess sync...');
            try {
              const settings = await loadSettingsWithRetry();

              if (!mounted) return;

              if (settings.lichessUsername) {
                console.log('✅ Starting Lichess sync for username:', settings.lichessUsername);
                stopSync = startLichessSync(settings.lichessUsername);
              } else {
                console.log('ℹ️ No Lichess username found in settings. Sync not started.');
              }
            } catch (err) {
              if (!mounted) return;
              console.error('❌ Failed to start Lichess sync:', err);
            }
          } else {
            console.log('🚫 User not authenticated, Lichess sync not started');
          }
        });
      } catch (err) {
        if (!mounted) return;
        console.error('❌ Lichess sync init failed:', err);
      }
    };

    init();

    return () => {
      mounted = false;
      if (unsub) {
        console.log('🧹 Cleaning up Lichess sync');
        unsub();
      }
      if (stopSync) stopSync();
    };
  }, []);
}
