import { offlineStorage } from '../offline-storage';
import {
  getAllSessions,
  getDailyGoalSettings,
  createSession,
  setDailyGoalSettings,
} from '../firebase/firestore';
import {
  waitForAuth,
  getSessionsCollection,
  getDailyGoalsCollection,
  getDocs,
  query,
  orderBy,
  Timestamp,
} from '../firebase/core';
import { TrainingSession, DailyGoalSettings } from '@shared/schema';

export interface BackupVerificationResult {
  status: 'healthy' | 'partial' | 'corrupted' | 'missing';
  issues: BackupIssue[];
  localSessionCount: number;
  cloudSessionCount: number;
  lastVerification: Date;
  recommendations: string[];
}

export interface BackupIssue {
  type: 'missing_sessions' | 'data_mismatch' | 'cloud_corruption' | 'sync_drift';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedItems: string[];
  suggestedFix: string;
}

export interface BackupHealth {
  overallHealth: number; // 0-100 score
  dataIntegrity: number;
  completeness: number;
  consistency: number;
  lastBackupAge: number; // hours since last backup
}

export interface RestorePoint {
  id: string;
  timestamp: Date;
  sessionCount: number;
  hasSettings: boolean;
  hasDailyGoals: boolean;
  source: 'cloud_backup' | 'local_backup' | 'export_file';
  description: string;
}

/**
 * Backup verification and restoration system
 */
export class BackupVerificationManager {
  /**
   * Perform comprehensive backup verification
   */
  async verifyBackupIntegrity(): Promise<BackupVerificationResult> {
    const issues: BackupIssue[] = [];
    const recommendations: string[] = [];

    try {
      // Get local data
      const localSessions = await getAllSessions();
      const localDailyGoals = await getDailyGoalSettings();

      // Get cloud data
      const cloudData = await this.fetchCloudBackupData();

      // Compare session counts
      const localCount = localSessions.length;
      const cloudCount = cloudData.sessions.length;

      if (cloudCount === 0 && localCount > 0) {
        issues.push({
          type: 'missing_sessions',
          severity: 'critical',
          description: `No cloud backup found but ${localCount} local sessions exist`,
          affectedItems: ['all_sessions'],
          suggestedFix: 'Run manual backup immediately',
        });
        recommendations.push('Create immediate backup to prevent data loss');
      } else if (Math.abs(localCount - cloudCount) > localCount * 0.1) {
        const diff = localCount - cloudCount;
        issues.push({
          type: 'data_mismatch',
          severity: diff > 0 ? 'medium' : 'high',
          description: `Session count mismatch: ${localCount} local vs ${cloudCount} cloud`,
          affectedItems: [`${Math.abs(diff)}_sessions`],
          suggestedFix: diff > 0 ? 'Run manual backup' : 'Check for data corruption',
        });
      }

      // Compare daily goal settings availability
      const cloudDailyGoals = cloudData.dailyGoals;
      if (localDailyGoals && !cloudDailyGoals) {
        issues.push({
          type: 'data_mismatch',
          severity: 'medium',
          description: 'Local daily goals are missing from the cloud backup',
          affectedItems: ['daily_goals'],
          suggestedFix: 'Run manual backup to sync daily goals',
        });
      } else if (!localDailyGoals && cloudDailyGoals) {
        issues.push({
          type: 'data_mismatch',
          severity: 'low',
          description: 'Cloud backup has daily goals that are missing locally',
          affectedItems: ['daily_goals'],
          suggestedFix: 'Restore from cloud backup to retrieve daily goals',
        });
      }

      // Verify data integrity
      const integrityIssues = await this.verifyDataIntegrity(localSessions, cloudData.sessions);
      issues.push(...integrityIssues);

      // Check backup freshness
      const lastBackup = await offlineStorage.getLastBackupTimestamp();
      const backupAge = lastBackup ? (Date.now() - lastBackup) / (1000 * 60 * 60) : Infinity;

      if (backupAge > 24 * 7) {
        // More than a week
        issues.push({
          type: 'sync_drift',
          severity: backupAge > 24 * 30 ? 'high' : 'medium',
          description: `Backup is ${Math.round(backupAge / 24)} days old`,
          affectedItems: ['backup_timestamp'],
          suggestedFix: 'Run manual backup to update cloud data',
        });
        recommendations.push('Regular backups recommended weekly');
      }

      // Determine overall status
      let status: BackupVerificationResult['status'] = 'healthy';
      const criticalIssues = issues.filter((i) => i.severity === 'critical');
      const highIssues = issues.filter((i) => i.severity === 'high');

      if (criticalIssues.length > 0) {
        status = 'corrupted';
      } else if (highIssues.length > 0 || issues.length > 3) {
        status = 'partial';
      } else if (cloudCount === 0) {
        status = 'missing';
      }

      return {
        status,
        issues,
        localSessionCount: localCount,
        cloudSessionCount: cloudCount,
        lastVerification: new Date(),
        recommendations,
      };
    } catch (error) {
      return {
        status: 'corrupted',
        issues: [
          {
            type: 'cloud_corruption',
            severity: 'critical',
            description: `Backup verification failed: ${error}`,
            affectedItems: ['verification_process'],
            suggestedFix: 'Check internet connection and Firebase permissions',
          },
        ],
        localSessionCount: 0,
        cloudSessionCount: 0,
        lastVerification: new Date(),
        recommendations: ['Check network connection and try again'],
      };
    }
  }

