import { TrainingSession, InsertTrainingSession } from "@shared/schema";

/**
 * File System Access API integration for automatic JSON backup and sync
 * Provides bulletproof data persistence by saving to user-selected folder
 */

interface FileSystemSyncOptions {
  fileName: string;
  onError?: (error: Error) => void;
  onSuccess?: (message: string) => void;
}

/**
 * Manages automatic synchronization of training data to local file system
 * Uses the File System Access API for persistent storage outside browser control
 */
export class FileSystemSync {
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private fileName: string;
  private isSupported: boolean;
  private onError?: (error: Error) => void;
  private onSuccess?: (message: string) => void;

  constructor(options: FileSystemSyncOptions) {
    this.fileName = options.fileName;
    this.onError = options.onError;
    this.onSuccess = options.onSuccess;
    this.isSupported = 'showDirectoryPicker' in window;
  }

  /**
   * Checks if the File System Access API is supported in current browser
   * @returns {boolean} True if API is available
   */
  public isFileSystemAccessSupported(): boolean {
    return this.isSupported;
  }

  /**
   * Prompts user to select a directory for automatic backups
   * This only needs to be done once - permission is remembered
   * @returns {Promise<boolean>} True if directory was successfully selected
   */
  public async requestDirectoryAccess(): Promise<boolean> {
    if (!this.isSupported) {
      this.handleError(new Error('File System Access API not supported'));
      return false;
    }

    try {
      // Request directory picker with clear description
      this.directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });

      // Store the directory handle for future use
      if (this.directoryHandle) {
        await this.storeDirectoryHandle();
        this.onSuccess?.('Directory access granted. Automatic backups enabled.');
        return true;
      }
      
      return false;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled - not an error
        return false;
      }
      this.handleError(error as Error);
      return false;
    }
  }

  /**
   * Stores the directory handle in IndexedDB for persistence across sessions
   * @private
   */
  private async storeDirectoryHandle(): Promise<void> {
    if (!this.directoryHandle) return;

    try {
      const db = await this.openConfigDB();
      const transaction = db.transaction(['config'], 'readwrite');
      const store = transaction.objectStore('config');
      
      await store.put(this.directoryHandle, 'directoryHandle');
      db.close();
    } catch (error) {
      console.warn('Failed to store directory handle:', error);
    }
  }

  /**
   * Retrieves the stored directory handle from IndexedDB
   * @private
   */
  private async getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    try {
      const db = await this.openConfigDB();
      const transaction = db.transaction(['config'], 'readonly');
      const store = transaction.objectStore('config');
      
      const result = await store.get('directoryHandle');
      db.close();
      
      return result || null;
    } catch (error) {
      console.warn('Failed to retrieve directory handle:', error);
      return null;
    }
  }

  /**
   * Opens or creates the configuration database for storing directory handles
   * @private
   */
  private async openConfigDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ChessTrainingConfig', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config');
        }
      };
    });
  }

  /**
   * Initializes the file system sync by loading stored directory handle
   * @returns {Promise<boolean>} True if initialization was successful
   */
  public async initialize(): Promise<boolean> {
    if (!this.isSupported) return false;

    try {
      this.directoryHandle = await this.getStoredDirectoryHandle();
      
      if (this.directoryHandle) {
        // Verify we still have permission
        const permission = await this.directoryHandle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          return true;
        } else if (permission === 'prompt') {
          // Try to request permission again
          const newPermission = await this.directoryHandle.requestPermission({ mode: 'readwrite' });
          return newPermission === 'granted';
        }
      }
      
      return false;
    } catch (error) {
      this.handleError(error as Error);
      return false;
    }
  }

  /**
   * Automatically saves training sessions to JSON file in selected directory
   * @param {TrainingSession[]} sessions - Array of training sessions to save
   * @returns {Promise<boolean>} True if save was successful
   */
  public async autoSaveData(sessions: TrainingSession[]): Promise<boolean> {
    if (!this.directoryHandle || !this.isSupported) {
      return false;
    }

    try {
      // Create or get the backup file
      const fileHandle = await this.directoryHandle.getFileHandle(this.fileName, {
        create: true
      });

      // Prepare data for export
      const exportData = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        sessions: sessions
      };

      // Write to file
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(exportData, null, 2));
      await writable.close();

      return true;
    } catch (error) {
      this.handleError(error as Error);
      return false;
    }
  }

  /**
   * Automatically loads training sessions from JSON file in selected directory
   * @returns {Promise<TrainingSession[]>} Array of loaded training sessions
   */
  public async autoLoadData(): Promise<TrainingSession[]> {
    if (!this.directoryHandle || !this.isSupported) {
      return [];
    }

    try {
      // Try to get the backup file
      const fileHandle = await this.directoryHandle.getFileHandle(this.fileName);
      const file = await fileHandle.getFile();
      const content = await file.text();

      const data = JSON.parse(content);
      
      // Validate data structure
      if (data.sessions && Array.isArray(data.sessions)) {
        return data.sessions;
      }
      
      return [];
    } catch (error) {
      // File doesn't exist or other error - not necessarily a problem
      if (error instanceof Error && error.name !== 'NotFoundError') {
        this.handleError(error);
      }
      return [];
    }
  }

  /**
   * Checks if automatic sync is currently enabled and functional
   * @returns {boolean} True if auto-sync is active
   */
  public isAutoSyncEnabled(): boolean {
    return this.directoryHandle !== null && this.isSupported;
  }

  /**
   * Disables automatic sync by clearing the stored directory handle
   */
  public async disableAutoSync(): Promise<void> {
    this.directoryHandle = null;
    
    try {
      const db = await this.openConfigDB();
      const transaction = db.transaction(['config'], 'readwrite');
      const store = transaction.objectStore('config');
      
      await store.delete('directoryHandle');
      db.close();
    } catch (error) {
      console.warn('Failed to clear directory handle:', error);
    }
  }

  /**
   * Handles errors consistently across the class
   * @private
   */
  private handleError(error: Error): void {
    console.error('FileSystemSync error:', error);
    this.onError?.(error);
  }
}

/**
 * Creates a configured FileSystemSync instance for chess training data
 * @param {object} callbacks - Optional success/error callback functions
 * @returns {FileSystemSync} Configured sync instance
 */
export function createChessDataSync(callbacks?: {
  onError?: (error: Error) => void;
  onSuccess?: (message: string) => void;
}): FileSystemSync {
  return new FileSystemSync({
    fileName: 'chess-training-backup.json',
    onError: callbacks?.onError,
    onSuccess: callbacks?.onSuccess
  });
}