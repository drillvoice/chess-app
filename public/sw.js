const CACHE_NAME = 'chess-training-v6';
const RUNTIME_CACHE = 'chess-training-runtime';
const API_CACHE = 'chess-training-api';
const STATIC_CACHE = 'chess-training-static';

// Critical resources to precache
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-32x32.png',
  '/icon-16x16.png'
];

// Cache configuration
const CACHE_CONFIG = {
  // API cache duration - more aggressive caching for better UX
  API_MAX_AGE: {
    statistics: 24 * 60 * 60 * 1000, // 24 hours
    sessions: 7 * 24 * 60 * 60 * 1000, // 7 days - much longer for sessions
    weeklyGoal: 60 * 60 * 1000       // 1 hour
  },
  // Maximum cache sizes
  MAX_CACHE_SIZE: {
    [RUNTIME_CACHE]: 50,
    [API_CACHE]: 200, // Increased for more session data
    [STATIC_CACHE]: 30
  }
};

// Install event - precache critical resources
self.addEventListener('install', (event) => {
  console.log('SW: Installing...');
  event.waitUntil(
    Promise.all([
      // Precache critical resources
      caches.open(CACHE_NAME).then(cache => 
        cache.addAll(urlsToCache).catch(err => {
          console.warn('SW: Failed to precache some resources:', err);
          // Continue installation even if some resources fail
          return Promise.resolve();
        })
      ),
      // Initialize other caches
      caches.open(API_CACHE),
      caches.open(STATIC_CACHE),
      caches.open(RUNTIME_CACHE)
    ])
  );
  self.skipWaiting();
});

// Activate event - cleanup and claim clients
self.addEventListener('activate', (event) => {
  console.log('SW: Activating...');
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        const validCaches = [CACHE_NAME, RUNTIME_CACHE, API_CACHE, STATIC_CACHE];
        return Promise.all(
          cacheNames.map(cacheName => {
            if (!validCaches.includes(cacheName)) {
              console.log('SW: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Cleanup oversized caches
      ...Object.entries(CACHE_CONFIG.MAX_CACHE_SIZE).map(([cacheName, maxSize]) =>
        limitCacheSize(cacheName, maxSize)
      )
    ])
  );
  self.clients.claim();
});

// Background sync for offline session uploads
self.addEventListener('sync', (event) => {
  console.log('SW: Background sync triggered:', event.tag);
  
  if (event.tag === 'upload-sessions') {
    event.waitUntil(syncOfflineSessions());
  }
});

// Fetch event with optimized strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests (except for background sync)
  if (request.method !== 'GET') {
    // Handle POST requests for background sync
    if (request.method === 'POST' && url.pathname.startsWith('/api/training-sessions/')) {
      event.respondWith(handleOfflinePost(request));
    }
    return;
  }
  
  // Skip external services
  if (isExternalService(url)) return;
  
  // Route to appropriate caching strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request, url));
  } else if (isStaticAsset(request)) {
    event.respondWith(handleStaticAsset(request));
  } else {
    event.respondWith(handleNavigationRequest(request));
  }
});

// Cache management functions
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxItems) {
    const keysToDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
    console.log(`SW: Trimmed ${cacheName} cache from ${keys.length} to ${maxItems} items`);
  }
}

function isExternalService(url) {
  return url.hostname.includes('firebaseapp.com') || 
         url.hostname.includes('googleapis.com') ||
         url.hostname.includes('firebase.com') ||
         url.hostname.includes('lichess.org');
}

function isStaticAsset(request) {
  return ['script', 'style', 'image', 'font', 'document'].includes(request.destination) ||
         request.url.includes('.js') || 
         request.url.includes('.css') ||
         request.url.includes('.png') ||
         request.url.includes('.ico');
}

function isCacheStale(response, maxAge) {
  if (!response) return true;
  
  const dateHeader = response.headers.get('date');
  if (!dateHeader) return false;
  
  const responseTime = new Date(dateHeader).getTime();
  return Date.now() - responseTime > maxAge;
}

