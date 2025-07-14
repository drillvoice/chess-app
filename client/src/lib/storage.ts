import { TrainingSession, InsertTrainingSession } from "@shared/schema";
import { indexedDBStorage } from "./indexedDB";

class LocalStorage {
  private storageKey = 'chess-training-sessions';
  private currentIdKey = 'chess-training-current-id';
  private useIndexedDB = true;
  private initialized = false;

  async init() {
    if (this.initialized) return;
    
    try {
      // Request persistent storage to protect from browser cleanup
      if ('storage' in navigator && 'persist' in navigator.storage) {
        const isPersistent = await navigator.storage.persist();
        if (isPersistent) {
          console.log('Persistent storage granted - your data is protected');
        } else {
          console.log('Persistent storage not granted - data may be cleared under storage pressure');
        }
      }
      
      await indexedDBStorage.init();
      await this.migrateFromLocalStorage();
      this.initialized = true;
    } catch (error) {
      console.warn('Failed to initialize IndexedDB, using localStorage:', error);
      this.useIndexedDB = false;
      this.initialized = true;
    }
  }

  private async migrateFromLocalStorage() {
    // Check if we have data in localStorage but not in IndexedDB
    const localData = this.getSessions();
    if (localData.size === 0) return;

    try {
      const indexedData = await indexedDBStorage.getAllSessions();
      if (indexedData.length === 0) {
        console.log('Migrating data from localStorage to IndexedDB...');
        
        // Migrate each session
        for (const session of localData.values()) {
          await indexedDBStorage.createSession(session);
        }
        
        console.log(`Migrated ${localData.size} sessions to IndexedDB`);
      }
    } catch (error) {
      console.warn('Migration failed, continuing with localStorage:', error);
      this.useIndexedDB = false;
    }
  }

  private getSessions(): Map<number, TrainingSession> {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return new Map();
    
    const sessions: TrainingSession[] = JSON.parse(stored);
    return new Map(sessions.map(session => [session.id, session]));
  }

  private saveSessions(sessions: Map<number, TrainingSession>): void {
    const sessionsArray = Array.from(sessions.values());
    localStorage.setItem(this.storageKey, JSON.stringify(sessionsArray));
  }

  private getCurrentId(): number {
    const stored = localStorage.getItem(this.currentIdKey);
    return stored ? parseInt(stored) : 1;
  }

  private setCurrentId(id: number): void {
    localStorage.setItem(this.currentIdKey, id.toString());
  }

  async getAllSessions(): Promise<TrainingSession[]> {
    await this.init();
    
    if (this.useIndexedDB) {
      try {
        return await indexedDBStorage.getAllSessions();
      } catch (error) {
        console.warn('IndexedDB failed, falling back to localStorage:', error);
        this.useIndexedDB = false;
      }
    }
    
    return Array.from(this.getSessions().values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async getSessionsByType(type: string): Promise<TrainingSession[]> {
    await this.init();
    
    if (this.useIndexedDB) {
      try {
        return await indexedDBStorage.getSessionsByType(type);
      } catch (error) {
        console.warn('IndexedDB failed, falling back to localStorage:', error);
        this.useIndexedDB = false;
      }
    }
    
    const sessions = await this.getAllSessions();
    return sessions.filter(session => session.type === type);
  }

  async getSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]> {
    await this.init();
    
    if (this.useIndexedDB) {
      try {
        return await indexedDBStorage.getSessionsByDateRange(startDate, endDate);
      } catch (error) {
        console.warn('IndexedDB failed, falling back to localStorage:', error);
        this.useIndexedDB = false;
      }
    }
    
    const sessions = await this.getAllSessions();
    return sessions.filter(session => {
      const sessionDate = new Date(session.date);
      return sessionDate >= startDate && sessionDate <= endDate;
    });
  }

  async createSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
    await this.init();
    
    if (this.useIndexedDB) {
      try {
        const sessionData = {
          ...insertSession,
          date: insertSession.date || new Date(),
          goalWeekStart: insertSession.type === 'goal' && !insertSession.goalWeekStart ? new Date() : insertSession.goalWeekStart,
        };
        return await indexedDBStorage.createSession(sessionData);
      } catch (error) {
        console.warn('IndexedDB failed, falling back to localStorage:', error);
        this.useIndexedDB = false;
      }
    }
    
    const sessions = this.getSessions();
    const currentId = this.getCurrentId();
    
    const session: TrainingSession = {
      ...insertSession,
      id: currentId,
      date: insertSession.date || new Date(),
      goalWeekStart: insertSession.type === 'goal' && !insertSession.goalWeekStart ? new Date() : insertSession.goalWeekStart,
    };

    sessions.set(currentId, session);
    this.saveSessions(sessions);
    this.setCurrentId(currentId + 1);
    
    return session;
  }

