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
      console.warn('Hybrid storage initialization failed:', error);
      this.useFirestore = false;
    }
  }

  private async performInitialSync() {
    if (this.syncInProgress) return;
    this.syncInProgress = true;

    try {
      // Get data from both sources
      const [localSessions, cloudSessions] = await Promise.all([
        indexedDBStorage.getAllSessions(),
        this.useFirestore ? firestoreStorage.getAllSessions() : []
      ]);

      // Merge data (cloud takes precedence for conflicts)
      const mergedSessions = this.mergeSessions(localSessions, cloudSessions);
      
      // Update both storages with merged data
      await Promise.all([
        this.updateIndexedDB(mergedSessions),
        this.useFirestore ? this.updateFirestore(mergedSessions) : Promise.resolve()
      ]);

      // Auto-save to file system
      await this.autoSaveToFileSystem();
      
    } catch (error) {
      console.warn('Initial sync failed:', error);
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
    
    // Add cloud sessions (overwrite local if exists)
    cloudSessions.forEach(session => {
      sessionMap.set(session.id, session);
    });
    
    return Array.from(sessionMap.values()).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  private async updateIndexedDB(sessions: TrainingSession[]) {
    // Clear existing data and import merged data
    const exportData = JSON.stringify(sessions, null, 2);
    await indexedDBStorage.importData(exportData);
  }

  private async updateFirestore(sessions: TrainingSession[]) {
    // Note: This is a simplified approach. In production, you'd want more sophisticated sync logic
    const exportData = JSON.stringify(sessions, null, 2);
    await firestoreStorage.importData(exportData);
  }

  async getAllSessions(): Promise<TrainingSession[]> {
    await this.init();
    
    if (this.useFirestore) {
      try {
        return await firestoreStorage.getAllSessions();
      } catch (error) {
        console.warn('Firestore failed, falling back to IndexedDB:', error);
        this.useFirestore = false;
      }
    }
    
    return await indexedDBStorage.getAllSessions();
  }

  async getSessionsByType(type: string): Promise<TrainingSession[]> {
    await this.init();
    
    if (this.useFirestore) {
      try {
        return await firestoreStorage.getSessionsByType(type);
      } catch (error) {
        console.warn('Firestore failed, falling back to IndexedDB:', error);
        this.useFirestore = false;
      }
    }
    
    return await indexedDBStorage.getSessionsByType(type);
  }

  async getSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]> {
    await this.init();
    
    if (this.useFirestore) {
      try {
        return await firestoreStorage.getSessionsByDateRange(startDate, endDate);
      } catch (error) {
        console.warn('Firestore failed, falling back to IndexedDB:', error);
        this.useFirestore = false;
      }
    }
    
    return await indexedDBStorage.getSessionsByDateRange(startDate, endDate);
  }

  async createSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
    await this.init();
    
    let session: TrainingSession;
    
    if (this.useFirestore) {
      try {
        // Create in Firestore first
        session = await firestoreStorage.createSession(insertSession);
        
        // Then create in IndexedDB as backup
        try {
          await indexedDBStorage.createSession(insertSession);
        } catch (error) {
          console.warn('IndexedDB backup failed:', error);
        }
      } catch (error) {
        console.warn('Firestore failed, falling back to IndexedDB:', error);
        this.useFirestore = false;
        session = await indexedDBStorage.createSession(insertSession);
      }
    } else {
      session = await indexedDBStorage.createSession(insertSession);
    }
    
    // Auto-save to file system
    await this.autoSaveToFileSystem();
    
    return session;
  }

  async deleteSession(id: number): Promise<boolean> {
    await this.init();
    
    let success = false;
    
    if (this.useFirestore) {
      try {
        success = await firestoreStorage.deleteSession(id);
        
        // Also delete from IndexedDB
        try {
          await indexedDBStorage.deleteSession(id);
        } catch (error) {
          console.warn('IndexedDB delete failed:', error);
        }
      } catch (error) {
        console.warn('Firestore failed, falling back to IndexedDB:', error);
        this.useFirestore = false;
        success = await indexedDBStorage.deleteSession(id);
      }
    } else {
      success = await indexedDBStorage.deleteSession(id);
    }
    
    // Auto-save to file system
    if (success) {
      await this.autoSaveToFileSystem();
    }
    
    return success;
  }

  async getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
    await this.init();
    
    if (this.useFirestore) {
      try {
        return await firestoreStorage.getCurrentWeeklyGoal();
      } catch (error) {
        console.warn('Firestore failed, falling back to IndexedDB:', error);
        this.useFirestore = false;
      }
    }
    
    return await indexedDBStorage.getCurrentWeeklyGoal();
  }

  async exportData(): Promise<string> {
    await this.init();
    
    if (this.useFirestore) {
      try {
        return await firestoreStorage.exportData();
      } catch (error) {
        console.warn('Firestore failed, falling back to IndexedDB:', error);
        this.useFirestore = false;
      }
    }
    
    return await indexedDBStorage.exportData();
  }

  async importData(data: string): Promise<void> {
    await this.init();
    
    if (this.useFirestore) {
      try {
        await firestoreStorage.importData(data);
        
        // Also import to IndexedDB
        try {
          await indexedDBStorage.importData(data);
        } catch (error) {
          console.warn('IndexedDB import failed:', error);
        }
      } catch (error) {
        console.warn('Firestore failed, falling back to IndexedDB:', error);
        this.useFirestore = false;
        await indexedDBStorage.importData(data);
      }
    } else {
      await indexedDBStorage.importData(data);
    }
    
    // Auto-save to file system
    await this.autoSaveToFileSystem();
  }

  async getStatistics() {
    await this.init();
    
    if (this.useFirestore) {
      try {
        return await firestoreStorage.getStatistics();
      } catch (error) {
        console.warn('Firestore failed, falling back to IndexedDB:', error);
        this.useFirestore = false;
      }
    }
    
    return await indexedDBStorage.getStatistics();
  }

  async getStorageInfo() {
    await this.init();
    
    const firestoreInfo = this.useFirestore ? await firestoreStorage.getStorageInfo() : null;
    const indexedDBInfo = await indexedDBStorage.getStorageInfo();
    
    return {
      primary: firestoreInfo || indexedDBInfo,
      backup: firestoreInfo ? indexedDBInfo : null,
      fileSystemSync: this.fileSystemSync.isAutoSyncEnabled(),
      syncStatus: this.useFirestore ? 'Cloud Sync Active' : 'Local Only'
    };
  }

  // File system sync methods
  async enableFileSystemSync(): Promise<boolean> {
    await this.init();
    
    if (!this.fileSystemSync.isFileSystemAccessSupported()) {
      throw new Error('File System Access API not supported in this browser');
    }
    
    const success = await this.fileSystemSync.requestDirectoryAccess();
    if (success) {
      await this.autoSaveToFileSystem();
    }
    
    return success;
  }

  async disableFileSystemSync(): Promise<void> {
    await this.init();
    await this.fileSystemSync.disableAutoSync();
  }

  isFileSystemSyncEnabled(): boolean {
    return this.fileSystemSync?.isAutoSyncEnabled() || false;
  }

  isFileSystemSyncSupported(): boolean {
    return this.fileSystemSync?.isFileSystemAccessSupported() || false;
  }

  private async autoSaveToFileSystem(): Promise<void> {
    if (!this.fileSystemSync.isAutoSyncEnabled()) return;
    
    try {
      const sessions = await this.getAllSessions();
      await this.fileSystemSync.autoSaveData(sessions);
    } catch (error) {
      console.warn('Auto-save to file system failed:', error);
    }
  }

  // Real-time sync methods
  subscribeToSessions(callback: (sessions: TrainingSession[]) => void) {
    if (this.useFirestore) {
      return firestoreStorage.subscribeToSessions(callback);
    }
    return () => {}; // Return empty unsubscribe function
  }

  // Network management
  async goOnline() {
    if (this.useFirestore) {
      await firestoreStorage.goOnline();
    }
  }

  async goOffline() {
    if (this.useFirestore) {
      await firestoreStorage.goOffline();
    }
  }

  // Sync status
  isSyncEnabled(): boolean {
    return this.useFirestore;
  }

  async forceSyncNow(): Promise<void> {
    if (this.useFirestore) {
      await this.performInitialSync();
    }
  }

  // Cleanup
  cleanup() {
    if (this.useFirestore) {
      firestoreStorage.cleanup();
    }
  }
}

export const hybridStorage = new HybridStorage();