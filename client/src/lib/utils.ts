import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Utility for handling dynamic import failures with retry logic
export async function dynamicImportWithRetry<T>(
  importFn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await importFn();
    } catch (error) {
      lastError = error as Error;
      
      // If it's not a network-related error, don't retry
      if (!isNetworkError(error as Error)) {
        throw error;
      }
      
      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        console.error(`Dynamic import failed after ${maxRetries + 1} attempts:`, error);
        throw error;
      }
      
      // Wait before retrying with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`Dynamic import attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Check if an error is network-related
export function isNetworkError(error: Error): boolean {
  const networkErrorPatterns = [
    'Failed to fetch',
    'NetworkError',
    'dynamically imported module',
    'ERR_NETWORK',
    'ERR_INTERNET_DISCONNECTED',
    'ERR_NETWORK_CHANGED'
  ];
  
  return networkErrorPatterns.some(pattern => 
    error.message.includes(pattern)
  );
}

// Utility to clear app cache
export async function clearAppCache(): Promise<void> {
  try {
    // Clear service worker cache
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.includes('chess-training')) {
            return caches.delete(cacheName);
          }
        })
      );
    }
    
    // Clear IndexedDB
    if ('indexedDB' in window) {
      const databases = await indexedDB.databases();
      await Promise.all(
        databases.map(db => {
          if (db.name && db.name.includes('chess')) {
            return indexedDB.deleteDatabase(db.name);
          }
        })
      );
    }
    
    // Unregister service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(registration => registration.unregister())
      );
    }
    
    console.log('App cache cleared successfully');
  } catch (error) {
    console.error('Failed to clear app cache:', error);
  }
}

// Utility to check if the app is running in a PWA context
export function isPWA(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true;
}

// Utility to get app version for debugging
export function getAppVersion(): string {
  try {
    // Try to get version from the version.json file
    return (window as any).__APP_VERSION__ || 'unknown';
  } catch {
    return 'unknown';
  }
}
