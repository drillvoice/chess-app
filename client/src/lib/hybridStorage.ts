import { TrainingSession, InsertTrainingSession } from '@shared/schema';
import { indexedDBStorage } from './indexedDB';
import { firestoreStorage } from './firestoreStorage';
import { createChessDataSync } from './fileSystemSync';

/**
 * Hybrid storage system that combines IndexedDB for local storage 
 * with Firestore for cloud sync and file system backup
 */
export class HybridStorage {
  private useFirestore = true;
  private useIndexedDB = true;
  private initialized = false;
  private fileSystemSync: ReturnType<typeof createChessDataSync>;
  private syncInProgress = false;

  constructor() {
    this.fileSystemSync = createChessDataSync({
      onError: (error) => console.warn('File system sync error:', error),
      onSuccess: (message) => console.log('File system sync:', message)
    });
  }

  async init() {
    if (this.initialized) return;
    
    try {
      // Initialize IndexedDB
      await indexedDBStorage.init();
      
      // Initialize file system sync
      await this.fileSystemSync.initialize();
      
      // Perform initial sync between IndexedDB and Firestore
      await this.performInitialSync();
      
      this.initialized = true;
    } catch (error) {
      console.error('Hybrid storage initialization failed:', error);
      // Fall back to IndexedDB only
      this.useFirestore = false;
      await indexedDBStorage.init();
      this.initialized = true;
    }
  }

  private async performInitialSync() {
    if (this.syncInProgress) return;
    this.syncInProgress = true;

    try {
      // Get data from both sources
      const [localSessions, cloudSessions] = await Promise.allSettled([
        indexedDBStorage.getAllSessions(),
        this.useFirestore ? firestoreStorage.getAllSessions() : Promise.resolve([])
      ]);

      const localData = localSessions.status === 'fulfilled' ? localSessions.value : [];
      const cloudData = cloudSessions.status === 'fulfilled' ? cloudSessions.value : [];

      // Merge the data (cloud takes precedence for conflicts)
      const mergedSessions = this.mergeSessions(localData, cloudData);

      // Update both storage systems with merged data
      await Promise.allSettled([
        this.updateIndexedDB(mergedSessions),
        this.useFirestore ? this.updateFirestore(mergedSessions) : Promise.resolve()
      ]);

    } catch (error) {
      console.error('Initial sync failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  private mergeSessions(localSessions: TrainingSession[], cloudSessions: TrainingSession[]): TrainingSession[] {
    const sessionMap = new Map<number, TrainingSession>();
    
    // Add local sessions first
    localSessions.forEach(session => {
      sessionMap.set(session.id, session);
    });
    
    // Add cloud sessions (overwrite local if conflict)
    cloudSessions.forEach(session => {
      sessionMap.set(session.id, session);
    });
    
    return Array.from(sessionMap.values()).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  private async updateIndexedDB(sessions: TrainingSession[]) {
    // Clear and repopulate IndexedDB
    const currentSessions = await indexedDBStorage.getAllSessions();
    for (const session of currentSessions) {
      await indexedDBStorage.deleteSession(session.id);
    }
    
    for (const session of sessions) {
      await indexedDBStorage.createSession(session);
    }
  }

  private async updateFirestore(sessions: TrainingSession[]) {
    if (!this.useFirestore) return;
    
    // This is a simplified approach - in production you'd want more sophisticated sync
    const currentSessions = await firestoreStorage.getAllSessions();
    
    // Delete sessions that don't exist in merged data
    for (const session of currentSessions) {
      if (!sessions.find(s => s.id === session.id)) {
        await firestoreStorage.deleteSession(session.id);
      }
    }
    
    // Add or update sessions
    for (const session of sessions) {
      const exists = currentSessions.find(s => s.id === session.id);
      if (!exists) {
        await firestoreStorage.createSession(session);
      }
    }
  }

  async getAllSessions(): Promise<TrainingSession[]> {
    await this.init();
    
    try {
      if (this.useFirestore) {
        return await firestoreStorage.getAllSessions();
      } else {
        return await indexedDBStorage.getAllSessions();
      }
    } catch (error) {
      console.error('Error getting sessions:', error);
      return await indexedDBStorage.getAllSessions();
    }
  }

  async getSessionsByType(type: string): Promise<TrainingSession[]> {
    await this.init();
    
    try {
      if (this.useFirestore) {
        return await firestoreStorage.getSessionsByType(type);
      } else {
        return await indexedDBStorage.getSessionsByType(type);
      }
    } catch (error) {
      console.error('Error getting sessions by type:', error);
      return await indexedDBStorage.getSessionsByType(type);
    }
  }

  async getSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]> {
    await this.init();
    
    try {
      if (this.useFirestore) {
        return await firestoreStorage.getSessionsByDateRange(startDate, endDate);
      } else {
        return await indexedDBStorage.getSessionsByDateRange(startDate, endDate);
      }
    } catch (error) {
      console.error('Error getting sessions by date range:', error);
      return await indexedDBStorage.getSessionsByDateRange(startDate, endDate);
    }
  }

  async createSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
    await this.init();
    
    let session: TrainingSession;
    
    try {
      // Create in primary storage (Firestore if available, otherwise IndexedDB)
      if (this.useFirestore) {
        session = await firestoreStorage.createSession(insertSession);
        // Also create in IndexedDB for offline access
        await indexedDBStorage.createSession(session);
      } else {
        session = await indexedDBStorage.createSession(insertSession);
      }
      
      // Auto-save to file system if enabled
      await this.autoSaveToFileSystem();
      
      return session;
    } catch (error) {
      console.error('Error creating session:', error);
      // Fallback to IndexedDB
      session = await indexedDBStorage.createSession(insertSession);
      await this.autoSaveToFileSystem();
      return session;
    }
  }

  async deleteSession(id: number): Promise<boolean> {
    await this.init();
    
    try {
      let success = false;
      
      if (this.useFirestore) {
        success = await firestoreStorage.deleteSession(id);
        // Also delete from IndexedDB
        await indexedDBStorage.deleteSession(id);
      } else {
        success = await indexedDBStorage.deleteSession(id);
      }
      
      // Auto-save to file system if enabled
      await this.autoSaveToFileSystem();
      
      return success;
    } catch (error) {
      console.error('Error deleting session:', error);
      const success = await indexedDBStorage.deleteSession(id);
      await this.autoSaveToFileSystem();
      return success;
    }
  }

  async getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
    await this.init();
    
    try {
      if (this.useFirestore) {
        return await firestoreStorage.getCurrentWeeklyGoal();
      } else {
        return await indexedDBStorage.getCurrentWeeklyGoal();
      }
    } catch (error) {
      console.error('Error getting weekly goal:', error);
      return await indexedDBStorage.getCurrentWeeklyGoal();
    }
  }

