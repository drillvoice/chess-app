import { logger } from '@/lib/logger';
import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      logger.debug('beforeinstallprompt event fired');
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };

    const handleAppInstalled = () => {
      logger.debug('PWA was installed');
      setDeferredPrompt(null);
      setCanInstall(false);
    };

    // Check if app is already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isInWebApk = (window.navigator as any).standalone;
    const isInstalled = isStandalone || isInWebApk;

    if (isInstalled) {
      logger.debug('App is already installed');
      setCanInstall(false);
    } else {
      logger.debug('App is not installed, listening for install prompt');
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.addEventListener('appinstalled', handleAppInstalled);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) {
      logger.debug('No deferred prompt available');
      return;
    }

    try {
      logger.debug('Showing install prompt');
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;

      logger.debug('User choice:', choiceResult.outcome);

      if (choiceResult.outcome === 'accepted') {
        logger.debug('User accepted the install prompt');
      } else {
        logger.debug('User dismissed the install prompt');
      }
    } catch (error) {
      console.error('Installation failed:', error);
    }

    setDeferredPrompt(null);
    setCanInstall(false);
  };

  return {
    canInstall,
    installApp,
  };
}