  async deleteSession(id: number): Promise<boolean> {
    await this.init();
    
    if (this.useIndexedDB) {
      try {
        return await indexedDBStorage.deleteSession(id);
      } catch (error) {
        console.warn('IndexedDB failed, falling back to localStorage:', error);
        this.useIndexedDB = false;
      }
    }
    
    const sessions = this.getSessions();
    const deleted = sessions.delete(id);
    if (deleted) {
      this.saveSessions(sessions);
    }
    return deleted;
  }

  async getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
    await this.init();
    
    if (this.useIndexedDB) {
      try {
        return await indexedDBStorage.getCurrentWeeklyGoal();
      } catch (error) {
        console.warn('IndexedDB failed, falling back to localStorage:', error);
        this.useIndexedDB = false;
      }
    }
    
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const sessions = await this.getAllSessions();
    const goals = sessions
      .filter(session => session.type === 'goal')
      .filter(session => session.goalWeekStart && new Date(session.goalWeekStart) >= oneWeekAgo)
      .sort((a, b) => new Date(b.goalWeekStart!).getTime() - new Date(a.goalWeekStart!).getTime());
    
    return goals[0];
  }

  async exportData(): Promise<string> {
    if (this.useIndexedDB) {
      try {
        return await indexedDBStorage.exportData();
      } catch (error) {
        console.warn('IndexedDB failed, falling back to localStorage:', error);
        this.useIndexedDB = false;
      }
    }
    
    const sessions = await this.getAllSessions();
    return JSON.stringify(sessions, null, 2);
  }

  async importData(data: string): Promise<void> {
    if (this.useIndexedDB) {
      try {
        return await indexedDBStorage.importData(data);
      } catch (error) {
        console.warn('IndexedDB failed, falling back to localStorage:', error);
        this.useIndexedDB = false;
      }
    }
    
    try {
      const sessions: TrainingSession[] = JSON.parse(data);
      const sessionMap = new Map<number, TrainingSession>();
      let maxId = 0;
      
      for (const session of sessions) {
        sessionMap.set(session.id, session);
        if (session.id > maxId) {
          maxId = session.id;
        }
      }
      
      this.saveSessions(sessionMap);
      this.setCurrentId(maxId + 1);
    } catch (error) {
      throw new Error('Invalid data format');
    }
  }

  async getStatistics() {
    await this.init();
    
    if (this.useIndexedDB) {
      try {
        return await indexedDBStorage.getStatistics();
      } catch (error) {
        console.warn('IndexedDB failed, falling back to localStorage:', error);
        this.useIndexedDB = false;
      }
    }
    
    const sessions = await this.getAllSessions();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const totalSessions = sessions.length;
    const totalHours = sessions.reduce((sum, session) => sum + (session.duration || 0), 0) / 60;
    
    const tacticsSession = sessions.filter(s => s.type === 'tactics').pop();
    const tacticsRating = tacticsSession?.finalScore || 0;
    
    const gamesSessions = sessions.filter(s => s.type === 'game');
    const wins = gamesSessions.filter(s => s.gameResult === 'win').length;
    const draws = gamesSessions.filter(s => s.gameResult === 'draw').length;
    const losses = gamesSessions.filter(s => s.gameResult === 'loss').length;
    const winRate = gamesSessions.length > 0 ? Math.round((wins / gamesSessions.length) * 100) : 0;
    
    const todaySessions = sessions.filter(s => new Date(s.date) >= today);
    const todayTotalTime = todaySessions.reduce((sum, session) => sum + (session.duration || 0), 0);
    
    return {
      totalHours: Math.round(totalHours * 10) / 10,
      totalSessions,
      tacticsRating,
      winRate,
      todayTotalTime,
      todaySessions: todaySessions.length,
      gameStats: {
        wins,
        draws,
        losses,
        total: gamesSessions.length
      }
    };
  }

  async getStorageInfo() {
    await this.init();
    
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

export const localStorage = new LocalStorage();