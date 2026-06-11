import { logger } from '@/lib/logger';
import { useState, useEffect } from 'react';

export function useMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [connectionType, setConnectionType] = useState<string | null>(null);

  useEffect(() => {
    const updateNetworkStatus = () => {
      setIsOnline(navigator.onLine);

      // Try to get connection type if available
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        if (connection) {
          setConnectionType(connection.effectiveType || connection.type);
        }
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      logger.debug('Network: Back online');
    };

    const handleOffline = () => {
      setIsOnline(false);
      logger.debug('Network: Gone offline');
    };

    updateNetworkStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for connection changes if supported
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection) {
        connection.addEventListener('change', updateNetworkStatus);
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        if (connection) {
          connection.removeEventListener('change', updateNetworkStatus);
        }
      }
    };
  }, []);

  return { isOnline, connectionType };
}
