import { offlineStorage } from '../offline-storage';
import { createSession, setDailyGoalSettings } from '../firebase/firestore';
import { TrainingSession } from '@shared/schema';
import { ExportData } from '../export/export-manager';

export interface ImportOptions {
  conflictResolution: 'skip' | 'overwrite' | 'merge' | 'ask';
  validateSchema: boolean;
  createBackup: boolean;
  dryRun: boolean;
}

export interface ImportPreview {
  totalSessions: number;
  newSessions: number;
  duplicateSessions: number;
  invalidSessions: number;
  hasSettings: boolean;
  hasDailyGoals: boolean;
  conflicts: ImportConflict[];
  validation: ValidationResult;
}

export interface ImportConflict {
  type: 'duplicate_session' | 'newer_exists' | 'different_data';
  existingId: number;
  importingData: any;
  existingData: any;
  recommendedAction: 'skip' | 'overwrite' | 'merge';
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  dataFormat: 'json' | 'backup' | 'legacy' | 'unknown';
}

export interface ImportResult {
  success: boolean;
  imported: {
    sessions: number;
    settings: number;
    dailyGoals: number;
  };
  skipped: number;
  errors: string[];
  backupCreated?: string;
}

export interface ImportProgress {
  phase: 'validating' | 'backing_up' | 'importing_sessions' | 'importing_settings' | 'complete';
  processed: number;
  total: number;
  currentItem?: string;
}

/**
 * Advanced import manager with validation and conflict resolution
 */
export class ImportManager {
  /**
   * Preview import data without making changes
   */
  async previewImport(data: string): Promise<ImportPreview> {
    const validation = await this.validateImportData(data);
    const parsedData = this.parseImportData(data, validation.dataFormat);

    const existingSessions = await offlineStorage.getSessions();
    const existingIds = new Set(existingSessions.map((s) => s.id));
    const existingByDate = new Map(
      existingSessions.map((s) => [`${s.type}-${s.date.getTime()}`, s]),
    );

    let newSessions = 0;
    let duplicateSessions = 0;
    let invalidSessions = 0;
    const conflicts: ImportConflict[] = [];

    if (parsedData.trainingSessions) {
      for (const session of parsedData.trainingSessions) {
        const normalizedDate = this.normalizeDateValue(session.date);

        // Check for validation errors
        if (!this.isValidSession(session, normalizedDate)) {
          invalidSessions++;
          continue;
        }

        // Check for ID conflicts
        if (existingIds.has(session.id)) {
          duplicateSessions++;
          const existing = existingSessions.find((s) => s.id === session.id)!;
          conflicts.push({
            type: 'duplicate_session',
            existingId: session.id,
            importingData: session,
            existingData: existing,
            recommendedAction: this.recommendConflictResolution(session, existing),
          });
          continue;
        }

        // Check for date-based conflicts (same type and date)
        const dateKey = `${session.type}-${normalizedDate!.getTime()}`;
        if (existingByDate.has(dateKey)) {
          const existing = existingByDate.get(dateKey)!;
          conflicts.push({
            type: 'different_data',
            existingId: existing.id,
            importingData: session,
            existingData: existing,
            recommendedAction: this.recommendConflictResolution(session, existing),
          });
          continue;
        }

        newSessions++;
      }
    }

    return {
      totalSessions: parsedData.trainingSessions?.length || 0,
      newSessions,
      duplicateSessions,
      invalidSessions,
      hasSettings: !!parsedData.settings,
      hasDailyGoals: !!parsedData.dailyGoals,
      conflicts,
      validation,
    };
  }

  /**
   * Import data with full validation and conflict resolution
   */
  async importData(
    data: string,
    options: ImportOptions,
    onProgress?: (progress: ImportProgress) => void,
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      imported: { sessions: 0, settings: 0, dailyGoals: 0 },
      skipped: 0,
      errors: [],
    };

