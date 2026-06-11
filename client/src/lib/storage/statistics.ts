import { createSingleRecordStore } from './single-record-store';

/**
 * Cached aggregate statistics computed in client/src/lib/firebase/firestore.ts.
 * Persisted values are untrusted input — consumers doing arithmetic on these
 * should guard with Number.isFinite (see CLAUDE.md).
 */
export interface Statistics {
  totalHours: number;
  totalSessions: number;
  tacticsRating: number;
  winRate: number;
  todayTotalTime: number;
  todaySessions: number;
}

const store = createSingleRecordStore<Statistics>('statistics', 'statistics_last_updated');

export async function getStatistics(): Promise<Statistics | null> {
  return store.get();
}

export async function setStatistics(stats: Statistics): Promise<void> {
  await store.set(stats);
}

export async function clearStatistics(): Promise<void> {
  await store.clear();
}
