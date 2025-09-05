// Debug utilities for troubleshooting dynamic import issues

import { offlineStorage } from './offline-storage';
import { dbPromise } from './storage/db';

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
    serviceWorkerStatus: 'unknown',
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

  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;

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
    error: 'Dynamic import failure',
  };

  return JSON.stringify(info, null, 2);
}

export interface DatabaseDiagnostics {
  databaseVersion: number;
  objectStores: string[];
  sessionsCount: number;
  statisticsExists: boolean;
  settingsExists: boolean;
  dailyGoalsExists: boolean;
  hasErrors: boolean;
  errors: string[];
}

export async function diagnoseDatabase(): Promise<DatabaseDiagnostics> {
  const diagnostics: DatabaseDiagnostics = {
    databaseVersion: 0,
    objectStores: [],
    sessionsCount: 0,
    statisticsExists: false,
    settingsExists: false,
    dailyGoalsExists: false,
    hasErrors: false,
    errors: [],
  };

  try {
    // Check database version and stores
    await offlineStorage.init();
    const db = await dbPromise;
    diagnostics.databaseVersion = db.version;
    diagnostics.objectStores = Array.from(db.objectStoreNames);

    // Check sessions
    try {
      const sessions = await offlineStorage.getSessions();
      diagnostics.sessionsCount = sessions.length;
    } catch (error) {
      diagnostics.hasErrors = true;
      diagnostics.errors.push(
        `Sessions error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Check statistics
    try {
      const stats = await offlineStorage.getStatistics();
      diagnostics.statisticsExists = stats !== null;
    } catch (error) {
      diagnostics.hasErrors = true;
      diagnostics.errors.push(
        `Statistics error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Check settings
    try {
      const settings = await offlineStorage.getSettings();
      diagnostics.settingsExists = settings !== null;
    } catch (error) {
      diagnostics.hasErrors = true;
      diagnostics.errors.push(
        `Settings error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Check daily goals
    try {
      const dailyGoals = await offlineStorage.getDailyGoalSettings();
      diagnostics.dailyGoalsExists = dailyGoals !== null;
    } catch (error) {
      diagnostics.hasErrors = true;
      diagnostics.errors.push(
        `Daily goals error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  } catch (error) {
    diagnostics.hasErrors = true;
    diagnostics.errors.push(
      `Database initialization error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  return diagnostics;
}

export function logDatabaseDiagnostics(diagnostics: DatabaseDiagnostics): void {
  console.group('🔍 Database Diagnostics');
  console.log('Database Version:', diagnostics.databaseVersion);
  console.log('Object Stores:', diagnostics.objectStores);
  console.log('Sessions Count:', diagnostics.sessionsCount);
  console.log('Statistics Exists:', diagnostics.statisticsExists);
  console.log('Settings Exists:', diagnostics.settingsExists);
  console.log('Daily Goals Exists:', diagnostics.dailyGoalsExists);

  if (diagnostics.hasErrors) {
    console.error('❌ Errors Found:');
    diagnostics.errors.forEach((error) => console.error('  -', error));
  } else {
    console.log('✅ No errors detected');
  }
  console.groupEnd();
}

export async function forceDatabaseUpgrade(): Promise<void> {
  console.log('🔄 Forcing database upgrade...');

  try {
    // Close existing connection
    const storage = offlineStorage as any;
    if (storage.db) {
      storage.db.close();
      storage.db = null;
    }

    // Increment version to force upgrade
    storage.version += 1;
    console.log('New version:', storage.version);

    // Reinitialize
    await storage.init();

    console.log('✅ Database upgrade completed');
  } catch (error) {
    console.error('❌ Database upgrade failed:', error);
    throw error;
  }
}

export async function clearDatabaseAndReinitialize(): Promise<void> {
  console.log('🗑️ Clearing database and reinitializing...');

  try {
    // Clear all data
    await offlineStorage.clearAll();

    // Force reinitialization
    await forceDatabaseUpgrade();

    console.log('✅ Database cleared and reinitialized');
  } catch (error) {
    console.error('❌ Database clear failed:', error);
    throw error;
  }
}

// Test settings storage functionality
export async function testSettingsStorage(): Promise<void> {
  console.log('🧪 Testing settings storage...');

  try {
    // Test writing settings
    const testSettings = {
      lichessUsername: 'testuser123',
      testTimestamp: Date.now(),
    };

    console.log('📝 Writing test settings:', testSettings);
    await offlineStorage.setSettings(testSettings);
    console.log('✅ Test settings written successfully');

    // Test reading settings
    console.log('📖 Reading test settings...');
    const readSettings = await offlineStorage.getSettings();
    console.log('✅ Test settings read:', readSettings);

    // Verify the data
    if (readSettings?.lichessUsername === testSettings.lichessUsername) {
      console.log('✅ Settings storage test PASSED');
    } else {
      console.error('❌ Settings storage test FAILED - data mismatch');
    }
  } catch (error) {
    console.error('❌ Settings storage test FAILED:', error);
  }
}

// Test Firebase settings functions
export async function testFirebaseSettings(): Promise<void> {
  console.log('🧪 Testing Firebase settings...');

  try {
    // Test getting settings
    console.log('📖 Getting user settings...');
    const settings = await import('@/lib/firebase/settings');
    const userSettings = await settings.getUserSettings();
    console.log('✅ User settings loaded:', userSettings);

    // Test updating settings
    const testUsername = `testuser_${Date.now()}`;
    console.log('📝 Updating settings with username:', testUsername);
    await settings.updateUserSettings({ lichessUsername: testUsername });
    console.log('✅ Settings updated successfully');

    // Verify the update
    const updatedSettings = await settings.getUserSettings();
    console.log('✅ Updated settings:', updatedSettings);

    if (updatedSettings.lichessUsername === testUsername) {
      console.log('✅ Firebase settings test PASSED');
    } else {
      console.error('❌ Firebase settings test FAILED - username not updated');
    }
  } catch (error) {
    console.error('❌ Firebase settings test FAILED:', error);
  }
}
