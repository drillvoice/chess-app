import { useEffect } from 'react';

export function useAuthInit() {
  useEffect(() => {
    const init = async () => {
      try {
        const { ensureAuthentication } = await import('@/lib/firebase');
        await ensureAuthentication();
      } catch (err) {
        console.error('Auth init failed:', err);
      }
    };

    init();
  }, []);
}
