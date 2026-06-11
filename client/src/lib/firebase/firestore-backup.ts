import { logger } from '../logger';
import { DailyGoalSettings } from '@shared/schema';
import { offlineStorage } from '../offline-storage';
import {
  waitForAuth,
  getSessionsCollection,
  doc,
  setDoc,
  Timestamp,
  getCurrentUserId,
  db,
} from './core';

// Simple backup-only functions (no sync, no read operations)
// All data flows from IndexedDB -> Firebase for backup purposes only

export async function backupAllSessionsToCloud(): Promise<void> {
  try {
    logger.debug('🔄 Starting full backup to cloud...');

    await waitForAuth();
    const sessions =
      typeof offlineStorage.getSessions === 'function' ? await offlineStorage.getSessions() : [];

    if (!sessions || sessions.length === 0) {
      logger.debug('✅ No sessions to backup');
      return;
    }

    const sessionsRef = await getSessionsCollection();
    let successCount = 0;

    // Backup sessions individually to avoid batch limits
    for (const session of sessions) {
      try {
        const sessionDoc = doc(sessionsRef, session.id.toString());
        const backupData = {
          ...session,
          date: Timestamp.fromDate(session.date),
          lastBackup: Timestamp.now(),
        };

        await setDoc(sessionDoc, backupData);
        successCount++;
      } catch (error) {
        console.warn(`Failed to backup session ${session.id}:`, error);
      }
    }

    // Store backup timestamp locally
    await offlineStorage.setLastBackupTimestamp(Date.now());

    logger.debug(`✅ Backed up ${successCount}/${sessions.length} sessions to cloud`);
  } catch (error) {
    console.error('❌ Cloud backup failed:', error);
    throw new Error('Failed to backup sessions to cloud');
  }
}

export async function backupDailyGoalsToCloud(settings: DailyGoalSettings): Promise<void> {
  try {
    await waitForAuth();
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return;

    const goalsRef = doc(db, 'users', currentUserId, 'settings', 'dailyGoals');
    const backupData = {
      ...settings,
      lastModified: Timestamp.fromDate(new Date()),
      lastBackup: Timestamp.now(),
    };

    await setDoc(goalsRef, backupData);
    logger.debug('✅ Daily goals backed up to cloud');
  } catch (error) {
    console.error('❌ Daily goals backup failed:', error);
    // Don't throw - daily goals backup is not critical
  }
}

// Check if backup is needed (weekly automatic backup)
export async function isBackupNeeded(): Promise<boolean> {
  try {
    if (typeof offlineStorage.getLastBackupTimestamp !== 'function') {
      console.warn('Offline storage missing getLastBackupTimestamp, assuming backup needed');
      return true;
    }

    const lastBackup = await offlineStorage.getLastBackupTimestamp();
    if (!lastBackup) return true;

    const weekInMs = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - lastBackup > weekInMs;
  } catch (error) {
    console.error('Error checking backup status:', error);
    return true; // Default to needing backup
  }
}

// Simple backup status for UI
export async function getBackupStatus() {
  try {
    const lastBackup =
      typeof offlineStorage.getLastBackupTimestamp === 'function'
        ? await offlineStorage.getLastBackupTimestamp()
        : null;
    const sessions = await offlineStorage.getSessions();

    return {
      lastBackup: lastBackup ? new Date(lastBackup) : null,
      sessionCount: sessions?.length || 0,
      needsBackup: await isBackupNeeded(),
    };
  } catch (error) {
    console.error('Error getting backup status:', error);
    return {
      lastBackup: null,
      sessionCount: 0,
      needsBackup: true,
    };
  }
}
