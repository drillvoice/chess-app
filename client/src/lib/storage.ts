import { TrainingSession, InsertTrainingSession } from "@shared/schema";
import { hybridStorage } from "./hybridStorage";

class LocalStorage {
  private initialized = false;

  async init() {
    if (this.initialized) return;
    
    await hybridStorage.init();
    this.initialized = true;
  }

  async getAllSessions(): Promise<TrainingSession[]> {
    await this.init();
    return hybridStorage.getAllSessions();
  }

  async getSessionsByType(type: string): Promise<TrainingSession[]> {
    await this.init();
    return hybridStorage.getSessionsByType(type);
  }

  async getSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]> {
    await this.init();
    return hybridStorage.getSessionsByDateRange(startDate, endDate);
  }

  async createSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
    await this.init();
    return hybridStorage.createSession(insertSession);
  }

  async deleteSession(id: number): Promise<boolean> {
    await this.init();
    return hybridStorage.deleteSession(id);
  }

  async getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
    await this.init();
    return hybridStorage.getCurrentWeeklyGoal();
  }

  async exportData(): Promise<string> {
    await this.init();
    return hybridStorage.exportData();
  }

  async importData(data: string): Promise<void> {
    await this.init();
    return hybridStorage.importData(data);
  }

  async getStatistics() {
    await this.init();
    return hybridStorage.getStatistics();
  }

  async getStorageInfo() {
    await this.init();
    return hybridStorage.getStorageInfo();
  }

  // File system sync methods
  async enableFileSystemSync(): Promise<boolean> {
    await this.init();
    return hybridStorage.enableFileSystemSync();
  }

  async disableFileSystemSync(): Promise<void> {
    await this.init();
    return hybridStorage.disableFileSystemSync();
  }

  isFileSystemSyncEnabled(): boolean {
    return hybridStorage.isFileSystemSyncEnabled();
  }

  isFileSystemSyncSupported(): boolean {
    return hybridStorage.isFileSystemSyncSupported();
  }

  // Cloud sync methods
  isSyncEnabled(): boolean {
    return hybridStorage.isSyncEnabled();
  }

  async forceSyncNow(): Promise<void> {
    await this.init();
    return hybridStorage.forceSyncNow();
  }

  subscribeToSessions(callback: (sessions: TrainingSession[]) => void) {
    return hybridStorage.subscribeToSessions(callback);
  }

  async goOnline() {
    await this.init();
    return hybridStorage.goOnline();
  }

  async goOffline() {
    await this.init();
    return hybridStorage.goOffline();
  }

  cleanup() {
    hybridStorage.cleanup();
  }
}

export const localStorage = new LocalStorage();