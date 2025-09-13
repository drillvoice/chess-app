// Enhanced main.tsx with SW message handling
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { clearAppCache } from './lib/utils';

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
      console.log('Storage is already persistent');
      return true;
    }

    const granted = await navigator.storage.persist();

    if (granted) {
      console.log('Persistent storage granted');
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
    console.log('SW Message received:', event.data);

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

// Cache warming function
async function warmCache() {
  if (!navigator.onLine) {
    console.log('Offline - skipping cache warming');
    return;
  }

  try {
    console.log('Warming cache with essential data...');

    // Warm cache with critical endpoints
    const warmingRequests = [
      fetch('/api/statistics'),
      fetch('/api/training-sessions/today'),
      fetch('/api/weekly-goal'),
      // Add other critical endpoints your app needs immediately
    ];

    // Don't await these - let them happen in background
    Promise.allSettled(warmingRequests).then((results) => {
      const successful = results.filter((r) => r.status === 'fulfilled').length;
      console.log(`Cache warming completed: ${successful}/${results.length} requests successful`);
    });
  } catch (error) {
    console.warn('Cache warming failed:', error);
  }
}

// Check app version and refresh if changed
async function checkAppVersion() {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' });
    const data = await response.json();
    const currentVersion = data.version;
    const savedVersion = localStorage.getItem('app-version');

    if (savedVersion && savedVersion !== currentVersion) {
      await clearAppCache();
      localStorage.setItem('app-version', currentVersion);
      location.reload();
    } else {
      localStorage.setItem('app-version', currentVersion);
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

    console.log('SW registered: ', registration);

    // Set up messaging before the SW is active
    setupServiceWorkerMessaging();

    // Wait for SW to be ready, then warm cache
    await navigator.serviceWorker.ready;

    // Warm cache after SW is ready
    setTimeout(warmCache, 1000); // Small delay to let app initialize

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
      console.log('Storage quota:', {
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
  // Initialize persistent storage first
  const isPersistent = await initializePersistentStorage();

  // Initialize service worker with messaging and cache warming
  await initializeServiceWorker();
  await checkAppVersion();

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
