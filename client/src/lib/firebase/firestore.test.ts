import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getSessions = vi.fn();
const getCachedStatistics = vi.fn();
const setCachedStatistics = vi.fn();
const statisticsCacheSet = vi.fn();

vi.mock('../offline-storage', () => ({
  offlineStorage: {
    getSessions,
    setSessions: vi.fn(),
    addSession: vi.fn(),
    updateSession: vi.fn(),
    removeSession: vi.fn(),
    deleteSession: vi.fn(),
    clearStatistics: vi.fn(),
    getStatistics: getCachedStatistics,
    setStatistics: setCachedStatistics,
    getCacheAge: vi.fn(),
    getSettings: vi.fn(),
    setSettings: vi.fn(),
    mergeSessions: vi.fn(),
    getLastSyncedTimestamp: vi.fn(),
    setLastSyncedTimestamp: vi.fn(),
    markAsUnsynced: vi.fn(),
    markAsSynced: vi.fn(),
    incrementSyncRetries: vi.fn(),
    setLastSyncAttempt: vi.fn(),
    getDailyGoalSettings: vi.fn(),
    setDailyGoalSettings: vi.fn(),
  },
}));

vi.mock('../cache-utils', () => ({
  SessionsCache: { set: vi.fn(), remove: vi.fn(), get: vi.fn() },
  StatisticsCache: { set: statisticsCacheSet, get: vi.fn(), remove: vi.fn() },
  WeeklyGoalCache: { set: vi.fn(), get: vi.fn(), remove: vi.fn() },
}));

vi.mock('../migration', () => ({
  migrateStudySessions: (sessions: any) => sessions,
  getMigrationStats: () => ({ migrationNeeded: false, needsMigration: 0 }),
}));

describe('calculateStatistics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-02T12:00:00Z'));

    getSessions.mockResolvedValue([
      {
        id: 1,
        type: 'tactics',
        duration: 30,
        date: new Date('2024-05-01T10:00:00Z'),
        finalScore: 1500,
      },
      {
        id: 2,
        type: 'tactics',
        duration: 45,
        date: new Date('2024-05-02T09:00:00Z'),
        finalScore: 1520,
      },
      {
        id: 3,
        type: 'game',
        duration: 60,
        date: new Date('2024-05-02T12:00:00Z'),
        gameResult: 'win',
      },
      {
        id: 4,
        type: 'game',
        duration: 30,
        date: new Date('2024-05-02T16:00:00Z'),
        gameResult: 'loss',
      },
    ]);

    getCachedStatistics.mockResolvedValue(null);
    setCachedStatistics.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aggregates statistics from sessions and caches the result', async () => {
    vi.resetModules();
    const { getStatistics } = await import('./firestore');

    const stats = await getStatistics();

    expect(stats).toEqual({
      totalHours: 2.8,
      totalSessions: 4,
      tacticsRating: 1520,
      winRate: 50,
      todayTotalTime: 135,
      todaySessions: 3,
    });

    expect(statisticsCacheSet).toHaveBeenCalledWith(stats);
    expect(setCachedStatistics).toHaveBeenCalledWith(stats);
  });
});
