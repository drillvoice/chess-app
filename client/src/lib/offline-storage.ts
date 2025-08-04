import { TrainingSession } from '@shared/schema';

// IndexedDB wrapper for better performance than localStorage
class OfflineStorage {
  private dbName = 'chess-logger-offline';
  private version = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Sessions store
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionsStore.createIndex('date', 'date', { unique: false });
          sessionsStore.createIndex('type', 'type', { unique: false });
        }
        
        // Cache metadata store
        if (!db.objectStoreNames.contains('cache_meta')) {
          db.createObjectStore('cache_meta', { keyPath: 'key' });
        }
        
        // Statistics store
        if (!db.objectStoreNames.contains('statistics')) {
          db.createObjectStore('statistics', { keyPath: 'id' });
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  async getSessions(): Promise<TrainingSession[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.getAll();
      
      request.onsuccess = () => {
        const sessions = request.result.map(session => ({
          ...session,
          date: new Date(session.date)
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
      sessions.forEach(session => {
        sessionsStore.add({
          ...session,
          date: session.date.toISOString()
        });
      });
      
      // Update cache metadata
      metaStore.put({
        key: 'sessions_last_updated',
        timestamp: Date.now()
      });
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async addSession(session: TrainingSession): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');

      store.put({
        ...session,
        date: session.date.toISOString()
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async updateSession(session: TrainingSession): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');

      store.put({
        ...session,
        date: session.date.toISOString()
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
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
        data: stats
      });
      
      metaStore.put({
        key: 'statistics_last_updated',
        timestamp: Date.now()
      });
      
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
      const transaction = db.transaction(['sessions', 'statistics', 'cache_meta'], 'readwrite');
      
      transaction.objectStore('sessions').clear();
      transaction.objectStore('statistics').clear();
      transaction.objectStore('cache_meta').clear();
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Export singleton instance
export const offlineStorage = new OfflineStorage();

// Initialize immediately
offlineStorage.init().catch(error => {
  console.warn('Failed to initialize offline storage:', error);
});