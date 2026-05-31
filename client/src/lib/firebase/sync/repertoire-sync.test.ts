import { describe, expect, it } from 'vitest';
import type { OpeningRepertoire } from '../../opening-trainer/types';
import {
  deserializeRepertoireFromCloud,
  reconcileRepertoireSnapshot,
  serializeRepertoireForCloud,
  type RemoteRepertoire,
} from './repertoire-sync';

function makeRepertoire(overrides: Partial<OpeningRepertoire> = {}): OpeningRepertoire {
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
        fenAfter: 'after-e4',
        san: 'e4',
        uci: 'e2e4',
        from: 'e2',
        to: 'e4',
        ply: 1,
        children: [],
      },
    },
    stats: { n1: { attempts: 3, misses: 1, streak: 2, lastSeenAt: '2026-05-01T00:00:00.000Z' } },
    ...overrides,
  };
}

describe('repertoire cloud serialization', () => {
  it('round-trips a repertoire through serialize/deserialize', () => {
    const repertoire = makeRepertoire();
    const serialized = serializeRepertoireForCloud(repertoire);

    // The tree and stats travel as JSON strings to dodge Firestore key rules.
    expect(typeof serialized.nodes).toBe('string');
    expect(typeof serialized.stats).toBe('string');

    const restored = deserializeRepertoireFromCloud({ ...serialized });
    expect(restored.nodes).toEqual(repertoire.nodes);
    expect(restored.stats).toEqual(repertoire.stats);
    expect(restored.side).toBe('black');
    expect(restored.deletedAt).toBeUndefined();
  });

  it('reads a Firestore Timestamp deletedAt as an ISO tombstone', () => {
    const restored = deserializeRepertoireFromCloud({
      id: 'rep-1',
      name: 'X',
      side: 'white',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
      nodes: '{}',
      stats: '{}',
      deletedAt: { toDate: () => new Date('2026-05-03T00:00:00.000Z') },
    });
    expect(restored.deletedAt).toBe('2026-05-03T00:00:00.000Z');
  });
});

describe('reconcileRepertoireSnapshot', () => {
  it('downloads cloud-only repertoires', () => {
    const remote = makeRepertoire({ id: 'cloud-only' }) as RemoteRepertoire;
    const { nextLocal, localOnlyToUpload, tombstonedIds } = reconcileRepertoireSnapshot(
      [],
      [remote],
    );

    expect(nextLocal.map((r) => r.id)).toEqual(['cloud-only']);
    expect(localOnlyToUpload).toHaveLength(0);
    expect(tombstonedIds).toHaveLength(0);
  });

  it('flags local-only repertoires for upload while keeping them', () => {
    const local = makeRepertoire({ id: 'local-only' });
    const { nextLocal, localOnlyToUpload } = reconcileRepertoireSnapshot([local], []);

    expect(nextLocal.map((r) => r.id)).toEqual(['local-only']);
    expect(localOnlyToUpload.map((r) => r.id)).toEqual(['local-only']);
  });

  it('resolves conflicts with the newest updatedAt (last-write-wins)', () => {
    const local = makeRepertoire({ name: 'Local', updatedAt: '2026-05-05T00:00:00.000Z' });
    const remote = makeRepertoire({
      name: 'Cloud',
      updatedAt: '2026-05-10T00:00:00.000Z',
    }) as RemoteRepertoire;

    const { nextLocal } = reconcileRepertoireSnapshot([local], [remote]);
    expect(nextLocal).toHaveLength(1);
    expect(nextLocal[0].name).toBe('Cloud');
  });

  it('removes a local repertoire when the cloud has a newer tombstone', () => {
    const local = makeRepertoire({ updatedAt: '2026-05-01T00:00:00.000Z' });
    const tombstone: RemoteRepertoire = {
      ...makeRepertoire(),
      updatedAt: '2026-05-02T00:00:00.000Z',
      deletedAt: '2026-05-02T00:00:00.000Z',
    };

    const { nextLocal, tombstonedIds } = reconcileRepertoireSnapshot([local], [tombstone]);
    expect(nextLocal).toHaveLength(0);
    expect(tombstonedIds).toEqual(['rep-1']);
  });

  it('resurrects a repertoire edited after the cloud tombstone', () => {
    const local = makeRepertoire({ updatedAt: '2026-05-09T00:00:00.000Z' });
    const tombstone: RemoteRepertoire = {
      ...makeRepertoire(),
      updatedAt: '2026-05-02T00:00:00.000Z',
      deletedAt: '2026-05-02T00:00:00.000Z',
    };

    const { nextLocal, localOnlyToUpload, tombstonedIds } = reconcileRepertoireSnapshot(
      [local],
      [tombstone],
    );
    expect(nextLocal.map((r) => r.id)).toEqual(['rep-1']);
    expect(localOnlyToUpload.map((r) => r.id)).toEqual(['rep-1']);
    expect(tombstonedIds).toHaveLength(0);
  });
});
