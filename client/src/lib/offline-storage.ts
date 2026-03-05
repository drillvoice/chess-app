import { logger } from './logger';
import { dbPromise } from './storage/db';
import * as sessions from './storage/sessions';
import * as statistics from './storage/statistics';
import * as settings from './storage/settings';
import * as dailyGoals from './storage/dailyGoals';
import * as meta from './storage/meta';
import * as snapshots from './storage/snapshots';
import * as otbGames from './storage/otb-games';
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
  clearSessions: sessions.clearSessions,
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
  clearSettings: settings.clearSettings,
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
  getLastBackupTimestamp: meta.getLastBackupTimestamp,
  setLastBackupTimestamp: meta.setLastBackupTimestamp,
  getSyncCurrentUid: meta.getSyncCurrentUid,
  setSyncCurrentUid: meta.setSyncCurrentUid,
  clearSyncCurrentUid: meta.clearSyncCurrentUid,
  getSyncInitializedForUid: meta.getSyncInitializedForUid,
  setSyncInitializedForUid: meta.setSyncInitializedForUid,
  getSyncLastSuccessAt: meta.getSyncLastSuccessAt,
  setSyncLastSuccessAt: meta.setSyncLastSuccessAt,
  getSyncLastError: meta.getSyncLastError,
  setSyncLastError: meta.setSyncLastError,
  clearSyncLastError: meta.clearSyncLastError,
  createAccountSnapshot: snapshots.createAccountSnapshot,
  listAccountSnapshots: snapshots.listAccountSnapshots,
  // OTB games
  getOtbGames: otbGames.getOtbGames,
  getOtbGame: otbGames.getOtbGame,
  createOtbGame: otbGames.createOtbGame,
  saveOtbGame: otbGames.saveOtbGame,
  deleteOtbGame: otbGames.deleteOtbGame,
  resetOtbGame: otbGames.resetOtbGame,
  // maintenance
  clearAll,
  clear: clearAll,
};

// Initialize immediately
offlineStorage.init().catch((error) => {
  logger.warn('Failed to initialize offline storage:', error);
});
