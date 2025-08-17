import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Enhanced persistent storage management
async function initializePersistentStorage(): Promise<boolean> {
  if (!('storage' in navigator) || !navigator.storage.persist) {
    console.warn('Persistent storage not supported in this browser');
    return false;
  }

  try {
    // Check if storage is already persistent
    const isPersistent = await navigator.storage.persisted();
    
    if (isPersistent) {
      console.log('Storage is already persistent');
      return true;
    }

    // Request persistent storage
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

// Enhanced service worker registration with storage quota info
async function initializeServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workers not supported in this browser');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { 
      scope: '/' 
    });
    console.log('SW registered: ', registration);

    // Optional: Log storage quota information for debugging
    if ('storage' in navigator && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      console.log('Storage quota:', {
        quota: estimate.quota ? `${Math.round(estimate.quota / 1024 / 1024)}MB` : 'unknown',
        usage: estimate.usage ? `${Math.round(estimate.usage / 1024 / 1024)}MB` : 'unknown',
        usagePercentage: estimate.quota && estimate.usage 
          ? `${Math.round((estimate.usage / estimate.quota) * 100)}%` 
          : 'unknown'
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
  
  // Initialize service worker
  await initializeServiceWorker();
  
  // You could optionally store the persistence status for use in your app
  // For example, show a subtle notification if persistence was denied
  if (!isPersistent && 'storage' in navigator) {
    // Could dispatch a custom event or set a flag that your React app can read
    window.dispatchEvent(new CustomEvent('storage-persistence-status', { 
      detail: { persistent: false } 
    }));
  }
});

createRoot(document.getElementById('root')!).render(<App />);