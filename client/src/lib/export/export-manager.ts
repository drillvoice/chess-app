import { offlineStorage } from '../offline-storage';
import { getAllSessions, getDailyGoalSettings } from '../firebase/firestore';
import { TrainingSession, DailyGoalSettings, dailyGoalSettingsSchema } from '@shared/schema';

export interface ExportOptions {
  includeTrainingSessions: boolean;
  includeDailyGoals: boolean;
  includeSettings: boolean;
  includeMetadata: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  sessionTypes?: string[];
  format: 'json' | 'csv' | 'backup';
  compressed?: boolean;
}

export interface ExportData {
  trainingSessions?: TrainingSession[];
  dailyGoals?: DailyGoalSettings;
  settings?: any;
  statistics?: any;
  metadata: {
    exportedAt: string;
    version: string;
    sessionCount: number;
    exportOptions: Partial<ExportOptions>;
  };
}

export interface ExportResult {
  data: string | Blob;
  filename: string;
  metadata: ExportData['metadata'];
}

/**
 * Comprehensive data export manager
 * Supports multiple formats and flexible data selection
 */
export class ExportManager {
  /**
   * Export all selected data based on options
   */
  async exportData(options: ExportOptions): Promise<ExportResult> {
    const exportData: ExportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        version: '2.0.0',
        sessionCount: 0,
        exportOptions: options,
      },
    };

    // Export training sessions
    if (options.includeTrainingSessions) {
      let sessions = await getAllSessions();

      // Apply date range filter
      if (options.dateRange) {
        sessions = sessions.filter(
          (session) =>
            session.date >= options.dateRange!.start && session.date <= options.dateRange!.end,
        );
      }

      // Apply session type filter
      if (options.sessionTypes && options.sessionTypes.length > 0) {
        sessions = sessions.filter((session) => options.sessionTypes!.includes(session.type));
      }

      exportData.trainingSessions = sessions;
      exportData.metadata.sessionCount = sessions.length;
    }

    // Export daily goals
    if (options.includeDailyGoals) {
      try {
        const dailyGoals = await getDailyGoalSettings();
        if (dailyGoals) {
          exportData.dailyGoals = dailyGoals;
        }
      } catch (error) {
        console.warn('Failed to export daily goals:', error);
      }
    }

    // Export settings and preferences
    if (options.includeSettings) {
      try {
        const settings = await offlineStorage.getSettings();
        if (settings) {
          exportData.settings = settings;
        }
      } catch (error) {
        console.warn('Failed to export settings:', error);
      }
    }

    // Export metadata
    if (options.includeMetadata) {
      try {
        const lastBackup = await offlineStorage.getLastBackupTimestamp();
        const lastSync = await offlineStorage.getLastSyncedTimestamp();
        const cacheAge = await offlineStorage.getCacheAge('sessions');

        exportData.metadata = {
          ...exportData.metadata,
          lastBackupTimestamp: lastBackup || undefined,
          lastSyncTimestamp: lastSync || undefined,
          cacheAge: cacheAge,
        } as any;
      } catch (error) {
        console.warn('Failed to export metadata:', error);
      }
    }

    // Export statistics (cached calculated stats)
    if (options.includeMetadata) {
      try {
        const statistics = await offlineStorage.getStatistics();
        if (statistics) {
          exportData.statistics = statistics;
        }
      } catch (error) {
        console.warn('Failed to export statistics:', error);
      }
    }

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const sessionInfo = exportData.trainingSessions
      ? `-${exportData.trainingSessions.length}sessions`
      : '';
    const filename = `chess-training${sessionInfo}-${timestamp}.${options.format}`;

    // Format data according to requested format
    switch (options.format) {
      case 'json':
        return {
          data: JSON.stringify(exportData, null, 2),
          filename,
          metadata: exportData.metadata,
        };

      case 'csv':
        return {
          data: this.convertToCSV(exportData),
          filename: filename.replace('.csv', '-sessions.csv'),
          metadata: exportData.metadata,
        };

      case 'backup':
        const backupData = await this.createBackupFormat(exportData);
        return {
          data: options.compressed ? await this.compressData(backupData) : backupData,
          filename: filename.replace('.backup', options.compressed ? '.backup.gz' : '.backup.json'),
          metadata: exportData.metadata,
        };

      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  /**
   * Convert training sessions to CSV format
   */
  private convertToCSV(exportData: ExportData): string {
    const sessions = exportData.trainingSessions || [];
    if (sessions.length === 0) {
      return 'No training sessions to export';
    }

    // CSV headers
    const headers = [
      'ID',
      'Type',
      'Date',
      'Duration (min)',
      'Points Gained',
      'Final Score',
      'Game Result',
      'Game Type',
      'Player Color',
      'Platform',
      'Time Control',
      'Opponent',
      'Needs Review',
      'Study Type',
      'Study Tags',
      'Study Quantity',
      'Primary Study Tag',
      'Notes',
    ];

    // Convert sessions to CSV rows
    const rows = sessions.map((session) => [
      session.id,
      session.type,
      session.date.toISOString(),
      session.duration || '',
      session.pointsGained || '',
      session.finalScore || '',
      session.gameResult || '',
      session.gameType || '',
      session.playerColor || '',
      session.platform || '',
      session.timeControl || '',
      session.opponentUsername || '',
      session.needsReview || false,
      session.studyType || '',
      session.studyTags || '',
      session.quantity || '',
      session.primaryStudyTag || '',
      (session.tacticsNotes || session.gameComments || session.studyNotes || '').replace(
        /"/g,
        '""',
      ),
    ]);

    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map((row) => row.map((field) => `"${field}"`).join(','))
      .join('\n');

    return csvContent;
  }

  /**
   * Create optimized backup format with validation checksums
   */
  private async createBackupFormat(exportData: ExportData): Promise<string> {
    const backupFormat = {
      ...exportData,
      backup: {
        format: 'chess-training-backup-v2',
        createdAt: new Date().toISOString(),
        checksum: '',
        validation: {
          sessionCount: exportData.trainingSessions?.length || 0,
          hasSettings: !!exportData.settings,
          hasDailyGoals: !!exportData.dailyGoals,
          hasStatistics: !!exportData.statistics,
        },
      },
    };

    // Calculate checksum for validation
    const dataString = JSON.stringify({
      trainingSessions: exportData.trainingSessions,
      dailyGoals: exportData.dailyGoals,
      settings: exportData.settings,
      statistics: exportData.statistics,
    });

    backupFormat.backup.checksum = await this.calculateChecksum(dataString);

    return JSON.stringify(backupFormat, null, 2);
  }

  /**
   * Simple checksum calculation for data validation
   */
  private async calculateChecksum(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Compress data using gzip (browser-compatible)
   */
  private async compressData(data: string): Promise<Blob> {
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    const encoder = new TextEncoder();
    writer.write(encoder.encode(data));
    writer.close();

    const chunks: Uint8Array[] = [];
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        chunks.push(value);
      }
    }

    return new Blob(chunks, { type: 'application/gzip' });
  }

  /**
   * Validate export data integrity
   */
  async validateExportData(exportData: ExportData): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate training sessions
    if (exportData.trainingSessions) {
      for (const session of exportData.trainingSessions) {
        if (!session.id || !session.type || !session.date) {
          errors.push(`Invalid session: missing required fields (id: ${session.id})`);
        }

        if (session.date && isNaN(new Date(session.date).getTime())) {
          errors.push(`Invalid session date: ${session.date} (id: ${session.id})`);
        }
      }
    }

    // Validate daily goals against the shared schema (covers built-in targets
    // and custom tagGoals, and stays in sync as the schema evolves).
    if (exportData.dailyGoals) {
      const parsed = dailyGoalSettingsSchema.safeParse(exportData.dailyGoals);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        errors.push(
          `Invalid daily goals: ${issue ? `${issue.path.join('.') || 'value'} ${issue.message}` : 'failed validation'}`,
        );
      }
    }

    // Validate metadata
    if (!exportData.metadata.exportedAt || !exportData.metadata.version) {
      errors.push('Invalid metadata: missing required fields');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const exportManager = new ExportManager();
