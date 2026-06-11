import { logger } from '../logger';
import { offlineStorage } from '../offline-storage';
import { exportManager } from '../export/export-manager';
import { importManager } from '../import/import-manager';

export async function verifyDataPresence(): Promise<boolean> {
  try {
    const cached = await offlineStorage.getSessions();
    // Fetch fresh data via dynamic import so tests can mock the function.
    // Using a runtime import ensures the spy applied in tests intercepts the
    // call, avoiding unintended network/mock behavior.
    const { fetchSessionsFromFirebase } = await import('./firestore');
    await fetchSessionsFromFirebase();
    logger.debug('Migration verification: cached', cached?.length || 0, 'live read successful');
    return true;
  } catch (error) {
    console.error('Migration verification failed:', error);
    return false;
  }
}

/**
 * Legacy export function for backward compatibility
 * Uses new export manager with default options
 */
export async function exportData(): Promise<string> {
  const result = await exportManager.exportData({
    includeTrainingSessions: true,
    includeDailyGoals: false,
    includeSettings: false,
    includeMetadata: false,
    format: 'json',
  });

  return result.data as string;
}

/**
 * Legacy import function for backward compatibility
 * Uses new import manager with default options
 */
export async function importData(
  data: string,
  onProgress?: (processed: number, total: number) => void,
): Promise<{ imported: number; skipped: number }> {
  // Convert legacy progress callback to new format
  const progressCallback = onProgress
    ? (progress: any) => {
        if (progress.phase === 'importing_sessions') {
          onProgress(progress.processed, progress.total);
        }
      }
    : undefined;

  const result = await importManager.importData(
    data,
    {
      conflictResolution: 'skip',
      validateSchema: true,
      createBackup: false,
      dryRun: false,
    },
    progressCallback,
  );

  if (!result.success && result.errors.length > 0) {
    throw new AggregateError(
      result.errors.map((e) => new Error(e)),
      `Failed to import ${result.errors.length} sessions`,
    );
  }

  return {
    imported: result.imported.sessions,
    skipped: result.skipped,
  };
}