  /**
   * Calculate backup health score
   */
  async calculateBackupHealth(): Promise<BackupHealth> {
    const verification = await this.verifyBackupIntegrity();

    // Data integrity score (0-100)
    const criticalCount = verification.issues.filter((i) => i.severity === 'critical').length;
    const highCount = verification.issues.filter((i) => i.severity === 'high').length;
    const mediumCount = verification.issues.filter((i) => i.severity === 'medium').length;

    const dataIntegrity = Math.max(0, 100 - criticalCount * 40 - highCount * 20 - mediumCount * 10);

    // Completeness score
    const completeness =
      verification.localSessionCount > 0 && verification.cloudSessionCount > 0
        ? Math.min(100, (verification.cloudSessionCount / verification.localSessionCount) * 100)
        : verification.localSessionCount === 0
          ? 100
          : 0;

    // Consistency score
    const countDiff = Math.abs(verification.localSessionCount - verification.cloudSessionCount);
    const consistency =
      verification.localSessionCount > 0
        ? Math.max(0, 100 - (countDiff / verification.localSessionCount) * 100)
        : 100;

    // Backup age
    const lastBackup = await offlineStorage.getLastBackupTimestamp();
    const backupAge = lastBackup ? (Date.now() - lastBackup) / (1000 * 60 * 60) : Infinity;

    // Overall health (weighted average)
    const overallHealth = Math.round(dataIntegrity * 0.4 + completeness * 0.3 + consistency * 0.3);

    return {
      overallHealth,
      dataIntegrity: Math.round(dataIntegrity),
      completeness: Math.round(completeness),
      consistency: Math.round(consistency),
      lastBackupAge: Math.round(backupAge),
    };
  }

  /**
   * Get available restore points
   */
  async getAvailableRestorePoints(): Promise<RestorePoint[]> {
    const restorePoints: RestorePoint[] = [];

    try {
      // Cloud backup restore point
      const cloudData = await this.fetchCloudBackupData();
      if (cloudData.sessions.length > 0) {
        const lastBackup = await offlineStorage.getLastBackupTimestamp();
        restorePoints.push({
          id: 'cloud-latest',
          timestamp: lastBackup ? new Date(lastBackup) : new Date(),
          sessionCount: cloudData.sessions.length,
          hasSettings: !!cloudData.dailyGoals,
          hasDailyGoals: !!cloudData.dailyGoals,
          source: 'cloud_backup',
          description: 'Latest cloud backup',
        });
      }

      // Local backup restore points (from localStorage)
      const localBackups = this.getLocalBackupKeys();
      for (const backupKey of localBackups) {
        try {
          const backupData = localStorage.getItem(backupKey);
          if (backupData) {
            const parsed = JSON.parse(backupData);
            const timestamp = this.extractTimestampFromKey(backupKey);

            restorePoints.push({
              id: backupKey,
              timestamp,
              sessionCount: parsed.trainingSessions?.length || 0,
              hasSettings: !!parsed.settings,
              hasDailyGoals: !!parsed.dailyGoals,
              source: 'local_backup',
              description: `Local backup from ${timestamp.toLocaleDateString()}`,
            });
          }
        } catch (error) {
          console.warn(`Failed to parse local backup ${backupKey}:`, error);
        }
      }

      // Sort by timestamp, newest first
      restorePoints.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return restorePoints;
    } catch (error) {
      console.error('Failed to get restore points:', error);
      return [];
    }
  }

