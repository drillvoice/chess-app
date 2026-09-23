// Enhanced main.tsx with SW message handling
import { logger } from '@/lib/logger';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { purgeCachedAppShell } from './lib/utils';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

// Debug monitoring in development
if (process.env.NODE_ENV === 'development') {
  import('./lib/debug-utils').then(({ monitorDynamicImports }) => {
    monitorDynamicImports();
  });
}

// Enhanced persistent storage management
async function initializePersistentStorage(): Promise<boolean> {
  if (!('storage' in navigator) || !navigator.storage.persist) {
    console.warn('Persistent storage not supported in this browser');
    return false;
  }

  try {
    const isPersistent = await navigator.storage.persisted();

    if (isPersistent) {
      logger.debug('Storage is already persistent');
      return true;
    }

    const granted = await navigator.storage.persist();

    if (granted) {
      logger.debug('Persistent storage granted');
    } else {
      console.warn('Persistent storage denied - data may be evicted under storage pressure');
    }

    return granted;
  } catch (error) {
    console.error('Failed to request persistent storage:', error);
    return false;
  }
}

// Service worker message handler
function setupServiceWorkerMessaging() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('message', (event) => {
    logger.debug('SW Message received:', event.data);

    switch (event.data.type) {
      case 'BACKGROUND_SYNC_SUCCESS':
        // Dispatch custom event that your React components can listen to
        window.dispatchEvent(
          new CustomEvent('offline-sessions-synced', {
            detail: {
              count: event.data.count || 1,
              message: 'Offline sessions synchronized!',
            },
          }),
        );
        break;

      case 'BACKGROUND_SYNC_FAILED':
        window.dispatchEvent(
          new CustomEvent('sync-failed', {
            detail: {
              error: event.data.error,
              message: 'Failed to sync some offline sessions',
            },
          }),
        );
        break;

      case 'CACHE_UPDATED':
        // Notify app of fresh data
        window.dispatchEvent(
          new CustomEvent('fresh-data-available', {
            detail: {
              endpoint: event.data.endpoint,
              message: 'New data available',
            },
          }),
        );
        break;

      case 'OFFLINE_SESSION_STORED':
        // Immediate feedback when session is stored for later sync
        window.dispatchEvent(
          new CustomEvent('session-stored-offline', {
            detail: {
              sessionId: event.data.sessionId,
              message: 'Session saved offline - will sync when connection returns',
            },
          }),
        );
        break;
    }
  });

  // Listen for SW updates
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Service worker updated, might want to refresh
    window.dispatchEvent(
      new CustomEvent('app-updated', {
        detail: { message: 'App updated! Refresh to get the latest version.' },
      }),
    );
  });
}

async function reloadIntoLatestVersion() {
  try {
    await purgeCachedAppShell();
  } catch (error) {
    console.error('Failed to purge cached app shell before reloading:', error);
  }
  location.reload();
}

// A lazily-loaded page chunk from an older deploy can be gone once a new version ships. Reload
// once into the current build instead of stranding the user on an error screen; the guard lets a
// genuine, repeating failure surface through the error boundary instead of looping.
const CHUNK_RELOAD_KEY = 'chunk-error-reload-at';
window.addEventListener('vite:preloadError', (event) => {
  try {
    const lastReloadAt = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0;
    if (Date.now() - lastReloadAt < 30_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return; // No sessionStorage means no loop guard: let the error surface.
  }
  console.error('Failed to load a page chunk; reloading into the latest version:', event);
  void reloadIntoLatestVersion();
});

// Offer an update when the deployed version differs from the one running. Non-blocking: the
// user keeps working, and the next launch picks up the new version on its own anyway because the
// service worker refreshes its cached copy of the page in the background.
async function checkAppVersion() {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { version } = (await response.json()) as { version?: unknown };
    const runningVersion = import.meta.env.VITE_APP_VERSION;

    if (typeof version === 'string' && version !== runningVersion) {
      toast({
        title: 'Update available',
        description: `Version ${version} is ready.`,
        duration: Infinity,
        action: (
          <ToastAction altText="Reload to update" onClick={() => void reloadIntoLatestVersion()}>
            Update
          </ToastAction>
        ),
      });
    }
  } catch (error) {
    console.error('Failed to check app version:', error);
  }
}

// Enhanced service worker registration
async function initializeServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workers not supported in this browser');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    registration.update();

    logger.debug('SW registered: ', registration);

    // Set up messaging before the SW is active
    setupServiceWorkerMessaging();

    // Handle SW updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW is available
            window.dispatchEvent(new CustomEvent('sw-update-available'));
          }
        });
      }
    });

    // Optional: Log storage quota information
    if ('storage' in navigator && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      logger.debug('Storage quota:', {
        quota: estimate.quota ? `${Math.round(estimate.quota / 1024 / 1024)}MB` : 'unknown',
        usage: estimate.usage ? `${Math.round(estimate.usage / 1024 / 1024)}MB` : 'unknown',
        usagePercentage:
          estimate.quota && estimate.usage
            ? `${Math.round((estimate.usage / estimate.quota) * 100)}%`
            : 'unknown',
      });
    }
  } catch (registrationError) {
    console.error('SW registration failed: ', registrationError);
  }
}

// Initialize everything when the page loads
window.addEventListener('load', async () => {
  const [isPersistent] = await Promise.all([
    initializePersistentStorage(),
    initializeServiceWorker(),
    checkAppVersion(),
  ]);

  // Dispatch persistence status if storage isn't persistent
  if (!isPersistent && 'storage' in navigator) {
    window.dispatchEvent(
      new CustomEvent('storage-persistence-status', {
        detail: { persistent: false },
      }),
    );
  }
});

createRoot(document.getElementById('root')!).render(<App />);
