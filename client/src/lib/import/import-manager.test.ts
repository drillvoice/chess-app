import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSessions,
  mockSetSettings,
  mockSetStatistics,
  mockCreateSession,
  mockSetDailyGoalSettings,
} = vi.hoisted(() => ({
  mockGetSessions: vi.fn(),
  mockSetSettings: vi.fn(),
  mockSetStatistics: vi.fn(),
  mockCreateSession: vi.fn(),
  mockSetDailyGoalSettings: vi.fn(),
}));

vi.mock('../offline-storage', () => ({
  offlineStorage: {
    getSessions: mockGetSessions,
    setSettings: mockSetSettings,
    setStatistics: mockSetStatistics,
  },
}));

vi.mock('../firebase/firestore', () => ({
  createSession: mockCreateSession,
  setDailyGoalSettings: mockSetDailyGoalSettings,
}));

import { ImportManager } from './import-manager';

const defaultOptions = {
  conflictResolution: 'skip' as const,
  validateSchema: true,
  createBackup: false,
  dryRun: false,
};

describe('ImportManager backup imports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessions.mockResolvedValue([]);
    mockSetSettings.mockResolvedValue(undefined);
    mockSetStatistics.mockResolvedValue(undefined);
    mockCreateSession.mockResolvedValue(undefined);
    mockSetDailyGoalSettings.mockResolvedValue(undefined);
  });

  it('restores statistics when importing backup format data', async () => {
    const manager = new ImportManager();
    vi.spyOn(manager as any, 'validateBackupChecksum').mockResolvedValue(true);

    const payload = JSON.stringify({
      trainingSessions: [],
      statistics: { totalSessions: 4, totalHours: 2.5 },
      backup: {
        format: 'chess-training-backup-v2',
        checksum: 'ok',
      },
    });

    const result = await manager.importData(payload, defaultOptions);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(mockSetStatistics).toHaveBeenCalledWith({ totalSessions: 4, totalHours: 2.5 });
  });

  it('does not write statistics during dry-run imports', async () => {
    const manager = new ImportManager();
    vi.spyOn(manager as any, 'validateBackupChecksum').mockResolvedValue(true);

    const payload = JSON.stringify({
      trainingSessions: [],
      statistics: { totalSessions: 9 },
      backup: {
        format: 'chess-training-backup-v2',
        checksum: 'ok',
      },
    });

    await manager.importData(payload, { ...defaultOptions, dryRun: true });

    expect(mockSetStatistics).not.toHaveBeenCalled();
  });

  it('skips duplicate sessions when conflict resolution is ask', async () => {
    const manager = new ImportManager();
    mockGetSessions.mockResolvedValue([
      {
        id: 42,
        type: 'study',
        date: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);

    const payload = JSON.stringify({
      trainingSessions: [
        {
          id: 42,
          type: 'study',
          date: '2024-02-01T00:00:00.000Z',
        },
      ],
    });

    const result = await manager.importData(payload, {
      ...defaultOptions,
      conflictResolution: 'ask',
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(1);
    expect(result.imported.sessions).toBe(0);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('imports new sessions with durable cloud write enabled', async () => {
    const manager = new ImportManager();
    const payload = JSON.stringify({
      trainingSessions: [
        {
          id: 100,
          type: 'study',
          date: '2024-02-01T00:00:00.000Z',
          duration: 20,
        },
      ],
    });

    const result = await manager.importData(payload, defaultOptions);

    expect(result.success).toBe(true);
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'study', duration: 20 }),
      100,
      { awaitCloudWrite: true },
    );
  });

  it('reports import errors when durable cloud write fails', async () => {
    mockCreateSession.mockRejectedValueOnce(new Error('Failed to sync created session to cloud'));
    const manager = new ImportManager();
    const payload = JSON.stringify({
      trainingSessions: [
        {
          id: 101,
          type: 'study',
          date: '2024-02-01T00:00:00.000Z',
          duration: 20,
        },
      ],
    });

    const result = await manager.importData(payload, defaultOptions);

    expect(result.success).toBe(false);
    expect(result.imported.sessions).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Failed to import session 101');
  });

  it('uses durable cloud write when overwriting an existing session', async () => {
    const manager = new ImportManager();
    mockGetSessions.mockResolvedValue([
      {
        id: 42,
        type: 'study',
        date: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);

    const payload = JSON.stringify({
      trainingSessions: [
        {
          id: 42,
          type: 'study',
          date: '2024-02-01T00:00:00.000Z',
          duration: 25,
        },
      ],
    });

    const result = await manager.importData(payload, {
      ...defaultOptions,
      conflictResolution: 'overwrite',
    });

    expect(result.success).toBe(true);
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'study', duration: 25 }),
      42,
      { awaitCloudWrite: true },
    );
  });
});
