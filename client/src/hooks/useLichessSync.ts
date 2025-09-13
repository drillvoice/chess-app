import { useEffect } from 'react';

export function useLichessSync() {
  useEffect(() => {
    let stopSync: (() => void) | undefined;
    let unsub: (() => void) | undefined;

    const init = async () => {
      try {
        const { getFirebaseAuth } = await import('@/lib/firebaseClient');
        const auth = await getFirebaseAuth();
        const { onAuthStateChanged } = await import('firebase/auth');
        const { getUserSettings } = await import('@/lib/firebase');
        const { startLichessSync } = await import('@/lib/lichess-sync');

        unsub = onAuthStateChanged(auth, async (user) => {
          if (stopSync) {
            stopSync();
            stopSync = undefined;
          }
          if (user) {
            try {
              const settings = await getUserSettings();
              if (settings.lichessUsername) {
                stopSync = startLichessSync(settings.lichessUsername);
              }
            } catch (err) {
              console.error('Failed to start Lichess sync:', err);
            }
          }
        });
      } catch (err) {
        console.error('Lichess sync init failed:', err);
      }
    };

    init();

    return () => {
      if (unsub) unsub();
      if (stopSync) stopSync();
    };
  }, []);
}