  /**
   * Restore from a specific restore point
   */
  async restoreFromPoint(
    restorePointId: string,
    options: {
      includeTrainingSessions: boolean;
      includeDailyGoals: boolean;
      includeSettings: boolean;
      createBackup: boolean;
    },
    onProgress?: (progress: { phase: string; percent: number }) => void,
  ): Promise<{ success: boolean; restored: any; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Create backup of current state if requested
      if (options.createBackup) {
        onProgress?.({ phase: 'Creating backup of current state', percent: 10 });
        await this.createRestoreBackup();
      }

      // Get restore data
      onProgress?.({ phase: 'Fetching restore data', percent: 20 });
      const restoreData = await this.getRestoreData(restorePointId);

      const restored = {
        sessions: 0,
        dailyGoals: 0,
        settings: 0,
      };

      // Clear current data
      onProgress?.({ phase: 'Clearing current data', percent: 30 });
      await this.clearCurrentData(options);

      // Restore training sessions
      if (options.includeTrainingSessions && restoreData.trainingSessions) {
        onProgress?.({ phase: 'Restoring training sessions', percent: 40 });

        for (let i = 0; i < restoreData.trainingSessions.length; i++) {
          const session = restoreData.trainingSessions[i];
          try {
            await createSession(
              {
                type: session.type,
                date: new Date(session.date),
                duration: session.duration,
                pointsGained: session.pointsGained,
                finalScore: session.finalScore,
                tacticsNotes: session.tacticsNotes,
                gameResult: session.gameResult,
                gameType: session.gameType,
                gameComments: session.gameComments,
                playerColor: session.playerColor,
                platform: session.platform,
                timeControl: session.timeControl,
                opponentUsername: session.opponentUsername,
                needsReview: session.needsReview,
                studyType: session.studyType,
                studyTags: session.studyTags,
                studyNotes: session.studyNotes,
                quantity: session.quantity,
                primaryStudyTag: session.primaryStudyTag,
              },
              session.id,
              { awaitCloudWrite: true },
            );

            restored.sessions++;

            // Update progress
            const progress = 40 + ((i + 1) / restoreData.trainingSessions.length) * 40;
            onProgress?.({
              phase: `Restoring session ${i + 1}/${restoreData.trainingSessions.length}`,
              percent: progress,
            });
          } catch (error) {
            errors.push(`Failed to restore session ${session.id}: ${error}`);
          }
        }
      }

      // Restore daily goals
      if (options.includeDailyGoals && restoreData.dailyGoals) {
        onProgress?.({ phase: 'Restoring daily goals', percent: 85 });
        try {
          await setDailyGoalSettings(restoreData.dailyGoals);
          restored.dailyGoals = 1;
        } catch (error) {
          errors.push(`Failed to restore daily goals: ${error}`);
        }
      }

      // Restore settings
      if (options.includeSettings && restoreData.settings) {
        onProgress?.({ phase: 'Restoring settings', percent: 90 });
        try {
          await offlineStorage.setSettings(restoreData.settings);
          restored.settings = 1;
        } catch (error) {
          errors.push(`Failed to restore settings: ${error}`);
        }
      }

      onProgress?.({ phase: 'Restore complete', percent: 100 });

      return {
        success: errors.length === 0,
        restored,
        errors,
      };
    } catch (error) {
      errors.push(`Restore failed: ${error}`);
      return {
        success: false,
        restored: { sessions: 0, dailyGoals: 0, settings: 0 },
        errors,
      };
    }
  }

  /**
   * Fetch cloud backup data
   */
  private async fetchCloudBackupData(): Promise<{
    sessions: TrainingSession[];
    dailyGoals?: DailyGoalSettings;
  }> {
    await waitForAuth();

    const sessions: TrainingSession[] = [];
    let dailyGoals: DailyGoalSettings | undefined;

    try {
      // Fetch sessions
      const sessionsRef = await getSessionsCollection();
      const sessionQuery = query(sessionsRef, orderBy('date', 'desc'));
      const sessionSnapshot = await getDocs(sessionQuery);

      sessionSnapshot.forEach((doc) => {
        const data = doc.data();
        sessions.push({
          ...data,
          id: parseInt(doc.id),
          date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
        } as TrainingSession);
      });

      // Fetch daily goals
      try {
        const dailyGoalsRef = await getDailyGoalsCollection();
        const dailyGoalsSnapshot = await getDocs(dailyGoalsRef);
        if (!dailyGoalsSnapshot.empty) {
          dailyGoals = dailyGoalsSnapshot.docs[0].data() as DailyGoalSettings;
        }
      } catch (error) {
        console.warn('Failed to fetch daily goals from cloud:', error);
      }
    } catch (error) {
      console.error('Failed to fetch cloud backup data:', error);
      throw error;
    }

    return { sessions, dailyGoals };
  }

  /**
   * Verify data integrity between local and cloud
   */
  private async verifyDataIntegrity(
    localSessions: TrainingSession[],
    cloudSessions: TrainingSession[],
  ): Promise<BackupIssue[]> {
    const issues: BackupIssue[] = [];

    // Create maps for efficient lookup
    const localMap = new Map(localSessions.map((s) => [s.id, s]));
    const cloudMap = new Map(cloudSessions.map((s) => [s.id, s]));

    // Check for sessions that exist locally but not in cloud
    const missingFromCloud = localSessions.filter((s) => !cloudMap.has(s.id));
    if (missingFromCloud.length > 0) {
      issues.push({
        type: 'missing_sessions',
        severity: 'medium',
        description: `${missingFromCloud.length} sessions missing from cloud backup`,
        affectedItems: missingFromCloud.map((s) => `session_${s.id}`),
        suggestedFix: 'Run manual backup to sync missing sessions',
      });
    }

    // Check for sessions that exist in cloud but not locally
    const missingLocally = cloudSessions.filter((s) => !localMap.has(s.id));
    if (missingLocally.length > 0) {
      issues.push({
        type: 'data_mismatch',
        severity: 'low',
        description: `${missingLocally.length} cloud sessions are missing locally`,
        affectedItems: missingLocally.map((s) => `session_${s.id}`),
        suggestedFix: 'Restore from backup to recover missing sessions locally',
      });
    }

    // Check for data inconsistencies in existing sessions
    const inconsistentSessions = [];
    for (const localSession of localSessions) {
      const cloudSession = cloudMap.get(localSession.id);
      if (cloudSession && this.hasSignificantDifferences(localSession, cloudSession)) {
        inconsistentSessions.push(localSession.id);
      }
    }

    if (inconsistentSessions.length > 0) {
      issues.push({
        type: 'data_mismatch',
        severity: 'low',
        description: `${inconsistentSessions.length} sessions have data inconsistencies`,
        affectedItems: inconsistentSessions.map((id) => `session_${id}`),
        suggestedFix: 'Manual backup will resolve data inconsistencies',
      });
    }

    return issues;
  }

  /**
   * Check if two sessions have significant differences
   */
  private hasSignificantDifferences(local: TrainingSession, cloud: TrainingSession): boolean {
    const significantFields = ['type', 'duration', 'pointsGained', 'finalScore', 'gameResult'];

    return significantFields.some((field) => {
      const localValue = local[field as keyof TrainingSession];
      const cloudValue = cloud[field as keyof TrainingSession];
      return localValue !== cloudValue;
    });
  }

  /**
   * Get local backup keys from localStorage
   */
  private getLocalBackupKeys(): string[] {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('pre-import-backup-') || key.startsWith('restore-backup-'))) {
        keys.push(key);
      }
    }
    return keys;
  }

  /**
   * Extract timestamp from backup key
   */
  private extractTimestampFromKey(key: string): Date {
    const timestampMatch = key.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
    if (timestampMatch) {
      return new Date(
        timestampMatch[1].replace(/-/g, ':').replace(/T(\d{2}):(\d{2}):(\d{2})/, 'T$1:$2:$3'),
      );
    }
    return new Date(); // Fallback to current date
  }

  /**
   * Get restore data by ID
   */
  private async getRestoreData(restorePointId: string): Promise<any> {
    if (restorePointId === 'cloud-latest') {
      return await this.fetchCloudBackupData();
    } else {
      const backupData = localStorage.getItem(restorePointId);
      if (!backupData) {
        throw new Error(`Restore point ${restorePointId} not found`);
      }
      return JSON.parse(backupData);
    }
  }

  /**
   * Create backup before restore operation
   */
  private async createRestoreBackup(): Promise<string> {
    const { exportManager } = await import('../export/export-manager');

    const backupResult = await exportManager.exportData({
      includeTrainingSessions: true,
      includeDailyGoals: true,
      includeSettings: true,
      includeMetadata: true,
      format: 'backup',
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `restore-backup-${timestamp}`;

    localStorage.setItem(backupKey, backupResult.data as string);

    return backupKey;
  }

  /**
   * Clear current data based on options (FIXED: granular clearing)
   */
  private async clearCurrentData(options: {
    includeTrainingSessions: boolean;
    includeDailyGoals: boolean;
    includeSettings: boolean;
  }): Promise<void> {
    // Clear ONLY the data the user chose to restore
    if (options.includeTrainingSessions) {
      await offlineStorage.clearSessions(); // Clear ONLY sessions, not everything
    }

    if (options.includeDailyGoals) {
      await offlineStorage.clearDailyGoalSettings();
    }

    if (options.includeSettings) {
      await offlineStorage.clearSettings(); // Clear ONLY settings
    }

    // Also clear statistics cache when sessions are cleared
    if (options.includeTrainingSessions) {
      await offlineStorage.clearStatistics();
    }
  }
}

// Export singleton instance
export const backupVerificationManager = new BackupVerificationManager();
