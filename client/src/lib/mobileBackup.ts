/**
 * Mobile-compatible backup system for chess training data
 * Uses Web Share API and automatic downloads as fallback
 */

import type { TrainingSession } from "@shared/schema";

interface MobileBackupOptions {
  onError?: (error: Error) => void;
  onSuccess?: (message: string) => void;
}

export class MobileBackup {
  private onError?: (error: Error) => void;
  private onSuccess?: (message: string) => void;

  constructor(options: MobileBackupOptions = {}) {
    this.onError = options.onError;
    this.onSuccess = options.onSuccess;
  }

  /**
   * Checks if Web Share API is supported (available on mobile browsers)
   */
  isWebShareSupported(): boolean {
    return 'share' in navigator && 'canShare' in navigator;
  }

  /**
   * Creates a backup file and either shares it or downloads it
   */
  async createBackup(sessions: TrainingSession[]): Promise<void> {
    try {
      const data = JSON.stringify(sessions, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const filename = `chess-training-${new Date().toISOString().split('T')[0]}.json`;

      // Try Web Share API first (works on mobile)
      if (this.isWebShareSupported()) {
        const file = new File([blob], filename, { type: 'application/json' });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Chess Training Backup',
            text: 'Your chess training data backup'
          });
          
          this.onSuccess?.('Backup shared successfully! You can save it to your device.');
          return;
        }
      }

      // Fallback to download
      this.downloadFile(blob, filename);
      this.onSuccess?.('Backup downloaded successfully!');
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Downloads a file (fallback for when Web Share API is not available)
   */
  private downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Creates automatic periodic backups (for mobile compatibility)
   */
  async schedulePeriodicBackup(sessions: TrainingSession[]): Promise<void> {
    // On mobile, we can't automatically save files, but we can prepare them
    // This creates a backup that can be triggered manually
    const data = JSON.stringify(sessions, null, 2);
    const filename = `chess-training-backup-${Date.now()}.json`;
    
    // Store in localStorage as a backup reference
    localStorage.setItem('chess-training-last-backup', JSON.stringify({
      timestamp: Date.now(),
      data: data,
      filename: filename
    }));
  }

  /**
   * Retrieves the last backup from localStorage
   */
  getLastBackup(): { timestamp: number; data: string; filename: string } | null {
    try {
      const backup = localStorage.getItem('chess-training-last-backup');
      return backup ? JSON.parse(backup) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Checks if a backup is needed (older than 1 day)
   */
  isBackupNeeded(): boolean {
    const lastBackup = this.getLastBackup();
    if (!lastBackup) return true;
    
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    return lastBackup.timestamp < oneDayAgo;
  }

  /**
   * Creates a quick backup link that can be shared or saved
   */
  createBackupLink(sessions: TrainingSession[]): string {
    const data = JSON.stringify(sessions, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    return window.URL.createObjectURL(blob);
  }

  /**
   * Handles errors consistently
   */
  private handleError(error: Error): void {
    console.error('Mobile backup error:', error);
    this.onError?.(error);
  }
}

/**
 * Creates a mobile-friendly backup instance
 */
export function createMobileBackup(callbacks?: MobileBackupOptions): MobileBackup {
  return new MobileBackup(callbacks);
}