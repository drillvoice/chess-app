import { TrainingSession, InsertTrainingSession, DailyGoalSettings } from '@shared/schema';
import { SessionsCache, StatisticsCache, WeeklyGoalCache } from '../cache-utils';
import { offlineStorage } from '../offline-storage';
import { queryClient } from '../queryClient';
import { safeDatabaseOperation } from '../query-timeout';
import { migrateStudySessions, getMigrationStats } from '../migration';
import { backupAllSessionsToCloud, backupDailyGoalsToCloud } from './firestore-backup';

// Simplified Firebase integration - LOCAL FIRST with optional cloud backup
// No real-time sync, no complex retry logic, no data loss scenarios
// All operations work locally first, then queue backup operations

export async function getAllSessions(): Promise<TrainingSession[]> {
  return safeDatabaseOperation(
    async () => {
      try {
        // Always read from local cache first - this is the source of truth
        const cachedSessions = await offlineStorage.getSessions();
        if (cachedSessions && cachedSessions.length > 0) {
          // Check if migration is needed
          const migrationStats = getMigrationStats(cachedSessions);
          if (migrationStats.migrationNeeded) {
            console.log('Migration needed:', migrationStats);
            const migratedSessions = migrateStudySessions(cachedSessions);
            // Save migrated sessions back to cache
            await offlineStorage.setSessions(migratedSessions);
            console.log(`Migrated ${migrationStats.needsMigration} study sessions`);
            return migratedSessions;
          }
          return cachedSessions;
        }
        return [];
      } catch (error) {
        console.warn('Failed to read sessions from offline storage:', error);
        return [];
      }
    },
    15000,
    [],
  );
}

export async function getSessionsByType(type: string): Promise<TrainingSession[]> {
  try {
    const allSessions = await getAllSessions();
    return allSessions.filter((session) => session.type === type);
  } catch (error) {
    console.error('Error getting sessions by type:', error);
    return [];
  }
}

export async function getSessionsNeedingReview(): Promise<TrainingSession[]> {
  console.log('getSessionsNeedingReview called');
  try {
    const allSessions = await getAllSessions();
    const filteredSessions = allSessions.filter((session) => {
      console.log(
        'Filtering session:',
        session.id,
        'needsReview:',
        session.needsReview,
        'type:',
        typeof session.needsReview,
      );
      return session.needsReview === true;
    });
    console.log('getSessionsNeedingReview - filtered sessions:', filteredSessions);
    return filteredSessions;
  } catch (error) {
    console.error('Error getting sessions needing review:', error);
    return [];
  }
}

export async function getSessionsByDateRange(
  startDate: Date,
  endDate: Date,
): Promise<TrainingSession[]> {
  try {
    const allSessions = await getAllSessions();
    return allSessions.filter(
      (session) => session.date >= startDate && session.date <= endDate,
    );
  } catch (error) {
    console.error('Error getting sessions by date range:', error);
    return [];
  }
}

// Helper function to convert studyTags array to JSON string for storage
function prepareSessionForStorage(
  session: Partial<InsertTrainingSession>,
): Partial<InsertTrainingSession> {
  const prepared = { ...session };

  // Convert studyTags array to JSON string for database storage
  if (prepared.studyTags && Array.isArray(prepared.studyTags)) {
    prepared.studyTags = JSON.stringify(prepared.studyTags);
  }

  return prepared;
}

export async function createSession(
  insertSession: InsertTrainingSession,
  id?: number,
): Promise<TrainingSession> {
  console.log('createSession called with:', insertSession);
  const sessionId = id ?? Date.now();
  const sessionDate = insertSession.date || new Date();
  const now = new Date();

  // Prepare session data for storage (convert arrays to JSON)
  const preparedSession = prepareSessionForStorage(insertSession);

  const newSession: TrainingSession = {
    ...preparedSession,
    id: sessionId,
    date: sessionDate,
    createdAt: now,
    needsReview: insertSession.needsReview ?? false,
  } as TrainingSession;

  console.log('createSession - new session created:', newSession);

  // Save locally FIRST - this is always the source of truth
  try {
    await offlineStorage.addSession(newSession);
    await offlineStorage.clearStatistics();

    // Update caches immediately
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();

    queueMicrotask(() => updateStatisticsInBackground());
    
    // Queue backup operation (non-blocking)
    queueMicrotask(() => {
      backupAllSessionsToCloud().catch(error => {
        console.warn('Background backup failed:', error);
        // Don't throw - backup failure shouldn't affect user experience
      });
    });
  } catch (error) {
    console.error('Failed to save session locally:', error);
    throw new Error('Failed to save session offline');
  }

  // Refresh pending review queries so UI reflects latest data
  queryClient.invalidateQueries({ queryKey: ['pending-review'] });

  return newSession;
}

export async function updateSession(
  id: number,
  updateData: Partial<InsertTrainingSession>,
): Promise<TrainingSession | null> {
  console.log('updateSession called with id:', id, 'updateData:', updateData);
  try {
    // Prepare update data for storage (convert arrays to JSON)
    const preparedUpdateData = prepareSessionForStorage(updateData);

    // Update locally first - this is the source of truth
    const updatedSession = await offlineStorage.updateSession(id, preparedUpdateData);
    console.log('updateSession - updated session from offline storage:', updatedSession);
    if (!updatedSession) {
      throw new Error('Session not found locally');
    }

    // Clear caches
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();

    queueMicrotask(() => updateStatisticsInBackground());

    // Queue backup operation (non-blocking)
    queueMicrotask(() => {
      backupAllSessionsToCloud().catch(error => {
        console.warn('Background backup after update failed:', error);
      });
    });

    // Refresh pending review queries so UI reflects latest data
    queryClient.invalidateQueries({ queryKey: ['pending-review'] });

    return updatedSession;
  } catch (error) {
    console.error('Error updating session locally:', error);
    throw new Error('Failed to update session');
  }
}

