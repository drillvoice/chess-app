import { useEffect } from 'react';

export function useAuthInit() {
  useEffect(() => {
    const init = async () => {
      try {
        const { ensureAuthentication, initializeCloudSyncForCurrentUser } = await import(
          '@/lib/firebase'
        );
        await ensureAuthentication();
        await initializeCloudSyncForCurrentUser();
      } catch (err) {
        console.error('Auth init failed:', err);
      }
    };

    init();
  }, []);
}