// API request handler with intelligent caching
async function handleApiRequest(request, url) {
  const cacheName = API_CACHE;
  
  try {
    // Determine cache strategy based on endpoint
    const isReadOnly = ['statistics', 'training-sessions', 'weekly-goal', 'export'].some(
      endpoint => url.pathname.includes(endpoint)
    );
    
    if (isReadOnly) {
      // Stale-while-revalidate for read-only endpoints
      const cache = await caches.open(cacheName);
      const cachedResponse = await cache.match(request);
      
      // Determine max age based on endpoint type
      let maxAge = CACHE_CONFIG.API_MAX_AGE.sessions; // default
      if (url.pathname.includes('statistics')) {
        maxAge = CACHE_CONFIG.API_MAX_AGE.statistics;
      } else if (url.pathname.includes('weekly-goal')) {
        maxAge = CACHE_CONFIG.API_MAX_AGE.weeklyGoal;
      }
      
      // For training sessions, always return cached data first for instant load
      if (url.pathname.includes('training-sessions') && cachedResponse) {
        // Always fetch fresh data in background for sessions
        fetch(request).then(response => {
          if (response.ok) {
            cache.put(request, response.clone());
            // Notify app that fresh data is available
            self.clients.matchAll().then(clients => {
              clients.forEach(client => {
                client.postMessage({
                  type: 'FRESH_SESSIONS_AVAILABLE',
                  timestamp: Date.now()
                });
              });
            });
          }
        }).catch(() => {}); // Silent fail for background updates
        
        return cachedResponse;
      }
      
      // For other endpoints, use stale-while-revalidate
      if (cachedResponse && !isCacheStale(cachedResponse, maxAge)) {
        // Optionally fetch fresh data in background
        fetch(request).then(response => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
        }).catch(() => {}); // Silent fail for background updates
        
        return cachedResponse;
      }
      
      // Fetch fresh data
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
        return networkResponse;
      }
      
      // Fallback to stale cache if network fails
      return cachedResponse || new Response('{"error": "Offline"}', {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      // Network-first for write operations
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    }
  } catch (error) {
    console.log('SW: API request failed, checking cache:', error);
    const cachedResponse = await caches.match(request);
    return cachedResponse || new Response('{"error": "Offline"}', {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Static asset handler with cache-first strategy
async function handleStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);
  
  // Special handling for dynamic imports (chunked JS files)
  const isDynamicImport = request.url.includes('.chunk.') || 
                         request.url.includes('assets/') && request.url.includes('.js');
  
  if (cachedResponse && !isDynamicImport) {
    // Optionally update cache in background for non-versioned assets
    if (!request.url.includes('?v=')) {
      fetch(request).then(response => {
        if (response.ok) {
          cache.put(request, response.clone());
        }
      }).catch(() => {});
    }
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // For dynamic imports, try to return cached version even if stale
    if (isDynamicImport && cachedResponse) {
      console.log('SW: Dynamic import failed, using cached version:', request.url);
      return cachedResponse;
    }
    
    // Return offline fallback for images
    if (request.destination === 'image') {
      return new Response('', { status: 204 });
    }
    
    // For JS files, return a more helpful error
    if (request.destination === 'script') {
      return new Response(
        'console.error("Failed to load module:", "' + request.url + '");',
        { 
          status: 200,
          headers: { 'Content-Type': 'application/javascript' }
        }
      );
    }
    
    throw error;
  }
}

// Navigation request handler
async function handleNavigationRequest(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Fallback to cached version or app shell
    const cachedResponse = await caches.match(request) || 
                          await caches.match('/');
    return cachedResponse || new Response('Offline', { status: 503 });
  }
}

// Handle offline POST requests with background sync
async function handleOfflinePost(request) {
  try {
    return await fetch(request);
  } catch (error) {
    // Store request for background sync
    const requestData = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: await request.text(),
      timestamp: Date.now()
    };
    
    // Store in IndexedDB for background sync
    await storeOfflineRequest(requestData);
    
    // Register background sync
    await self.registration.sync.register('upload-sessions');
    
    return new Response(JSON.stringify({ 
      success: true, 
      offline: true,
      message: 'Session saved offline, will sync when online' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Background sync implementation
async function syncOfflineSessions() {
  try {
    const offlineRequests = await getOfflineRequests();
    
    for (const requestData of offlineRequests) {
      try {
        const response = await fetch(requestData.url, {
          method: requestData.method,
          headers: requestData.headers,
          body: requestData.body
        });
        
        if (response.ok) {
          await removeOfflineRequest(requestData.timestamp);
          console.log('SW: Successfully synced offline session');
        }
      } catch (error) {
        console.log('SW: Failed to sync session, will retry later:', error);
        break; // Stop trying if still offline
      }
    }
  } catch (error) {
    console.error('SW: Background sync failed:', error);
  }
}

// IndexedDB operations for background sync
async function storeOfflineRequest(requestData) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('chess-training-sync', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['requests'], 'readwrite');
      const store = transaction.objectStore('requests');
      store.add(requestData);
      transaction.oncomplete = () => resolve();
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('requests')) {
        const store = db.createObjectStore('requests', { keyPath: 'timestamp' });
        store.createIndex('url', 'url', { unique: false });
      }
    };
  });
}

async function getOfflineRequests() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('chess-training-sync', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['requests'], 'readonly');
      const store = transaction.objectStore('requests');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
  });
}

async function removeOfflineRequest(timestamp) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('chess-training-sync', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['requests'], 'readwrite');
      const store = transaction.objectStore('requests');
      store.delete(timestamp);
      transaction.oncomplete = () => resolve();
    };
  });
}