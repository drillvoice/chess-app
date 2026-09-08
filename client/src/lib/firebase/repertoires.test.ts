import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpeningRepertoire } from '../opening-trainer/types';
import type { RemoteRepertoire } from './sync/repertoire-sync';
import { listCloudRepertoires, restoreCloudRepertoire } from './repertoires';

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn<() => string | null>(),
  fetchCloudRepertoires: vi.fn<(uid: string) => Promise<RemoteRepertoire[]>>(),
  announceRepertoiresMerged: vi.fn(),
  upsertRepertoireToCloud: vi.fn().mockResolvedValue(undefined),
  markRepertoireDeletedInCloud: vi.fn().mockResolvedValue(undefined),
  reportRepertoireSyncFailure: vi.fn(),
  getOpeningRepertoires: vi.fn<() => Promise<OpeningRepertoire[]>>(),
  saveOpeningRepertoire: vi.fn(),
  deleteOpeningRepertoire: vi.fn(),
}));

vi.mock('./core', () => ({
  ensureFirebase: vi.fn().mockResolvedValue(undefined),
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock('./sync-engine', () => ({
  announceRepertoiresMerged: mocks.announceRepertoiresMerged,
  fetchCloudRepertoires: mocks.fetchCloudRepertoires,
  markRepertoireDeletedInCloud: mocks.markRepertoireDeletedInCloud,
  reportRepertoireSyncFailure: mocks.reportRepertoireSyncFailure,
  upsertRepertoireToCloud: mocks.upsertRepertoireToCloud,
}));

vi.mock('../offline-storage', () => ({
  offlineStorage: {
    getOpeningRepertoires: mocks.getOpeningRepertoires,
    saveOpeningRepertoire: mocks.saveOpeningRepertoire,
    deleteOpeningRepertoire: mocks.deleteOpeningRepertoire,
  },
}));

function makeRemote(overrides: Partial<RemoteRepertoire> = {}): RemoteRepertoire {
  return {
    id: 'rep-1',
    name: 'Caro-Kann',
    side: 'black',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    rootNodeId: 'root',
    nodes: {
      root: {
        id: 'root',
        parentId: null,
        fenBefore: 'start',
        fenAfter: 'start',
        san: '',
        uci: '',
        from: 'a1',
        to: 'a1',
        ply: 0,
        children: ['n1'],
      },
      n1: {
        id: 'n1',
        parentId: 'root',
        fenBefore: 'start',
        fenAfter: 'after-c6',
        san: 'c6',
        uci: 'c7c6',
        from: 'c7',
        to: 'c6',
        ply: 1,
        children: [],
      },
    },
    stats: {},
    ...overrides,
  };
}

describe('listCloudRepertoires', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserId.mockReturnValue('uid-1');
    mocks.getOpeningRepertoires.mockResolvedValue([]);
  });

  it('returns null when nobody is signed in', async () => {
    mocks.getCurrentUserId.mockReturnValue(null);
    await expect(listCloudRepertoires()).resolves.toBeNull();
    expect(mocks.fetchCloudRepertoires).not.toHaveBeenCalled();
  });

  it('reports a tombstoned cloud repertoire the device no longer holds', async () => {
    mocks.fetchCloudRepertoires.mockResolvedValue([
      makeRemote({ deletedAt: '2026-05-02T00:00:00.000Z' }),
    ]);

    const records = await listCloudRepertoires();

    expect(records).toHaveLength(1);
    expect(records![0]).toMatchObject({
      id: 'rep-1',
      name: 'Caro-Kann',
      moveCount: 1,
      deletedAt: '2026-05-02T00:00:00.000Z',
      presentLocally: false,
    });
  });

  it('marks repertoires this device already holds', async () => {
    mocks.fetchCloudRepertoires.mockResolvedValue([makeRemote()]);
    mocks.getOpeningRepertoires.mockResolvedValue([makeRemote() as OpeningRepertoire]);

    const records = await listCloudRepertoires();
    expect(records![0].presentLocally).toBe(true);
    expect(records![0].deletedAt).toBeUndefined();
  });

  it('sorts newest first', async () => {
    mocks.fetchCloudRepertoires.mockResolvedValue([
      makeRemote({ id: 'old', updatedAt: '2026-05-01T00:00:00.000Z' }),
      makeRemote({ id: 'new', updatedAt: '2026-06-01T00:00:00.000Z' }),
    ]);

    const records = await listCloudRepertoires();
    expect(records!.map((r) => r.id)).toEqual(['new', 'old']);
  });
});

describe('restoreCloudRepertoire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserId.mockReturnValue('uid-1');
    mocks.getOpeningRepertoires.mockResolvedValue([]);
    mocks.saveOpeningRepertoire.mockImplementation(async (repertoire: OpeningRepertoire) => ({
      ...repertoire,
      updatedAt: '2026-07-01T00:00:00.000Z',
    }));
  });

  it('strips the tombstone and re-uploads, so other devices stop hiding it', async () => {
    mocks.fetchCloudRepertoires.mockResolvedValue([
      makeRemote({ deletedAt: '2026-05-02T00:00:00.000Z' }),
    ]);

    const restored = await restoreCloudRepertoire('rep-1');

    expect(restored).not.toHaveProperty('deletedAt');
    expect(mocks.saveOpeningRepertoire).toHaveBeenCalledWith(
      expect.not.objectContaining({ deletedAt: expect.anything() }),
    );
    // The re-upload is what clears `deletedAt` in Firestore.
    expect(mocks.upsertRepertoireToCloud).toHaveBeenCalledWith(restored);
    expect(mocks.announceRepertoiresMerged).toHaveBeenCalled();
  });

  it('fails loudly when the id is not in the cloud', async () => {
    mocks.fetchCloudRepertoires.mockResolvedValue([]);
    await expect(restoreCloudRepertoire('missing')).rejects.toThrow(/no longer in the cloud/);
  });

  it('fails loudly when signed out', async () => {
    mocks.getCurrentUserId.mockReturnValue(null);
    await expect(restoreCloudRepertoire('rep-1')).rejects.toThrow(/Sign in/);
  });
});
