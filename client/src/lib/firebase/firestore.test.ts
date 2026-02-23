import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getSessions = vi.fn();
const addSession = vi.fn();
const clearStatistics = vi.fn();
const getCachedStatistics = vi.fn();
const setCachedStatistics = vi.fn();
const statisticsCacheSet = vi.fn();
const mockUpsertSessionToCloud = vi.fn();
const mockGetCurrentUserId = vi.fn<() => string | null>(() => null);

vi.mock('../offline-storage', () => ({
  offlineStorage: {
    getSessions,
    setSessions: vi.fn(),
    addSession,
    updateSession: vi.fn(),
    getSession: vi.fn(),
    removeSession: vi.fn(),
    deleteSession: vi.fn(),
    clearStatistics,
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

vi.mock('./sync-engine', () => ({
  upsertSessionToCloud: mockUpsertSessionToCloud,
  markSessionDeletedInCloud: vi.fn(),
  syncDailyGoalsToCloud: vi.fn(),
  initializeCloudSyncForCurrentUser: vi.fn(),
  fetchSessionsFromCloudForVerification: vi.fn().mockResolvedValue([]),
}));

vi.mock('./core', () => ({
  getCurrentUserId: mockGetCurrentUserId,
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
    addSession.mockResolvedValue(undefined);
    clearStatistics.mockResolvedValue(undefined);
    mockGetCurrentUserId.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aggregates statistics from sessions and caches the result', async () => {
    vi.resetModules();
    const { getStatistics } = await import('./firestore');

    const stats = await getStatistics();

    // Current time is 2024-05-02T12:00:00Z
    // Sessions 2 and 3 are on the same day (9:00 and 12:00)
    // Session 4 (16:00) is in the future and may be filtered depending on implementation
    expect(stats).toEqual({
      totalHours: 2.8,
      totalSessions: 4,
      tacticsRating: 1520,
      winRate: 50,
      todayTotalTime: 105,
      todaySessions: 2,
    });

    expect(statisticsCacheSet).toHaveBeenCalledWith(stats);
    expect(setCachedStatistics).toHaveBeenCalledWith(stats);
  });
});

describe('createSession cloud durability mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addSession.mockResolvedValue(undefined);
    clearStatistics.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('awaits cloud write when awaitCloudWrite is true', async () => {
    mockGetCurrentUserId.mockReturnValue('uid-1');
    mockUpsertSessionToCloud.mockResolvedValue(undefined);
    vi.resetModules();
    const { createSession } = await import('./firestore');

    await createSession(
      {
        type: 'study',
        date: new Date('2024-05-01T10:00:00.000Z'),
        duration: 25,
      } as any,
      123,
      { awaitCloudWrite: true },
    );

    expect(addSession).toHaveBeenCalled();
    expect(mockUpsertSessionToCloud).toHaveBeenCalledTimes(1);
  });

  it('throws when durable cloud write fails but keeps local write', async () => {
    mockGetCurrentUserId.mockReturnValue('uid-1');
    mockUpsertSessionToCloud.mockRejectedValue(new Error('cloud failed'));
    vi.resetModules();
    const { createSession } = await import('./firestore');

    await expect(
      createSession(
        {
          type: 'study',
          date: new Date('2024-05-01T10:00:00.000Z'),
          duration: 25,
        } as any,
        124,
        { awaitCloudWrite: true },
      ),
    ).rejects.toThrow('Failed to save session offline');

    expect(addSession).toHaveBeenCalled();
    expect(mockUpsertSessionToCloud).toHaveBeenCalledTimes(1);
  });
});
