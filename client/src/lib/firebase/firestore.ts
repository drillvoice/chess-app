import {
  TrainingSession,
  InsertTrainingSession,
  SessionInput,
  DailyGoalSettings,
} from '@shared/schema';
import { SessionsCache, StatisticsCache, WeeklyGoalCache } from '../cache-utils';
import { offlineStorage } from '../offline-storage';
import { serializeTagList } from '../storage/study-tags';
import { queryClient } from '../queryClient';
import { safeDatabaseOperation } from '../query-timeout';
import { migrateStudySessions, getMigrationStats } from '../migration';
import { sessionEvents } from '../session-events';
import '../session-event-bridge';
import { logger } from '../logger';
import { getCurrentUserId } from './core';
import {
  createSessionInCloudIfAbsent,
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
            logger.info('Migration needed:', migrationStats);
            const migratedSessions = migrateStudySessions(cachedSessions);
            // Save migrated sessions back to cache
            await offlineStorage.setSessions(migratedSessions);
            sessionEvents.emit('sessionsReplaced', migratedSessions);
            logger.info(`Migrated ${migrationStats.needsMigration} study sessions`);
            return migratedSessions;
          }
          return cachedSessions;
        }
        return [];
      } catch (error) {
        logger.warn('Failed to read sessions from offline storage:', error);
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
    logger.error('Error getting sessions by type:', error);
    return [];
  }
}

/**
 * The key that identifies one Lichess game across its copies: the game's end
 * time, which the importer stores as the session date (see lichess-sync).
 */
function lichessGameKey(session: TrainingSession): number | null {
  if (session.type !== 'game' || session.platform !== 'lichess') return null;
  const endedAt = new Date(session.date).getTime();
  return Number.isFinite(endedAt) ? endedAt : null;
}

/**
 * Games still waiting for review, with duplicate imports collapsed.
 *
 * Before Lichess imports had game-derived ids, two devices importing the same
 * game created two separate sessions, and cloud sync gave every device both.
 * Those copies are still in people's logs. Reviewing or archiving one cleared
 * only that copy, so the twin kept the game in the queue on every device. An
 * import always starts out needing review, so a Lichess copy that no longer
 * does was reviewed or archived by the user: the whole game is done. Pending
 * copies of the same game are shown once.
 */
export function selectSessionsNeedingReview(sessions: TrainingSession[]): TrainingSession[] {
  const reviewedGames = new Set<number>();
  for (const session of sessions) {
    const key = lichessGameKey(session);
    if (key != null && session.needsReview !== true) reviewedGames.add(key);
  }

  const shownGames = new Set<number>();
  return sessions.filter((session) => {
    if (session.needsReview !== true) return false;
    const key = lichessGameKey(session);
    if (key == null) return true;
    if (reviewedGames.has(key) || shownGames.has(key)) return false;
    shownGames.add(key);
    return true;
  });
}

export async function getSessionsNeedingReview(): Promise<TrainingSession[]> {
  try {
    return selectSessionsNeedingReview(await getAllSessions());
  } catch (error) {
    logger.error('Error getting sessions needing review:', error);
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
    logger.error('Error getting sessions by date range:', error);
    return [];
  }
}

// Helper function to convert tag-list arrays to JSON strings for storage.
// Only rewrites keys the caller actually supplied: this also runs on partial
// update payloads, and emitting `mistakeTags: undefined` for a caller that never
// mentioned it (e.g. the OTB session bridge) would blank the stored tags when
// the update is spread over the existing record.
function prepareSessionForStorage(session: Partial<SessionInput>): Partial<InsertTrainingSession> {
  const prepared: Record<string, unknown> = { ...session };
  for (const field of ['studyTags', 'mistakeTags'] as const) {
    if (field in prepared) {
      prepared[field] = serializeTagList(prepared[field]);
    }
  }
  return prepared as Partial<InsertTrainingSession>;
}

function canSyncToCloud(): boolean {
  return Boolean(getCurrentUserId());
}

interface CreateSessionOptions {
  awaitCloudWrite?: boolean;
  /**
   * The session is an automatic import whose `id` identifies the source game
   * (see lichess-sync). An import is a claim that the game exists, not an edit,
   * so it must never replace a copy already stored here or in the cloud — that
   * copy may have been reviewed, archived or deleted on another device. It is
   * written only where absent, and its `updatedAt` is the game's own date
   * rather than now, so recency resolution ranks every real edit above it.
   */
  imported?: boolean;
}

