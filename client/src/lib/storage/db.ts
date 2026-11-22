import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import { purgeCachedAppShell } from '@/lib/utils';
import type { TrainingSession, DailyGoalSettings } from '@shared/schema';
import type { OtbGame } from '../otb/types';
import type { OpeningRepertoire } from '../opening-trainer/types';
import type { CampaignAttempt } from '../campaign/attempts';

interface ChessLoggerDB extends DBSchema {
  sessions: {
    key: number;
    value: TrainingSession & { date: string; updatedAt?: string; needsReview?: boolean };
    indexes: { date: string; type: string };
  };
  cache_meta: {
    key: string;
    // `value` holds the payload (a timestamp, uid, or error string). `timestamp`
    // is the legacy field name, kept optional so pre-migration records still read.
    value: { key: string; value?: number | string; timestamp?: number | string };
  };
  statistics: {
    key: string;
    value: { id: string; data: any };
  };
  settings: {
    key: string;
    value: { id: string; data: any };
  };
  daily_goals: {
    key: string;
    value: DailyGoalSettings & { id: string; lastModified?: string };
  };
  account_snapshots: {
    key: string;
    value: {
      id: string;
      uid: string;
      createdAt: string;
      payload: {
        sessions: Array<TrainingSession & { date: string; updatedAt?: string; deletedAt?: string }>;
        settings: any;
        dailyGoals: (DailyGoalSettings & { id: string; lastModified?: string }) | null;
      };
    };
  };
  otb_games: {
    key: string;
    value: OtbGame;
    indexes: { updatedAt: string };
  };
  opening_repertoires: {
    key: string;
    value: OpeningRepertoire;
    indexes: { updatedAt: string };
  };
  campaign_attempts: {
    key: string;
    value: CampaignAttempt;
  };
}

export type DB = IDBPDatabase<ChessLoggerDB>;

const DB_NAME = 'chess-logger-offline';
const DB_VERSION = 10;

const openPromise = openDB<ChessLoggerDB>(DB_NAME, DB_VERSION, {
  // A newer build (another tab, or this PWA relaunched after an update) needs to upgrade the
  // schema. Holding our connection open would block it, and this page's code is now older than
  // the data, so writes from it would fail ("Failed to save session offline"). Step aside and
  // reload into the new build. In-progress work that matters (e.g. a focus session) is persisted
  // to localStorage and resumes after the reload.
  blocking(_currentVersion, newVersion, event) {
    console.error(`Database upgrade to v${newVersion} requested by a newer build; reloading.`);
    (event.target as IDBDatabase).close();
    location.reload();
  },
  terminated() {
    console.error('Local database connection was closed unexpectedly by the browser.');
  },
  upgrade(db) {
    if (!db.objectStoreNames.contains('sessions')) {
      const store = db.createObjectStore('sessions', { keyPath: 'id' });
      store.createIndex('date', 'date');
      store.createIndex('type', 'type');
    }
    if (!db.objectStoreNames.contains('cache_meta')) {
      db.createObjectStore('cache_meta', { keyPath: 'key' });
    }
    if (!db.objectStoreNames.contains('statistics')) {
      db.createObjectStore('statistics', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('settings')) {
      db.createObjectStore('settings', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('daily_goals')) {
      db.createObjectStore('daily_goals', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('account_snapshots')) {
      db.createObjectStore('account_snapshots', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('otb_games')) {
      const store = db.createObjectStore('otb_games', { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    }
    if (!db.objectStoreNames.contains('opening_repertoires')) {
      const store = db.createObjectStore('opening_repertoires', { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    }
    // v10 adds campaign trial attempts (append-only, synced as a union by id).
    if (!db.objectStoreNames.contains('campaign_attempts')) {
      db.createObjectStore('campaign_attempts', { keyPath: 'id' });
    }
    // v9 drops `sync_queue`: nothing has written to it since sync became
    // snapshot-reconciled, and leftover entries in an existing database would
    // otherwise sit there forever. The cast is needed because the store is no
    // longer part of ChessLoggerDB, so its name is not a valid StoreName.
    const untyped = db as unknown as IDBPDatabase;
    if (untyped.objectStoreNames.contains('sync_queue')) {
      untyped.deleteObjectStore('sync_queue');
    }
  },
});

const STALE_BUILD_RELOAD_KEY = 'idb-version-error-reload-at';

// A VersionError means this device's database was already upgraded by a newer build, so the code
// running now is stale (e.g. an old cached page served while offline). The user's data is intact
// but unreadable by this build. Reload once into the latest version instead of leaving every
// storage call failing; the guard stops a loop when the network still can't deliver a new build,
// and the rethrown error then surfaces with an explanation instead of the bare IndexedDB message.
function handleOpenError(error: unknown): never {
  if (error instanceof DOMException && error.name === 'VersionError') {
    let shouldReload = false;
    try {
      const lastReloadAt = Number(sessionStorage.getItem(STALE_BUILD_RELOAD_KEY)) || 0;
      if (Date.now() - lastReloadAt > 30_000) {
        sessionStorage.setItem(STALE_BUILD_RELOAD_KEY, String(Date.now()));
        shouldReload = true;
      }
    } catch {
      // No sessionStorage means no loop guard: just surface the error.
    }
    console.error('Local database is newer than this app build; reloading:', error);
    if (shouldReload) {
      void purgeCachedAppShell()
        .catch((purgeError) => console.error('Failed to purge cached app shell:', purgeError))
        .finally(() => location.reload());
    }
    throw new Error(
      `This copy of the app is out of date for the data on this device (${error.message}). ` +
        'Your data is safe. Reconnect to the internet and reload to update the app.',
    );
  }
  throw error;
}

export const dbPromise: Promise<DB> = openPromise.catch(handleOpenError);

export async function getDB(): Promise<DB> {
  return dbPromise;
}
