import { TrainingSession, DailyGoalSettings } from '@shared/schema';
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
    console.log('🔄 Starting full backup to cloud...');
    
    await waitForAuth();
    const sessions = await offlineStorage.getSessions();
    
    if (!sessions || sessions.length === 0) {
      console.log('✅ No sessions to backup');
      return;
    }

    const backupRef = await getSessionsCollection();
    const batchTimestamp = Date.now();
    
    // Create a single backup document with all sessions
    const backupDoc = doc(backupRef, `sessions_${batchTimestamp}`);
    const backupData = {
      sessions: sessions.map(session => ({
        ...session,
        date: Timestamp.fromDate(session.date),
        createdAt: Timestamp.now(),
      })),
      backupDate: Timestamp.now(),
      sessionCount: sessions.length,
      type: 'full_backup'
    };

    await setDoc(backupDoc, backupData);
    
    // Store backup timestamp locally
    await offlineStorage.setLastBackupTimestamp(batchTimestamp);
    
    console.log(`✅ Backed up ${sessions.length} sessions to cloud`);
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
      backupDate: Timestamp.now(),
    };

    await setDoc(goalsRef, backupData);
    console.log('✅ Daily goals backed up to cloud');
  } catch (error) {
    console.error('❌ Daily goals backup failed:', error);
    // Don't throw - daily goals backup is not critical
  }
}

// Check if backup is needed (weekly automatic backup)
export async function isBackupNeeded(): Promise<boolean> {
  try {
    const lastBackup = await offlineStorage.getLastBackupTimestamp();
    if (!lastBackup) return true;
    
    const weekInMs = 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - lastBackup) > weekInMs;
  } catch (error) {
    console.error('Error checking backup status:', error);
    return true; // Default to needing backup
  }
}

// Simple backup status for UI
export async function getBackupStatus() {
  try {
    const lastBackup = await offlineStorage.getLastBackupTimestamp();
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