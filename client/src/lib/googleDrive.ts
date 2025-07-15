/**
 * Google Drive integration for automatic chess training data backup and sync
 * Provides seamless cloud storage with Drive as the master data source
 */

import { TrainingSession } from '@shared/schema';

interface GoogleDriveConfig {
  clientId: string;
  apiKey: string;
  discoveryDoc: string;
  scopes: string[];
}

interface DriveFile {
  id: string;
  name: string;
  parents?: string[];
  modifiedTime: string;
}

export class GoogleDriveSync {
  private gapi: any;
  private isInitialized = false;
  private isSignedIn = false;
  private backupFolderId: string | null = null;
  private dataFileId: string | null = null;
  private onError?: (error: Error) => void;
  private onSuccess?: (message: string) => void;

  private config: GoogleDriveConfig = {
    clientId: '',
    apiKey: '',
    discoveryDoc: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
    scopes: ['https://www.googleapis.com/auth/drive.file']
  };

  constructor(options: {
    onError?: (error: Error) => void;
    onSuccess?: (message: string) => void;
  } = {}) {
    this.onError = options.onError;
    this.onSuccess = options.onSuccess;
    this.restoreState();
  }

  /**
   * Initialize Google Drive API and authenticate user
   */
  async initialize(): Promise<boolean> {
    try {
      if (this.isInitialized) return this.isSignedIn;

      // Check if API keys are available
      if (!this.config.clientId || !this.config.apiKey) {
        throw new Error('Google Drive API credentials not configured');
      }

      // Load Google API library
      await this.loadGoogleAPI();
      
      // Initialize the API client
      await this.gapi.load('client:auth2', async () => {
        await this.gapi.client.init({
          apiKey: this.config.apiKey,
          clientId: this.config.clientId,
          discoveryDocs: [this.config.discoveryDoc],
          scope: this.config.scopes.join(' ')
        });

        this.isInitialized = true;
        this.isSignedIn = this.gapi.auth2.getAuthInstance().isSignedIn.get();
        
        // Listen for sign-in state changes
        this.gapi.auth2.getAuthInstance().isSignedIn.listen((isSignedIn: boolean) => {
          this.isSignedIn = isSignedIn;
        });
      });

      return this.isSignedIn;
    } catch (error) {
      this.handleError(error as Error);
      return false;
    }
  }

  /**
   * Sign in to Google Drive
   */
  async signIn(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.isSignedIn) {
        await this.gapi.auth2.getAuthInstance().signIn();
      }