  async exportData(): Promise<string> {
    await this.init();
    
    try {
      if (this.useFirestore) {
        return await firestoreStorage.exportData();
      } else {
        return await indexedDBStorage.exportData();
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      return await indexedDBStorage.exportData();
    }
  }

  async importData(data: string): Promise<void> {
    await this.init();
    
    try {
      if (this.useFirestore) {
        await firestoreStorage.importData(data);
        // Also import to IndexedDB
        await indexedDBStorage.importData(data);
      } else {
        await indexedDBStorage.importData(data);
      }
      
      // Auto-save to file system if enabled
      await this.autoSaveToFileSystem();
    } catch (error) {
      console.error('Error importing data:', error);
      await indexedDBStorage.importData(data);
      await this.autoSaveToFileSystem();
    }
  }

  async getStatistics() {
    await this.init();
    
    try {
      if (this.useFirestore) {
        return await firestoreStorage.getStatistics();
      } else {
        return await indexedDBStorage.getStatistics();
      }
    } catch (error) {
      console.error('Error getting statistics:', error);
      return await indexedDBStorage.getStatistics();
    }
  }

  async getStorageInfo() {
    await this.init();
    
    try {
      if (this.useFirestore) {
        return await firestoreStorage.getStorageInfo();
      } else {
        return await indexedDBStorage.getStorageInfo();
      }
    } catch (error) {
      console.error('Error getting storage info:', error);
      return await indexedDBStorage.getStorageInfo();
    }
  }

  // File system sync methods
  async enableFileSystemSync(): Promise<boolean> {
    await this.init();
    const success = await this.fileSystemSync.requestDirectoryAccess();
    if (success) {
      await this.autoSaveToFileSystem();
    }
    return success;
  }

  async disableFileSystemSync(): Promise<void> {
    await this.fileSystemSync.disableAutoSync();
  }

  isFileSystemSyncEnabled(): boolean {
    return this.fileSystemSync.isAutoSyncEnabled();
  }

  isFileSystemSyncSupported(): boolean {
    return this.fileSystemSync.isFileSystemAccessSupported();
  }

  private async autoSaveToFileSystem(): Promise<void> {
    if (!this.isFileSystemSyncEnabled()) return;
    
    try {
      const sessions = await this.getAllSessions();
      await this.fileSystemSync.autoSaveData(sessions);
    } catch (error) {
      console.warn('Auto-save to file system failed:', error);
    }
  }

  subscribeToSessions(callback: (sessions: TrainingSession[]) => void) {
    if (this.useFirestore) {
      return firestoreStorage.subscribeToSessions(callback);
    } else {
      // For IndexedDB, we don't have real-time updates
      return () => {};
    }
  }

  async goOnline() {
    await this.init();
    if (this.useFirestore) {
      await firestoreStorage.goOnline();
    }
  }

  async goOffline() {
    await this.init();
    if (this.useFirestore) {
      await firestoreStorage.goOffline();
    }
  }

  isSyncEnabled(): boolean {
    return this.useFirestore;
  }

  async forceSyncNow(): Promise<void> {
    await this.init();
    if (this.useFirestore) {
      await this.performInitialSync();
    }
    await this.autoSaveToFileSystem();
  }

  cleanup() {
    if (this.useFirestore) {
      firestoreStorage.cleanup();
    }
  }
}

export const hybridStorage = new HybridStorage();