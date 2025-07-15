import { TrainingSession, InsertTrainingSession } from "@shared/schema";
import { indexedDBStorage } from "./indexedDB";
import { createChessDataSync } from "./fileSystemSync";

class LocalStorage {
  private initialized = false;
  private fileSystemSync: ReturnType<typeof createChessDataSync>;

  constructor() {
    this.fileSystemSync = createChessDataSync({
      onError: (error) => console.warn('File system sync error:', error),
      onSuccess: (message) => console.log('File system sync:', message)
    });
  }

  async init() {
    if (this.initialized) return;
    
    await indexedDBStorage.init();
    await this.fileSystemSync.initialize();
    this.initialized = true;
  }

  async getAllSessions(): Promise<TrainingSession[]> {
    await this.init();
    return indexedDBStorage.getAllSessions();
  }

  async getSessionsByType(type: string): Promise<TrainingSession[]> {
    await this.init();
    return indexedDBStorage.getSessionsByType(type);
  }

  async getSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]> {
    await this.init();
    return indexedDBStorage.getSessionsByDateRange(startDate, endDate);
  }

  async createSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
    await this.init();
    const session = await indexedDBStorage.createSession(insertSession);
    
    // Auto-save to file system if enabled
    if (this.isFileSystemSyncEnabled()) {
      try {
        const allSessions = await indexedDBStorage.getAllSessions();
        await this.fileSystemSync.autoSaveData(allSessions);
      } catch (error) {
        console.warn('Auto-save failed:', error);
      }
    }
    
    return session;
  }

  async deleteSession(id: number): Promise<boolean> {
    await this.init();
    const result = await indexedDBStorage.deleteSession(id);
    
    // Auto-save to file system if enabled
    if (this.isFileSystemSyncEnabled()) {
      try {
        const allSessions = await indexedDBStorage.getAllSessions();
        await this.fileSystemSync.autoSaveData(allSessions);
      } catch (error) {
        console.warn('Auto-save failed:', error);
      }
    }
    
    return result;
  }

  async getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
    await this.init();
    return indexedDBStorage.getCurrentWeeklyGoal();
  }

  async exportData(): Promise<string> {
    await this.init();
    return indexedDBStorage.exportData();
  }

  async importData(data: string): Promise<void> {
    await this.init();
    return indexedDBStorage.importData(data);
  }

  async getStatistics() {
    await this.init();
    return indexedDBStorage.getStatistics();
  }

  async getStorageInfo() {
    await this.init();
    return indexedDBStorage.getStorageInfo();
  }

  // File system sync methods
  async enableFileSystemSync(): Promise<boolean> {
    await this.init();
    const success = await this.fileSystemSync.requestDirectoryAccess();
    if (success) {
      // Auto-save current data to file system
      try {
        const allSessions = await indexedDBStorage.getAllSessions();
        await this.fileSystemSync.autoSaveData(allSessions);
      } catch (error) {
        console.warn('Initial auto-save failed:', error);
      }
    }
    return success;
  }

  async disableFileSystemSync(): Promise<void> {
    await this.init();
    await this.fileSystemSync.disableAutoSync();
  }

  isFileSystemSyncEnabled(): boolean {
    return this.fileSystemSync.isAutoSyncEnabled();
  }

  isFileSystemSyncSupported(): boolean {
    return this.fileSystemSync.isFileSystemAccessSupported();
  }

  // Cloud sync methods (simplified - no actual cloud sync)
  isSyncEnabled(): boolean {
    return false; // No cloud sync without Firebase
  }

  async forceSyncNow(): Promise<void> {
    await this.init();
    // Just sync to file system if enabled
    if (this.isFileSystemSyncEnabled()) {
      const allSessions = await indexedDBStorage.getAllSessions();
      await this.fileSystemSync.autoSaveData(allSessions);
    }
  }

  subscribeToSessions(callback: (sessions: TrainingSession[]) => void) {
    // No real-time subscriptions without Firebase
    return () => {};
  }

  async goOnline() {
    // No-op without cloud sync
  }

  async goOffline() {
    // No-op without cloud sync
  }

  cleanup() {
    // No cleanup needed
  }
}

export const localStorage = new LocalStorage();