      return this.isSignedIn;
    } catch (error) {
      this.handleError(error as Error);
      return false;
    }
  }

  /**
   * Sign out from Google Drive
   */
  async signOut(): Promise<void> {
    try {
      if (this.isInitialized && this.isSignedIn) {
        await this.gapi.auth2.getAuthInstance().signOut();
        this.backupFolderId = null;
        this.dataFileId = null;
        localStorage.removeItem('googleDrive_folderId');
        localStorage.removeItem('googleDrive_fileId');
      }
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Select a folder in Google Drive for backup storage
   */
  async selectBackupFolder(): Promise<boolean> {
    try {
      if (!this.isSignedIn) {
        const signedIn = await this.signIn();
        if (!signedIn) return false;
      }

      // For now, create a dedicated folder for chess training data
      // In a full implementation, you'd show a folder picker
      const folderName = 'Chess Training Backup';
      const folderId = await this.createOrFindFolder(folderName);
      
      if (folderId) {
        this.backupFolderId = folderId;
        localStorage.setItem('googleDrive_folderId', folderId);
        this.onSuccess?.('Google Drive folder selected successfully');
        return true;
      }

      return false;
    } catch (error) {
      this.handleError(error as Error);
      return false;
    }
  }

  /**
   * Upload training sessions to Google Drive
   */
  async uploadData(sessions: TrainingSession[]): Promise<boolean> {
    try {
      if (!this.isSignedIn || !this.backupFolderId) {
        return false;
      }

      const data = JSON.stringify(sessions, null, 2);
      const fileName = 'chess-training-data.json';
      const metadata = {
        name: fileName,
        parents: [this.backupFolderId]
      };

      let response;
      
      if (this.dataFileId) {
        // Update existing file
        response = await this.gapi.client.request({
          path: `https://www.googleapis.com/upload/drive/v3/files/${this.dataFileId}`,
          method: 'PATCH',
          params: {
            uploadType: 'media'
          },
          body: data
        });
      } else {
        // Create new file
        response = await this.gapi.client.request({
          path: 'https://www.googleapis.com/upload/drive/v3/files',
          method: 'POST',
          params: {
            uploadType: 'multipart'
          },
          body: this.createMultipartBody(metadata, data)
        });
        
        this.dataFileId = response.result.id;
        localStorage.setItem('googleDrive_fileId', this.dataFileId);
      }

      if (response.status === 200) {
        this.onSuccess?.('Data synced to Google Drive');
        return true;
      }

      return false;
    } catch (error) {
      this.handleError(error as Error);
      return false;
    }
  }

  /**
   * Download training sessions from Google Drive
   */
  async downloadData(): Promise<TrainingSession[]> {
    try {
      if (!this.isSignedIn || !this.dataFileId) {
        return [];
      }

      const response = await this.gapi.client.drive.files.get({
        fileId: this.dataFileId,
        alt: 'media'
      });

      if (response.status === 200) {
        const sessions = JSON.parse(response.body) as TrainingSession[];
        this.onSuccess?.('Data loaded from Google Drive');
        return sessions;
      }

      return [];
    } catch (error) {
      this.handleError(error as Error);
      return [];
    }
  }

  /**
   * Check if Google Drive sync is enabled and working
   */
  isEnabled(): boolean {
    return this.isSignedIn && !!this.backupFolderId;
  }

  /**
   * Get sync status information
   */
  getSyncStatus(): {
    isSignedIn: boolean;
    hasFolder: boolean;
    hasFile: boolean;
    isEnabled: boolean;
  } {
    return {
      isSignedIn: this.isSignedIn,
      hasFolder: !!this.backupFolderId,
      hasFile: !!this.dataFileId,
      isEnabled: this.isEnabled()
    };
  }

  /**
   * Configure API credentials
   */
  configure(clientId: string, apiKey: string): void {
    this.config.clientId = clientId;
    this.config.apiKey = apiKey;
  }

  // Private helper methods

  private async loadGoogleAPI(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.gapi) {
        this.gapi = window.gapi;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        this.gapi = window.gapi;
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Google API'));
      document.head.appendChild(script);
    });
  }

  private async createOrFindFolder(name: string): Promise<string | null> {
    try {
      // First, try to find existing folder
      const searchResponse = await this.gapi.client.drive.files.list({
        q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        spaces: 'drive'
      });

      if (searchResponse.result.files && searchResponse.result.files.length > 0) {
        return searchResponse.result.files[0].id;
      }

      // Create new folder
      const createResponse = await this.gapi.client.drive.files.create({
        resource: {
          name: name,
          mimeType: 'application/vnd.google-apps.folder'
        }
      });

      return createResponse.result.id;
    } catch (error) {
      this.handleError(error as Error);
      return null;
    }
  }

  private createMultipartBody(metadata: any, data: string): string {
    const delimiter = '-------314159265358979323846';
    const close_delim = `\r\n--${delimiter}--`;
    
    let body = `--${delimiter}\r\n`;
    body += 'Content-Type: application/json\r\n\r\n';
    body += JSON.stringify(metadata) + '\r\n';
    body += `--${delimiter}\r\n`;
    body += 'Content-Type: application/json\r\n\r\n';
    body += data;
    body += close_delim;
    
    return body;
  }

  private handleError(error: Error): void {
    console.error('Google Drive sync error:', error);
    this.onError?.(error);
  }

  private restoreState(): void {
    try {
      // Restore configuration from localStorage
      const savedConfig = localStorage.getItem('googleDriveConfig');
      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        this.config.clientId = config.clientId || '';
        this.config.apiKey = config.apiKey || '';
      }

      // Restore state from localStorage
      const folderId = localStorage.getItem('googleDrive_folderId');
      const fileId = localStorage.getItem('googleDrive_fileId');
      
      if (folderId) this.backupFolderId = folderId;
      if (fileId) this.dataFileId = fileId;
    } catch (error) {
      console.error('Failed to restore Google Drive state:', error);
      // Reset to defaults if restore fails
      this.config.clientId = '';
      this.config.apiKey = '';
      this.backupFolderId = null;
      this.dataFileId = null;
      this.isSignedIn = false;
    }
  }
}

/**
 * Create a configured Google Drive sync instance
 */
export function createGoogleDriveSync(callbacks?: {
  onError?: (error: Error) => void;
  onSuccess?: (message: string) => void;
}): GoogleDriveSync {
  return new GoogleDriveSync(callbacks);
}

// Global types for Google API
declare global {
  interface Window {
    gapi: any;
  }
}