import { TrainingSession, DailyGoalSettings } from '@shared/schema';

interface UnsyncedSession {
  sessionId: number;
  operation: 'create' | 'update' | 'delete';
  timestamp: number;
  retries: number;
  updateData?: any;
}

// IndexedDB wrapper for better performance than localStorage
class OfflineStorage {
  private dbName = 'chess-logger-offline';
  // Increment version when adding new object stores
  private version = 5;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully with version:', this.db.version);
        console.log('Available object stores:', Array.from(this.db.objectStoreNames));
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        console.log(
          'IndexedDB upgrade needed from version',
          event.oldVersion,
          'to',
          event.newVersion,
        );

        // Sessions store
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionsStore.createIndex('date', 'date', { unique: false });
          sessionsStore.createIndex('type', 'type', { unique: false });
          console.log('Created sessions object store');
        }

        // Cache metadata store
        if (!db.objectStoreNames.contains('cache_meta')) {
          db.createObjectStore('cache_meta', { keyPath: 'key' });
          console.log('Created cache_meta object store');
        }

        // Statistics store
        if (!db.objectStoreNames.contains('statistics')) {
          db.createObjectStore('statistics', { keyPath: 'id' });
          console.log('Created statistics object store');
        }

        // Settings store for user preferences
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
          console.log('Created settings object store');
        }

        // Daily goals store
        if (!db.objectStoreNames.contains('daily_goals')) {
          db.createObjectStore('daily_goals', { keyPath: 'id' });
          console.log('Created daily_goals object store');
        }

        // Sync queue store for tracking unsynced changes
        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncStore = db.createObjectStore('sync_queue', { keyPath: 'sessionId' });
          syncStore.createIndex('operation', 'operation', { unique: false });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('Created sync_queue object store');
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Failed to initialize IndexedDB');
    }

    // Check if all required object stores exist
    const requiredStores = [
      'sessions',
      'cache_meta',
      'statistics',
      'settings',
      'daily_goals',
      'sync_queue',
    ];
    const existingStores = Array.from(this.db.objectStoreNames);
    const missingStores = requiredStores.filter((store) => !existingStores.includes(store));

    if (missingStores.length > 0) {
      console.warn('Missing object stores detected:', missingStores);
      console.log('Existing stores:', existingStores);
      console.log('Database version:', this.db.version);

      // Force a database upgrade by closing and reopening with higher version
      this.db.close();
      this.db = null;

      // Increment version to force upgrade
      this.version += 1;
      console.log('Forcing database upgrade to version:', this.version);

      await this.init();

      if (!this.db) {
        throw new Error('Failed to reinitialize IndexedDB after upgrade');
      }
    }

    return this.db;
  }

  async getSessions(): Promise<TrainingSession[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.getAll();

      request.onsuccess = () => {
        const sessions = request.result.map((session) => ({
          ...session,
          date: new Date(session.date),
          // Ensure needsReview is properly converted to boolean
          needsReview: Boolean(session.needsReview),
        }));
        // Sort by date descending
        sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
        resolve(sessions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setSessions(sessions: TrainingSession[]): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions', 'cache_meta'], 'readwrite');
      const sessionsStore = transaction.objectStore('sessions');
      const metaStore = transaction.objectStore('cache_meta');

      // Clear existing sessions
      sessionsStore.clear();

      // Add new sessions
      sessions.forEach((session) => {
        sessionsStore.add({
          ...session,
          date: session.date.toISOString(),
        });
      });

      // Update cache metadata
      metaStore.put({
        key: 'sessions_last_updated',
        timestamp: Date.now(),
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async mergeSessions(sessions: TrainingSession[]): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions', 'cache_meta'], 'readwrite');
      const sessionsStore = transaction.objectStore('sessions');
      const metaStore = transaction.objectStore('cache_meta');

      sessions.forEach((session) => {
        sessionsStore.put({
          ...session,
          date: session.date.toISOString(),
        });
      });

      metaStore.put({ key: 'sessions_last_updated', timestamp: Date.now() });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getLastSyncedTimestamp(): Promise<number> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['cache_meta'], 'readonly');
      const store = transaction.objectStore('cache_meta');
      const request = store.get('sessions_last_synced');

      request.onsuccess = () => {
        const result = request.result;
        resolve(result?.timestamp || 0);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setLastSyncedTimestamp(timestamp: number): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['cache_meta'], 'readwrite');
      const store = transaction.objectStore('cache_meta');
      store.put({ key: 'sessions_last_synced', timestamp });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async addSession(session: TrainingSession): Promise<void> {
    console.log('offlineStorage.addSession called with:', session);
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions', 'cache_meta'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const metaStore = transaction.objectStore('cache_meta');

      const sessionToStore = {
        ...session,
        date: session.date.toISOString(),
      };

      console.log('offlineStorage.addSession - storing session:', sessionToStore);

      store.put(sessionToStore);
      metaStore.put({ key: 'sessions_last_updated', timestamp: Date.now() });

      transaction.oncomplete = () => {
        console.log('offlineStorage.addSession - session stored successfully');
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async updateSession(
    id: number,
    updateData: Partial<TrainingSession>,
  ): Promise<TrainingSession | null> {
    console.log('offlineStorage.updateSession called with id:', id, 'updateData:', updateData);
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions', 'cache_meta'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const metaStore = transaction.objectStore('cache_meta');

      // First get the existing session
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const existingSession = getRequest.result;
        console.log('offlineStorage.updateSession - existing session:', existingSession);
        if (!existingSession) {
          resolve(null);
          return;
        }

        // Merge the update data
        const updatedSession = {
          ...existingSession,
          ...updateData,
          date: updateData.date ? updateData.date.toISOString() : existingSession.date,
          updatedAt: new Date().toISOString(),
        };

        console.log('offlineStorage.updateSession - updated session:', updatedSession);

        const putRequest = store.put(updatedSession);
        metaStore.put({ key: 'sessions_last_updated', timestamp: Date.now() });

        transaction.oncomplete = () => {
          const result = {
            ...updatedSession,
            date: new Date(updatedSession.date),
            updatedAt: new Date(updatedSession.updatedAt),
            // Ensure needsReview is properly converted to boolean
            needsReview: Boolean(updatedSession.needsReview),
          };
          console.log('offlineStorage.updateSession - resolved result:', result);
          resolve(result);
        };

        transaction.onerror = () => reject(transaction.error);
        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getSession(sessionId: number): Promise<TrainingSession | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.get(sessionId);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          resolve({
            ...result,
            date: new Date(result.date),
            // Ensure needsReview is properly converted to boolean
            needsReview: Boolean(result.needsReview),
          });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async removeSession(id: number): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');

      store.delete(id);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async deleteSession(id: number): Promise<void> {
    return this.removeSession(id);
  }

  async getStatistics(): Promise<any> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['statistics'], 'readonly');
      const store = transaction.objectStore('statistics');
      const request = store.get('current');

      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => reject(request.error);
    });
  }

  async setStatistics(stats: any): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['statistics', 'cache_meta'], 'readwrite');
      const statsStore = transaction.objectStore('statistics');
      const metaStore = transaction.objectStore('cache_meta');

      statsStore.put({
        id: 'current',
        data: stats,
      });

      metaStore.put({
        key: 'statistics_last_updated',
        timestamp: Date.now(),
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async clearStatistics(): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['statistics', 'cache_meta'], 'readwrite');
      const statsStore = transaction.objectStore('statistics');
      const metaStore = transaction.objectStore('cache_meta');

      statsStore.clear();
      metaStore.delete('statistics_last_updated');

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getSettings(): Promise<any> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get('current');

      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => reject(request.error);
    });
  }

  async setSettings(settings: any): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['settings', 'cache_meta'], 'readwrite');
      const settingsStore = transaction.objectStore('settings');
      const metaStore = transaction.objectStore('cache_meta');

      settingsStore.put({ id: 'current', data: settings });
      metaStore.put({ key: 'settings_last_updated', timestamp: Date.now() });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getCacheAge(key: string): Promise<number> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['cache_meta'], 'readonly');
      const store = transaction.objectStore('cache_meta');
      const request = store.get(key + '_last_updated');

      request.onsuccess = () => {
        const meta = request.result;
        if (meta && meta.timestamp) {
          resolve(Date.now() - meta.timestamp);
        } else {
          resolve(Infinity); // No cache
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    return this.clearAll();
  }

  async clearAll(): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        ['sessions', 'statistics', 'settings', 'cache_meta', 'sync_queue'],
        'readwrite',
      );

      transaction.objectStore('sessions').clear();
      transaction.objectStore('statistics').clear();
      transaction.objectStore('settings').clear();
      transaction.objectStore('cache_meta').clear();
      transaction.objectStore('sync_queue').clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // Sync queue management methods
  async markAsUnsynced(
    sessionId: number,
    operation: 'create' | 'update' | 'delete',
    updateData?: any,
  ): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sync_queue'], 'readwrite');
      const store = transaction.objectStore('sync_queue');

      const syncItem: UnsyncedSession = {
        sessionId,
        operation,
        timestamp: Date.now(),
        retries: 0,
        updateData,
      };

      store.put(syncItem);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async markAsSynced(sessionId: number): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sync_queue'], 'readwrite');
      const store = transaction.objectStore('sync_queue');

      store.delete(sessionId);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async incrementSyncRetries(sessionId: number): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sync_queue'], 'readwrite');
      const store = transaction.objectStore('sync_queue');

      const getRequest = store.get(sessionId);

      getRequest.onsuccess = () => {
        const syncItem = getRequest.result;
        if (syncItem) {
          syncItem.retries += 1;
          store.put(syncItem);
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getUnsyncedSessions(): Promise<UnsyncedSession[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sync_queue'], 'readonly');
      const store = transaction.objectStore('sync_queue');
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getLastSyncAttempt(): Promise<Date | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['cache_meta'], 'readonly');
      const store = transaction.objectStore('cache_meta');
      const request = store.get('last_sync_attempt');

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.timestamp) {
          resolve(new Date(result.timestamp));
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setLastSyncAttempt(): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['cache_meta'], 'readwrite');
      const store = transaction.objectStore('cache_meta');

      store.put({
        key: 'last_sync_attempt',
        timestamp: Date.now(),
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // Daily Goals Storage Methods
  async getDailyGoalSettings(): Promise<DailyGoalSettings | null> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['daily_goals'], 'readonly');
        const store = transaction.objectStore('daily_goals');
        const request = store.get('current');

        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            // Convert date strings back to Date objects
            const settings = {
              ...result,
              lastModified: result.lastModified ? new Date(result.lastModified) : undefined,
            };
            resolve(settings);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => {
          console.error('IndexedDB read error:', request.error);
          reject(
            new Error(`Failed to read daily goals: ${request.error?.message || 'Unknown error'}`),
          );
        };
      });
    } catch (error) {
      console.error('Error in getDailyGoalSettings:', error);
      // Return null instead of throwing to allow graceful fallback
      return null;
    }
  }

  async setDailyGoalSettings(settings: DailyGoalSettings): Promise<void> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['daily_goals'], 'readwrite');
        const store = transaction.objectStore('daily_goals');

        // Add id and lastModified timestamp
        const settingsWithMeta = {
          id: 'current',
          ...settings,
          lastModified: new Date(),
        };

        store.put(settingsWithMeta);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          console.error('IndexedDB transaction error:', transaction.error);
          reject(
            new Error(
              `Failed to save daily goals: ${transaction.error?.message || 'Unknown error'}`,
            ),
          );
        };
      });
    } catch (error) {
      console.error('Error in setDailyGoalSettings:', error);
      throw new Error(
        `Failed to save daily goals: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async clearDailyGoalSettings(): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['daily_goals'], 'readwrite');
      const store = transaction.objectStore('daily_goals');

      store.delete('current');

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
} // <-- This closing brace ends the OfflineStorage class

// Export singleton instance
export const offlineStorage = new OfflineStorage();

// Initialize immediately
offlineStorage.init().catch((error) => {
  console.warn('Failed to initialize offline storage:', error);
});