    try {
      // Phase 1: Validation
      onProgress?.({ phase: 'validating', processed: 0, total: 100 });

      const validation = await this.validateImportData(data);
      if (!validation.valid && options.validateSchema) {
        result.errors = validation.errors;
        return result;
      }

      const parsedData = this.parseImportData(data, validation.dataFormat);

      // Phase 2: Create backup if requested
      if (options.createBackup && !options.dryRun) {
        onProgress?.({ phase: 'backing_up', processed: 10, total: 100 });
        result.backupCreated = await this.createPreImportBackup();
      }

      // Phase 3: Import training sessions
      if (parsedData.trainingSessions) {
        onProgress?.({ phase: 'importing_sessions', processed: 20, total: 100 });

        const sessionResult = await this.importTrainingSessions(
          parsedData.trainingSessions,
          options,
          (processed, total) => {
            const progress = 20 + (processed / total) * 60;
            onProgress?.({
              phase: 'importing_sessions',
              processed: progress,
              total: 100,
              currentItem: `Session ${processed}/${total}`,
            });
          },
        );

        result.imported.sessions = sessionResult.imported;
        result.skipped += sessionResult.skipped;
        result.errors.push(...sessionResult.errors);
      }

      // Phase 4: Import settings and daily goals
      onProgress?.({ phase: 'importing_settings', processed: 85, total: 100 });

      if (parsedData.dailyGoals && !options.dryRun) {
        try {
          await setDailyGoalSettings(parsedData.dailyGoals);
          result.imported.dailyGoals = 1;
        } catch (error) {
          result.errors.push(`Failed to import daily goals: ${error}`);
        }
      }

      if (parsedData.settings && !options.dryRun) {
        try {
          await offlineStorage.setSettings(parsedData.settings);
          result.imported.settings = 1;
        } catch (error) {
          result.errors.push(`Failed to import settings: ${error}`);
        }
      }

      onProgress?.({ phase: 'complete', processed: 100, total: 100 });
      result.success = result.errors.length === 0;

      return result;
    } catch (error) {
      result.errors.push(`Import failed: ${error}`);
      return result;
    }
  }

  /**
   * Validate import data structure and content
   */
  async validateImportData(data: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let dataFormat: ValidationResult['dataFormat'] = 'unknown';
    let parsedData: any;

    try {
      parsedData = JSON.parse(data);
    } catch (_error) {
      return {
        valid: false,
        errors: ['Invalid JSON format'],
        warnings: [],
        dataFormat: 'unknown',
      };
    }

    // Detect data format
    if (parsedData.backup?.format === 'chess-training-backup-v2') {
      dataFormat = 'backup';
    } else if (Array.isArray(parsedData)) {
      dataFormat = 'legacy';
    } else if (parsedData.trainingSessions || parsedData.metadata) {
      dataFormat = 'json';
    }

    // Validate backup format
    if (dataFormat === 'backup') {
      if (!(await this.validateBackupChecksum(parsedData))) {
        errors.push('Backup data integrity check failed');
      }
    }

    // Validate training sessions
    const sessions = dataFormat === 'legacy' ? parsedData : parsedData.trainingSessions;
    if (sessions && Array.isArray(sessions)) {
      let validSessions = 0;
      for (const session of sessions) {
        const normalizedDate = this.normalizeDateValue(session?.date);
        if (this.isValidSession(session, normalizedDate)) {
          validSessions++;
        } else {
          warnings.push(`Invalid session data: ${session.id || 'unknown ID'}`);
        }
      }

      if (validSessions === 0 && sessions.length > 0) {
        errors.push('No valid training sessions found');
      }
    }

    // Validate daily goals
    if (parsedData.dailyGoals) {
      if (!this.isValidDailyGoals(parsedData.dailyGoals)) {
        warnings.push('Invalid daily goals format');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      dataFormat,
    };
  }

  /**
   * Parse import data based on detected format
   */
  private parseImportData(data: string, format: ValidationResult['dataFormat']): ExportData {
    const parsed = JSON.parse(data);

    switch (format) {
      case 'backup':
        return {
          trainingSessions: parsed.trainingSessions,
          dailyGoals: parsed.dailyGoals,
          settings: parsed.settings,
          metadata: parsed.metadata,
        };

      case 'legacy':
        return {
          trainingSessions: parsed,
          metadata: {
            exportedAt: new Date().toISOString(),
            version: '1.0.0',
            sessionCount: parsed.length,
            exportOptions: {},
          },
        };

      case 'json':
      default:
        return parsed;
    }
  }

  /**
   * Import training sessions with conflict resolution
   */
  private async importTrainingSessions(
    sessions: TrainingSession[],
    options: ImportOptions,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const existingSessions = await offlineStorage.getSessions();
    const existingIds = new Set(existingSessions.map((s) => s.id));

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const normalizedDate = this.normalizeDateValue(session.date);
      onProgress?.(i + 1, sessions.length);

      if (!this.isValidSession(session, normalizedDate)) {
        errors.push(`Skipped invalid session: ${session.id}`);
        skipped++;
        continue;
      }

      // Handle conflicts
      if (existingIds.has(session.id)) {
        switch (options.conflictResolution) {
          case 'skip':
            skipped++;
            continue;

          case 'overwrite':
            if (!options.dryRun) {
              try {
                // Update existing session
                await this.updateExistingSession(session);
                imported++;
              } catch (error) {
                errors.push(`Failed to overwrite session ${session.id}: ${error}`);
              }
            }
            break;

          case 'merge':
            if (!options.dryRun) {
              try {
                await this.mergeSession(
                  session,
                  existingSessions.find((s) => s.id === session.id)!,
                );
                imported++;
              } catch (error) {
                errors.push(`Failed to merge session ${session.id}: ${error}`);
              }
            }
            break;
        }
        continue;
      }

      // Import new session
      if (!options.dryRun) {
        try {
          if (!normalizedDate) {
            errors.push(`Failed to import session ${session.id}: Invalid date`);
            skipped++;
            continue;
          }

          await createSession(
            {
              type: session.type,
              date: normalizedDate,
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
            },
            session.id,
          );

          imported++;
          existingIds.add(session.id);
        } catch (error) {
          errors.push(`Failed to import session ${session.id}: ${error}`);
        }
      } else {
        imported++;
      }
    }

    return { imported, skipped, errors };
  }

  /**
   * Validate individual session data
   */
  private isValidSession(session: any, normalizedDate?: Date | null): boolean {
    const dateToCheck = normalizedDate ?? this.normalizeDateValue(session?.date);

    return (
      session &&
      typeof session.id === 'number' &&
      typeof session.type === 'string' &&
      !!dateToCheck
    );
  }

  private normalizeDateValue(value: any): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof value === 'object') {
      const maybeTimestamp = value as {
        seconds?: number;
        nanoseconds?: number;
        _seconds?: number;
        _nanoseconds?: number;
        toDate?: () => Date;
      };

      if (typeof maybeTimestamp.toDate === 'function') {
        const parsed = maybeTimestamp.toDate();
        return isNaN(parsed.getTime()) ? null : parsed;
      }

      const seconds = maybeTimestamp.seconds ?? maybeTimestamp._seconds;
      const nanos = maybeTimestamp.nanoseconds ?? maybeTimestamp._nanoseconds ?? 0;

      if (typeof seconds === 'number') {
        return new Date(seconds * 1000 + nanos / 1e6);
      }
    }

    return null;
  }

  /**
   * Validate daily goals data
   */
  private isValidDailyGoals(dailyGoals: any): boolean {
    return (
      dailyGoals && typeof dailyGoals.targetMinutes === 'number' && dailyGoals.targetMinutes >= 0
    );
  }

  /**
   * Recommend conflict resolution strategy
   */
  private recommendConflictResolution(
    importing: TrainingSession,
    existing: TrainingSession,
  ): 'skip' | 'overwrite' | 'merge' {
    // If importing data has more information, recommend overwrite
    const importingFields = this.countNonEmptyFields(importing);
    const existingFields = this.countNonEmptyFields(existing);

    if (importingFields > existingFields) return 'overwrite';
    if (existingFields > importingFields) return 'skip';

    // If same amount of data, recommend merge
    return 'merge';
  }

  /**
   * Count non-empty fields in a session
   */
  private countNonEmptyFields(session: TrainingSession): number {
    let count = 0;
    const fields = [
      'duration',
      'pointsGained',
      'finalScore',
      'tacticsNotes',
      'gameResult',
      'gameType',
      'gameComments',
      'playerColor',
      'platform',
      'timeControl',
      'opponentUsername',
      'studyType',
      'studyTags',
      'studyNotes',
    ];

    for (const field of fields) {
      if (
        session[field as keyof TrainingSession] != null &&
        session[field as keyof TrainingSession] !== ''
      ) {
        count++;
      }
    }

    return count;
  }

  /**
   * Create backup before import
   */
  private async createPreImportBackup(): Promise<string> {
    const { exportManager } = await import('../export/export-manager');

    const backupResult = await exportManager.exportData({
      includeTrainingSessions: true,
      includeDailyGoals: true,
      includeSettings: true,
      includeMetadata: true,
      format: 'backup',
    });

    // Store backup locally
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `pre-import-backup-${timestamp}`;

    localStorage.setItem(backupKey, backupResult.data as string);

    return backupKey;
  }

  /**
   * Update existing session with imported data
   */
  private async updateExistingSession(session: TrainingSession): Promise<void> {
    // Implementation would update the session in offline storage
    // For now, we'll use the existing createSession with overwrite
    const normalizedDate = this.normalizeDateValue(session.date);
    await createSession(
      {
        type: session.type,
        date: normalizedDate ?? new Date(),
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
      },
      session.id,
    );
  }

  /**
   * Merge imported session with existing session
   */
  private async mergeSession(importing: TrainingSession, existing: TrainingSession): Promise<void> {
    const merged: any = { ...existing };

    // Merge non-empty fields from importing session
    const mergeableFields = [
      'duration',
      'pointsGained',
      'finalScore',
      'tacticsNotes',
      'gameResult',
      'gameType',
      'gameComments',
      'playerColor',
      'platform',
      'timeControl',
      'opponentUsername',
      'studyType',
      'studyTags',
      'studyNotes',
    ];

    for (const field of mergeableFields) {
      const importValue = importing[field as keyof TrainingSession];
      if (importValue != null && importValue !== '') {
        merged[field] = importValue;
      }
    }

    await this.updateExistingSession(merged);
  }

  /**
   * Validate backup checksum
   */
  private async validateBackupChecksum(backupData: any): Promise<boolean> {
    if (!backupData.backup?.checksum) return false;

    const dataToValidate = JSON.stringify({
      trainingSessions: backupData.trainingSessions,
      dailyGoals: backupData.dailyGoals,
      settings: backupData.settings,
    });

    const { exportManager } = await import('../export/export-manager');
    const expectedChecksum = await (exportManager as any).calculateChecksum(dataToValidate);

    return expectedChecksum === backupData.backup.checksum;
  }
}

// Export singleton instance
export const importManager = new ImportManager();
