import { TrainingSession, InsertTrainingSession, DailyGoalSettings } from '@shared/schema';
import { SessionsCache, StatisticsCache, WeeklyGoalCache } from '../cache-utils';
import { offlineStorage } from '../offline-storage';
import { queryClient } from '../queryClient';
import { safeDatabaseOperation } from '../query-timeout';
import { migrateStudySessions, getMigrationStats } from '../migration';
import { sessionEvents } from '../session-events';
import '../session-event-bridge';
import { getCurrentUserId } from './core';
import {
  fetchSessionsFromCloudForVerification,
  initializeCloudSyncForCurrentUser,
  markSessionDeletedInCloud,
  upsertSessionToCloud,
  syncDailyGoalsToCloud,
} from './sync-engine';

// Firebase data layer - LOCAL FIRST with real-time cloud sync when authenticated.
// Operations always commit to local IndexedDB first, then perform non-blocking
// cloud write-through updates for signed-in users.

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
            sessionEvents.emit('sessionsReplaced', migratedSessions);
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
    return allSessions.filter((session) => session.date >= startDate && session.date <= endDate);
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

function canSyncToCloud(): boolean {
  return Boolean(getCurrentUserId());
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
    updatedAt: now,
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

    if (canSyncToCloud()) {
      queueMicrotask(() => {
        upsertSessionToCloud(newSession).catch((error) => {
          console.warn('Background cloud sync failed for created session:', error);
        });
      });
    }
  } catch (error) {
    console.error('Failed to save session locally:', error);
    throw new Error('Failed to save session offline');
  }

  // Refresh pending review queries so UI reflects latest data
  queryClient.invalidateQueries({ queryKey: ['pending-review'] });
  sessionEvents.emit('sessionAdded', newSession);

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

    if (canSyncToCloud()) {
      queueMicrotask(() => {
        upsertSessionToCloud(updatedSession).catch((error) => {
          console.warn('Background cloud sync failed for updated session:', error);
        });
      });
    }

    // Refresh pending review queries so UI reflects latest data
    queryClient.invalidateQueries({ queryKey: ['pending-review'] });
    sessionEvents.emit('sessionUpdated', updatedSession);

    return updatedSession;
  } catch (error) {
    console.error('Error updating session locally:', error);
    throw new Error('Failed to update session');
  }
}

export async function deleteSession(id: number): Promise<boolean> {
  try {
    const existingSession = await offlineStorage.getSession(id);
    // Delete locally first - this is the source of truth
    await offlineStorage.deleteSession(id);
    await offlineStorage.clearStatistics();

    // Clear caches
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();

    queueMicrotask(() => updateStatisticsInBackground());

    if (canSyncToCloud()) {
      queueMicrotask(() => {
        markSessionDeletedInCloud(id).catch((error) => {
          console.warn('Background cloud tombstone sync failed:', error);
          if (existingSession) {
            upsertSessionToCloud(existingSession).catch((restoreError) => {
              console.warn('Failed to re-upsert session after delete sync failure:', restoreError);
            });
          }
        });
      });
    }

    queryClient.invalidateQueries({ queryKey: ['pending-review'] });
    sessionEvents.emit('sessionDeleted', { id });

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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = Date.now();

  let totalDuration = 0;
  let todaySessionsCount = 0;
  let todayTotalTime = 0;
  let latestTacticsScore = 0;
  let latestTacticsTimestamp = -Infinity;
  let gameSessionsCount = 0;
  let wins = 0;

  for (const session of sessions) {
    const duration = session.duration || 0;
    totalDuration += duration;

    const sessionDate = new Date(session.date);
    const sessionTimestamp = sessionDate.getTime();
    const sessionDateMidnight = new Date(sessionDate);
    sessionDateMidnight.setHours(0, 0, 0, 0);
    const isFutureSession = sessionTimestamp > now;

    if (!isFutureSession && sessionDateMidnight.getTime() === today.getTime()) {
      todaySessionsCount += 1;
      todayTotalTime += duration;
    }

    if (session.type === 'tactics' && session.finalScore) {
      if (sessionTimestamp > latestTacticsTimestamp) {
        latestTacticsTimestamp = sessionTimestamp;
        latestTacticsScore = session.finalScore || 0;
      }
    }

    if (session.type === 'game') {
      gameSessionsCount += 1;
      if (session.gameResult === 'win') {
        wins += 1;
      }
    }
  }

  const totalHours = Math.round((totalDuration / 60) * 10) / 10;
  const winRate = gameSessionsCount > 0 ? Math.round((wins / gameSessionsCount) * 100) : 0;

  const stats = {
    totalHours,
    totalSessions,
    tacticsRating: latestTacticsScore,
    winRate,
    todayTotalTime,
    todaySessions: todaySessionsCount,
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

    if (canSyncToCloud()) {
      queueMicrotask(() => {
        syncDailyGoalsToCloud(settings).catch((error) => {
          console.warn('Daily goals cloud sync failed:', error);
        });
      });
    }
  } catch (error) {
    console.error('Error setting daily goal settings locally:', error);
    throw new Error('Failed to set daily goal settings');
  }
}

// Stub functions for backward compatibility
export async function retryPendingSync(): Promise<void> {
  await initializeCloudSyncForCurrentUser();
}

export async function fetchSessionsFromFirebase(): Promise<TrainingSession[]> {
  if (!canSyncToCloud()) {
    return [];
  }
  return await fetchSessionsFromCloudForVerification();
}
