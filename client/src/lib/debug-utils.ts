// Debug utilities for troubleshooting dynamic import issues

interface DebugInfo {
  timestamp: string;
  url: string;
  userAgent: string;
  isOnline: boolean;
  isPWA: boolean;
  appVersion: string;
  cacheStatus: string;
  serviceWorkerStatus: string;
}

export async function collectDebugInfo(): Promise<DebugInfo> {
  const info: DebugInfo = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    isOnline: navigator.onLine,
    isPWA: window.matchMedia('(display-mode: standalone)').matches,
    appVersion: (window as any).__APP_VERSION__ || 'unknown',
    cacheStatus: 'unknown',
    serviceWorkerStatus: 'unknown'
  };

  // Check cache status
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      info.cacheStatus = `Available caches: ${cacheNames.join(', ')}`;
    } else {
      info.cacheStatus = 'Caches API not available';
    }
  } catch (error) {
    info.cacheStatus = `Cache error: ${error}`;
  }

  // Check service worker status
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      info.serviceWorkerStatus = `Active SWs: ${registrations.length}`;
    } else {
      info.serviceWorkerStatus = 'Service Worker not supported';
    }
  } catch (error) {
    info.serviceWorkerStatus = `SW error: ${error}`;
  }

  return info;
}

export function logDebugInfo(info: DebugInfo) {
  console.group('🔍 Debug Information');
  console.log('Timestamp:', info.timestamp);
  console.log('URL:', info.url);
  console.log('User Agent:', info.userAgent);
  console.log('Online:', info.isOnline);
  console.log('PWA Mode:', info.isPWA);
  console.log('App Version:', info.appVersion);
  console.log('Cache Status:', info.cacheStatus);
  console.log('Service Worker Status:', info.serviceWorkerStatus);
  console.groupEnd();
}

// Monitor dynamic imports for debugging
export function monitorDynamicImports() {
  const originalFetch = window.fetch;
  
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0].url;
    
    // Monitor JS file requests
    if (url.includes('.js') && (url.includes('assets/') || url.includes('.chunk.'))) {
      console.log('🔍 Dynamic import request:', url);
      
      try {
        const response = await originalFetch.apply(this, args);
        console.log('✅ Dynamic import success:', url, response.status);
        return response;
      } catch (error) {
        console.error('❌ Dynamic import failed:', url, error);
        throw error;
      }
    }
    
    return originalFetch.apply(this, args);
  };
}

// Export debug info for error reporting
export function exportDebugInfo(): string {
  const info = {
    url: window.location.href,
    userAgent: navigator.userAgent,
    isOnline: navigator.onLine,
    timestamp: new Date().toISOString(),
    error: 'Dynamic import failure'
  };
  
  return JSON.stringify(info, null, 2);
}
