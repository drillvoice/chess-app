import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { TrainingSession, DailyGoalSettings } from '@shared/schema';
import type { OtbGame } from '../otb/types';
import type { OpeningRepertoire } from '../opening-trainer/types';

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
}

export type DB = IDBPDatabase<ChessLoggerDB>;

const DB_NAME = 'chess-logger-offline';
const DB_VERSION = 9;

export const dbPromise = openDB<ChessLoggerDB>(DB_NAME, DB_VERSION, {
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

export async function getDB(): Promise<DB> {
  return dbPromise;
}
