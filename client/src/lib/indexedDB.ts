import { TrainingSession, InsertTrainingSession } from "@shared/schema";

const DB_NAME = 'ChessTrainingDB';
const DB_VERSION = 1;
const STORE_NAME = 'training_sessions';

export class IndexedDBStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    // Request persistent storage for maximum data protection
    if ('storage' in navigator && 'persist' in navigator.storage) {
      try {
        const isPersistent = await navigator.storage.persist();
        console.log('Persistent storage status:', isPersistent ? 'granted' : 'denied');
      } catch (error) {
        console.warn('Could not request persistent storage:', error);
      }
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store for training sessions
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          
          // Create indexes for efficient querying
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
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

  async getAllSessions(): Promise<TrainingSession[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const sessions = request.result as TrainingSession[];
        // Sort by date, newest first
        sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        resolve(sessions);
      };
    });
  }

  async getSessionsByType(type: string): Promise<TrainingSession[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('type');
      const request = index.getAll(type);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const sessions = request.result as TrainingSession[];
        sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        resolve(sessions);
      };
    });
  }

  async getSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('date');
      
      const range = IDBKeyRange.bound(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      
      const request = index.getAll(range);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const sessions = request.result as TrainingSession[];
        sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        resolve(sessions);
      };
    });
  }

  async createSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const session: TrainingSession = {
        ...insertSession,
        id: Date.now(), // Simple ID generation
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const request = store.add(session);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(session);
      };
    });
  }

  async deleteSession(id: number): Promise<boolean> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(true);
    });
  }

  async getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
    const sessions = await this.getSessionsByType('goal');
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    return sessions.find(session => new Date(session.date) >= oneWeekAgo);
  }

  async exportData(): Promise<string> {
    const sessions = await this.getAllSessions();
    return JSON.stringify(sessions, null, 2);
  }

  async importData(data: string): Promise<void> {
    const sessions: TrainingSession[] = JSON.parse(data);
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // Clear existing data first
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => {
        // Add imported sessions
        let completed = 0;
        sessions.forEach(session => {
          const request = store.add(session);
          request.onsuccess = () => {
            completed++;
            if (completed === sessions.length) {
              resolve();
            }
          };
          request.onerror = () => reject(request.error);
        });
        
        if (sessions.length === 0) {
          resolve();
        }
      };
      clearRequest.onerror = () => reject(clearRequest.error);
    });
  }

  async getStatistics() {
    const sessions = await this.getAllSessions();
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Filter out goal sessions from session counts
    const actualSessions = sessions.filter(s => s.type !== 'goal');
    
    const totalHours = actualSessions.reduce((sum, session) => {
      return sum + (session.duration || 0);
    }, 0);

    const totalSessions = actualSessions.length;

    const tacticsRating = sessions
      .filter(s => s.type === 'tactics' && s.finalScore)
      .reduce((sum, s) => sum + (s.finalScore || 0), 0) / 
      sessions.filter(s => s.type === 'tactics' && s.finalScore).length || 0;

    const gameResults = sessions.filter(s => s.type === 'game' && s.gameResult);
    const wins = gameResults.filter(s => s.gameResult === 'win').length;
    const draws = gameResults.filter(s => s.gameResult === 'draw').length;
    const losses = gameResults.filter(s => s.gameResult === 'loss').length;
    const winRate = gameResults.length > 0 ? (wins / gameResults.length) * 100 : 0;

    // Today's sessions should also exclude goal sessions
    const todaySessions = actualSessions.filter(session => {
      const sessionDate = new Date(session.date);
      return sessionDate >= startOfToday;
    });

    const todayTotalTime = todaySessions.reduce((sum, session) => {
      return sum + (session.duration || 0);
    }, 0);

    const todaySessionsCount = todaySessions.length;

    return {
      totalHours,
      totalSessions,
      tacticsRating: Math.round(tacticsRating) || 0,
      winRate: Math.round(winRate * 10) / 10,
      todayTotalTime,
      todaySessions: todaySessionsCount,
      gameStats: {
        wins,
        draws,
        losses,
        total: gameResults.length
      }
    };
  }

  async getStorageInfo() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const persistent = await navigator.storage.persist();
        
        return {
          used: Math.round(used / 1024 / 1024 * 100) / 100, // MB
          quota: Math.round(quota / 1024 / 1024 * 100) / 100, // MB
          persistent,
          percentage: quota > 0 ? Math.round((used / quota) * 100) : 0
        };
      } catch (error) {
        console.warn('Could not get storage estimate:', error);
        return null;
      }
    }
    
    return null;
  }
}

// Export singleton instance
export const indexedDBStorage = new IndexedDBStorage();