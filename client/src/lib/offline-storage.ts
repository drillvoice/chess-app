import { logger } from './logger';
import { dbPromise } from './storage/db';
import * as sessions from './storage/sessions';
import * as statistics from './storage/statistics';
import * as settings from './storage/settings';
import * as dailyGoals from './storage/dailyGoals';
import * as meta from './storage/meta';
import { clearAll } from './storage/clear';

export const offlineStorage = {
  // initialization simply ensures DB is opened
  async init(): Promise<void> {
    await dbPromise;
  },
  // session methods
  getSessions: sessions.getSessions,
  setSessions: sessions.setSessions,
  mergeSessions: sessions.mergeSessions,
  addSession: sessions.addSession,
  updateSession: sessions.updateSession,
  getSession: sessions.getSession,
  removeSession: sessions.removeSession,
  deleteSession: sessions.deleteSession,
  // sync queue
  markAsUnsynced: sessions.markAsUnsynced,
  markAsSynced: sessions.markAsSynced,
  incrementSyncRetries: sessions.incrementSyncRetries,
  getUnsyncedSessions: sessions.getUnsyncedSessions,
  // statistics
  getStatistics: statistics.getStatistics,
  setStatistics: statistics.setStatistics,
  clearStatistics: statistics.clearStatistics,
  // settings
  getSettings: settings.getSettings,
  setSettings: settings.setSettings,
  // daily goals
  getDailyGoalSettings: dailyGoals.getDailyGoalSettings,
  setDailyGoalSettings: dailyGoals.setDailyGoalSettings,
  clearDailyGoalSettings: dailyGoals.clearDailyGoalSettings,
  // metadata
  getLastSyncedTimestamp: meta.getLastSyncedTimestamp,
  setLastSyncedTimestamp: meta.setLastSyncedTimestamp,
  getCacheAge: meta.getCacheAge,
  getLastSyncAttempt: meta.getLastSyncAttempt,
  setLastSyncAttempt: meta.setLastSyncAttempt,
  // maintenance
  clearAll,
  clear: clearAll,
};

// Initialize immediately
offlineStorage.init().catch((error) => {
  logger.warn('Failed to initialize offline storage:', error);
});
