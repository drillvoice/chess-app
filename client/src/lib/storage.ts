import { TrainingSession, InsertTrainingSession } from "@shared/schema";
import { indexedDBStorage } from "./indexedDB";
import { createChessDataSync, FileSystemSync } from "./fileSystemSync";
import { createMobileBackup, type MobileBackup } from "./mobileBackup";

class LocalStorage {
  private storageKey = 'chess-training-sessions';
  private currentIdKey = 'chess-training-current-id';
  private useIndexedDB = true;
  private initialized = false;
  private fileSystemSync: FileSystemSync;
  private mobileBackup: MobileBackup;

  async init() {
    if (this.initialized) return;
    
    // Initialize file system sync
    this.fileSystemSync = createChessDataSync({
      onError: (error) => console.error('FileSystem sync error:', error),
      onSuccess: (message) => console.log('FileSystem sync:', message)
    });
    
    // Initialize mobile backup
    this.mobileBackup = createMobileBackup({
      onError: (error) => console.error('Mobile backup error:', error),
      onSuccess: (message) => console.log('Mobile backup:', message)
    });
    
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
      
      // Initialize file system sync and try to load data
      await this.fileSystemSync.initialize();
      
      await this.migrateFromLocalStorage();
      
      // Try to load from file system if IndexedDB is empty
      await this.loadFromFileSystemIfEmpty();
      
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

  /**
   * Loads data from file system backup if IndexedDB is empty
   * This helps restore data after browser cleanup or on new devices
   * @private
   */
  private async loadFromFileSystemIfEmpty(): Promise<void> {
    if (!this.fileSystemSync.isAutoSyncEnabled()) return;
    
    try {
      const indexedData = await indexedDBStorage.getAllSessions();
      if (indexedData.length === 0) {
        console.log('IndexedDB is empty, attempting to load from file system...');
        
        const fileSystemData = await this.fileSystemSync.autoLoadData();
        if (fileSystemData.length > 0) {
          console.log(`Loading ${fileSystemData.length} sessions from file system backup...`);
          
          // Import each session to IndexedDB
          for (const session of fileSystemData) {
            await indexedDBStorage.createSession(session);
          }
          
          console.log('File system data restored successfully!');
        }
      }
    } catch (error) {
      console.warn('Failed to load from file system:', error);
    }
  }

  /**
   * Automatically saves all sessions to file system after any data change
   * @private
   */
  private async autoSaveToFileSystem(): Promise<void> {
    if (!this.fileSystemSync.isAutoSyncEnabled()) return;
    
    try {
      const sessions = await this.getAllSessions();
      await this.fileSystemSync.autoSaveData(sessions);
    } catch (error) {
      console.warn('Auto-save to file system failed:', error);
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
        const session = await indexedDBStorage.createSession(sessionData);
        
        // Auto-save to file system after successful creation
        await this.autoSaveToFileSystem();
        
        return session;
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
    
    // Auto-save to file system after successful creation
    await this.autoSaveToFileSystem();
    
    // Schedule periodic backup for mobile devices
    await this.schedulePeriodicBackup();
    
    return session;
  }

  async deleteSession(id: number): Promise<boolean> {
    await this.init();
    
    if (this.useIndexedDB) {
      try {
        const result = await indexedDBStorage.deleteSession(id);
        
        // Auto-save to file system after successful deletion
        if (result) {
          await this.autoSaveToFileSystem();
        }
        
        return result;
      } catch (error) {
        console.warn('IndexedDB failed, falling back to localStorage:', error);
        this.useIndexedDB = false;
      }
    }
    
    const sessions = this.getSessions();
    const deleted = sessions.delete(id);
    if (deleted) {
      this.saveSessions(sessions);
      
      // Auto-save to file system after successful deletion
      await this.autoSaveToFileSystem();
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



  /**
   * Enables automatic file system synchronization
   * @returns {Promise<boolean>} True if sync was successfully enabled
   */
  async enableFileSystemSync(): Promise<boolean> {
    await this.init();
    
    if (!this.fileSystemSync.isFileSystemAccessSupported()) {
      throw new Error('File System Access API not supported in this browser');
    }
    
    const success = await this.fileSystemSync.requestDirectoryAccess();
    if (success) {
      // Perform initial sync
      await this.autoSaveToFileSystem();
    }
    
    return success;
  }

  /**
   * Disables automatic file system synchronization
   */
  async disableFileSystemSync(): Promise<void> {
    await this.init();
    await this.fileSystemSync.disableAutoSync();
  }

  /**
   * Checks if file system sync is currently enabled
   * @returns {boolean} True if auto-sync is active
   */
  isFileSystemSyncEnabled(): boolean {
    return this.fileSystemSync?.isAutoSyncEnabled() || false;
  }

  /**
   * Checks if file system sync is supported in current browser
   * @returns {boolean} True if API is available
   */
  isFileSystemSyncSupported(): boolean {
    return this.fileSystemSync?.isFileSystemAccessSupported() || false;
  }

  /**
   * Creates a mobile-compatible backup using Web Share API or download
   * @returns {Promise<void>}
   */
  async createMobileBackup(): Promise<void> {
    await this.init();
    const sessions = await this.getAllSessions();
    await this.mobileBackup.createBackup(sessions);
  }

  /**
   * Checks if mobile backup is supported (Web Share API)
   * @returns {boolean} True if Web Share API is available
   */
  isMobileBackupSupported(): boolean {
    return this.mobileBackup?.isWebShareSupported() || false;
  }

  /**
   * Checks if a backup is needed (mobile backup system)
   * @returns {boolean} True if backup is older than 1 day
   */
  isBackupNeeded(): boolean {
    return this.mobileBackup?.isBackupNeeded() || false;
  }

  /**
   * Creates a periodic backup for mobile devices
   */
  async schedulePeriodicBackup(): Promise<void> {
    await this.init();
    const sessions = await this.getAllSessions();
    await this.mobileBackup.schedulePeriodicBackup(sessions);
  }


}

export const localStorage = new LocalStorage();