export async function createSession(
  insertSession: SessionInput,
  id?: number,
  options: CreateSessionOptions = {},
): Promise<TrainingSession> {
  logger.debug('createSession called with:', insertSession);
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
    updatedAt: options.imported ? sessionDate : now,
    needsReview: insertSession.needsReview ?? false,
  } as TrainingSession;

  logger.debug('createSession - new session created:', newSession);

  // Save locally FIRST - this is always the source of truth
  try {
    if (options.imported) {
      const written = await offlineStorage.addSessionIfAbsent(newSession);
      if (!written) {
        logger.debug(`createSession - import ${sessionId} already stored; leaving it untouched`);
        return newSession;
      }
    } else {
      await offlineStorage.addSession(newSession);
    }
    await offlineStorage.clearStatistics();

    // Update caches immediately
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();

    queueMicrotask(() => updateStatisticsInBackground());

    const writeToCloud = options.imported
      ? () => createSessionInCloudIfAbsent(newSession).then(() => undefined)
      : () => upsertSessionToCloud(newSession);

    if (canSyncToCloud()) {
      if (options.awaitCloudWrite) {
        try {
          await writeToCloud();
        } catch (error) {
          logger.warn('Synchronous cloud sync failed for created session:', error);
          throw new Error('Failed to sync created session to cloud');
        }
      } else {
        queueMicrotask(() => {
          writeToCloud().catch((error) => {
            logger.warn(`Background cloud sync failed for created session ${sessionId}:`, error);
          });
        });
      }
    }
  } catch (error) {
    logger.error('Failed to save session locally:', error);
    throw new Error('Failed to save session offline');
  }

  // Refresh pending review queries so UI reflects latest data
  queryClient.invalidateQueries({ queryKey: ['pending-review'] });
  sessionEvents.emit('sessionAdded', newSession);

  return newSession;
}

export async function updateSession(
  id: number,
  updateData: Partial<SessionInput>,
): Promise<TrainingSession | null> {
  logger.debug('updateSession called with id:', id, 'updateData:', updateData);
  try {
    // Prepare update data for storage (convert arrays to JSON)
    const preparedUpdateData = prepareSessionForStorage(updateData);

    // Update locally first - this is the source of truth
    const updatedSession = await offlineStorage.updateSession(id, preparedUpdateData);
    logger.debug('updateSession - updated session from offline storage:', updatedSession);
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
          logger.warn('Background cloud sync failed for updated session:', error);
        });
      });
    }

    // Refresh pending review queries so UI reflects latest data
    queryClient.invalidateQueries({ queryKey: ['pending-review'] });
    sessionEvents.emit('sessionUpdated', updatedSession);

    return updatedSession;
  } catch (error) {
    logger.error('Error updating session locally:', error);
    throw new Error('Failed to update session');
  }
}

export async function deleteSession(id: number): Promise<boolean> {
  try {
    // Delete locally first - this is the source of truth. The local record is
    // tombstoned rather than dropped (see getSessionsForSync), so the delete
    // survives a cloud write that never happens: the snapshot reconciler
    // uploads the tombstone on the next pass.
    await offlineStorage.deleteSession(id);
    await offlineStorage.clearStatistics();

    // Clear caches
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();

    queueMicrotask(() => updateStatisticsInBackground());

    if (canSyncToCloud()) {
      // Only to spare the other devices a wait for the next reconciliation
      // pass. A failure here needs no repair: it used to re-upload the session
      // to keep the two sides consistent, which resurrected a session the user
      // had just deleted whenever the tombstone write was the thing that failed.
      queueMicrotask(() => {
        markSessionDeletedInCloud(id).catch((error) => {
          logger.warn('Background cloud tombstone sync failed:', error);
        });
      });
    }

    queryClient.invalidateQueries({ queryKey: ['pending-review'] });
    sessionEvents.emit('sessionDeleted', { id });

    return true;
  } catch (error) {
    logger.error('Error deleting session locally:', error);
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
        logger.warn('Failed to get cached statistics:', error);
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
    logger.warn('Failed to cache statistics in IndexedDB:', error);
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
    logger.error('Statistics background update failed:', error);
  }
}

// Daily Goals - Simplified
export async function getDailyGoalSettings(): Promise<DailyGoalSettings | null> {
  try {
    // Always read from offline storage - this is the source of truth
    const cachedSettings = await offlineStorage.getDailyGoalSettings();
    return cachedSettings;
  } catch (error) {
    logger.warn('Failed to get daily goal settings:', error);
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
          logger.warn('Daily goals cloud sync failed:', error);
        });
      });
    }
  } catch (error) {
    logger.error('Error setting daily goal settings locally:', error);
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