export async function deleteSession(id: number): Promise<boolean> {
  try {
    // Delete locally first - this is the source of truth
    await offlineStorage.deleteSession(id);
    await offlineStorage.clearStatistics();

    // Clear caches
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();

    queueMicrotask(() => updateStatisticsInBackground());

    // Queue backup operation (non-blocking)
    queueMicrotask(() => {
      backupAllSessionsToCloud().catch(error => {
        console.warn('Background backup after delete failed:', error);
      });
    });

    return true;
  } catch (error) {
    console.error('Error deleting session locally:', error);
    throw new Error('Failed to delete session');
  }
}

export async function getStatistics() {
  return safeDatabaseOperation(
    async () => {
      // Try IndexedDB first for instant loading
      try {
        const cachedStats = await offlineStorage.getStatistics();
        if (cachedStats) {
          // Schedule background update but don't wait
          queueMicrotask(() => updateStatisticsInBackground());
          return cachedStats;
        }
      } catch (error) {
        console.warn('Failed to get cached statistics:', error);
      }

      // If no cache, calculate from sessions
      return await calculateStatistics();
    },
    10000,
    {
      totalHours: 0,
      totalSessions: 0,
      tacticsRating: 0,
      winRate: 0,
      todayTotalTime: 0,
      todaySessions: 0,
    },
  );
}

async function calculateStatistics() {
  const sessions = await getAllSessions();

  const totalSessions = sessions.length;
  const totalHours = sessions.reduce((sum, session) => sum + (session.duration || 0), 0) / 60;

  // Get today's sessions
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaySessions = sessions.filter((session) => {
    const sessionDate = new Date(session.date);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate.getTime() === today.getTime();
  });

  const todayTotalTime = todaySessions.reduce((sum, session) => sum + (session.duration || 0), 0);

  // Calculate tactics rating (most recent final score)
  const tacticsSessionsWithScores = sessions
    .filter((session) => session.type === 'tactics' && session.finalScore)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const tacticsRating =
    tacticsSessionsWithScores.length > 0
      ? tacticsSessionsWithScores[0].finalScore || 0
      : 0;

  // Calculate win rate
  const gameSessions = sessions.filter((session) => session.type === 'game');
  const wins = gameSessions.filter((session) => session.gameResult === 'win').length;
  const winRate = gameSessions.length > 0 ? Math.round((wins / gameSessions.length) * 100) : 0;

  const stats = {
    totalHours: Math.round(totalHours * 10) / 10,
    totalSessions,
    tacticsRating,
    winRate,
    todayTotalTime,
    todaySessions: todaySessions.length,
  };

  // Cache the results in both storages
  StatisticsCache.set(stats);
  offlineStorage.setStatistics(stats).catch((error) => {
    console.warn('Failed to cache statistics in IndexedDB:', error);
  });

  return stats;
}

export async function getWeeklyActivity() {
  const sessions = await getAllSessions();

  // Get current week's data (Monday to Sunday)
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);

  const weeklyData = [];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < 7; i++) {
    const currentDay = new Date(startOfWeek);
    currentDay.setDate(startOfWeek.getDate() + i);

    const dayEnd = new Date(currentDay);
    dayEnd.setHours(23, 59, 59, 999);

    // Get sessions for this day
    const daySessions = sessions.filter((session) => {
      const sessionDate = new Date(session.date);
      return sessionDate >= currentDay && sessionDate <= dayEnd;
    });

    // Calculate total duration for the day
    const totalDuration = daySessions.reduce((sum, session) => sum + (session.duration || 0), 0);

    weeklyData.push({
      day: dayNames[i],
      duration: totalDuration,
      sessions: daySessions.length,
    });
  }

  return weeklyData;
}

async function updateStatisticsInBackground(): Promise<void> {
  try {
    await calculateStatistics();
    // Cache will be updated in calculateStatistics
  } catch (error) {
    console.error('Statistics background update failed:', error);
  }
}

// Daily Goals - Simplified
export async function getDailyGoalSettings(): Promise<DailyGoalSettings | null> {
  try {
    // Always read from offline storage - this is the source of truth
    const cachedSettings = await offlineStorage.getDailyGoalSettings();
    return cachedSettings;
  } catch (error) {
    console.warn('Failed to get daily goal settings:', error);
    return null;
  }
}

export async function setDailyGoalSettings(settings: DailyGoalSettings): Promise<void> {
  try {
    // Update offline storage first - this is the source of truth
    await offlineStorage.setDailyGoalSettings(settings);

    // Queue Firebase backup (non-blocking)
    queueMicrotask(() => {
      backupDailyGoalsToCloud(settings).catch(error => {
        console.warn('Daily goals backup failed:', error);
      });
    });
  } catch (error) {
    console.error('Error setting daily goal settings locally:', error);
    throw new Error('Failed to set daily goal settings');
  }
}