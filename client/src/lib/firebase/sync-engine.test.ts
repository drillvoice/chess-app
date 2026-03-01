import { describe, expect, it } from 'vitest';
import type { TrainingSession } from '@shared/schema';
import {
  mergeSessionCollections,
  mergeSettingsForSync,
  reconcileRealtimeSnapshot,
} from './sync-engine';

function makeSession(
  id: number,
  date: string,
  updatedAt?: string,
  overrides: Partial<TrainingSession> = {},
): TrainingSession {
  return {
    id,
    type: 'study',
    date: new Date(date),
    duration: 30,
    needsReview: false,
    studyTags: [],
    quantity: null,
    primaryStudyTag: null,
    createdAt: new Date(date),
    updatedAt: updatedAt ? new Date(updatedAt) : undefined,
    ...overrides,
  } as TrainingSession;
}

describe('mergeSessionCollections', () => {
  it('combines two non-overlapping collections', () => {
    const local = [makeSession(1, '2025-01-01T10:00:00.000Z')];
    const cloud = [makeSession(2, '2025-01-02T10:00:00.000Z')];

    const result = mergeSessionCollections(local, cloud);

    expect(result.merged.map((s) => s.id).sort()).toEqual([1, 2]);
    expect(result.collisionsResolved).toBe(0);
  });

  it('prefers local when local updatedAt is newer', () => {
    const local = [makeSession(1, '2025-01-01T10:00:00.000Z', '2025-01-03T10:00:00.000Z')];
    const cloud = [
      makeSession(1, '2025-01-01T10:00:00.000Z', '2025-01-02T10:00:00.000Z', { duration: 10 }),
    ];

    const result = mergeSessionCollections(local, cloud);

    expect(result.merged[0].duration).toBe(30);
    expect(result.collisionsResolved).toBe(1);
  });

  it('prefers cloud when cloud updatedAt is newer', () => {
    const local = [
      makeSession(1, '2025-01-01T10:00:00.000Z', '2025-01-02T10:00:00.000Z', { duration: 10 }),
    ];
    const cloud = [makeSession(1, '2025-01-01T10:00:00.000Z', '2025-01-03T10:00:00.000Z')];

    const result = mergeSessionCollections(local, cloud);

    expect(result.merged[0].duration).toBe(30);
    expect(result.collisionsResolved).toBe(1);
  });

  it('falls back to date when updatedAt is missing', () => {
    const local = [makeSession(1, '2025-01-01T10:00:00.000Z', undefined, { duration: 10 })];
    const cloud = [makeSession(1, '2025-01-02T10:00:00.000Z')];

    const result = mergeSessionCollections(local, cloud);

    expect(result.merged[0].duration).toBe(30);
    expect(result.collisionsResolved).toBe(1);
  });

  it('normalizes numeric string ids and resolves collisions correctly', () => {
    const local = [makeSession(9, '2025-01-01T10:00:00.000Z', '2025-01-01T10:00:00.000Z')] as any;
    local[0].id = '9';
    const cloud = [makeSession(9, '2025-01-01T10:00:00.000Z', '2025-01-02T10:00:00.000Z')];

    const result = mergeSessionCollections(local, cloud);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].id).toBe(9);
    expect(result.collisionsResolved).toBe(1);
  });
});

describe('reconcileRealtimeSnapshot', () => {
  it('keeps local-only sessions and marks them for upload', () => {
    const local = [makeSession(1, '2025-01-01T10:00:00.000Z')];
    const remote = [makeSession(2, '2025-01-02T10:00:00.000Z')];

    const result = reconcileRealtimeSnapshot(local, remote);

    expect(result.nextLocal.map((s) => s.id).sort()).toEqual([1, 2]);
    expect(result.localOnlyToUpload.map((s) => s.id)).toEqual([1]);
    expect(result.tombstonedIds).toEqual([]);
  });

  it('removes local sessions that are tombstoned in cloud', () => {
    const local = [makeSession(1, '2025-01-01T10:00:00.000Z')];
    const remote = [
      makeSession(1, '2025-01-01T10:00:00.000Z', '2025-01-02T10:00:00.000Z', {
        deletedAt: new Date('2025-01-03T10:00:00.000Z'),
      } as any),
    ];

    const result = reconcileRealtimeSnapshot(local, remote);

    expect(result.nextLocal).toEqual([]);
    expect(result.localOnlyToUpload).toEqual([]);
    expect(result.tombstonedIds).toEqual([1]);
  });

  it('resurrects local session when it is newer than cloud tombstone', () => {
    const local = [makeSession(1, '2025-01-01T10:00:00.000Z', '2025-01-04T10:00:00.000Z')];
    const remote = [
      makeSession(1, '2025-01-01T10:00:00.000Z', '2025-01-02T10:00:00.000Z', {
        deletedAt: new Date('2025-01-03T10:00:00.000Z'),
      } as any),
    ];

    const result = reconcileRealtimeSnapshot(local, remote);

    expect(result.nextLocal).toHaveLength(1);
    expect(result.nextLocal[0].id).toBe(1);
    expect(result.localOnlyToUpload.map((s) => s.id)).toEqual([1]);
    expect(result.tombstonedIds).toEqual([]);
  });

  it('applies recency conflict resolution before backfill selection', () => {
    const local = [
      makeSession(5, '2025-01-01T10:00:00.000Z', '2025-01-01T10:00:00.000Z', {
        duration: 10,
      }),
    ];
    const remote = [
      makeSession(5, '2025-01-01T10:00:00.000Z', '2025-01-03T10:00:00.000Z', {
        duration: 45,
      }),
    ];

    const result = reconcileRealtimeSnapshot(local, remote);

    expect(result.nextLocal).toHaveLength(1);
    expect(result.nextLocal[0].duration).toBe(45);
    expect(result.localOnlyToUpload).toEqual([]);
  });

  it('normalizes local numeric string ids before deciding what to upload', () => {
    const local = [makeSession(12, '2025-01-01T10:00:00.000Z')] as any;
    local[0].id = '12';
    const remote = [makeSession(12, '2025-01-01T10:00:00.000Z')];

    const result = reconcileRealtimeSnapshot(local, remote);

    expect(result.nextLocal).toHaveLength(1);
    expect(result.nextLocal[0].id).toBe(12);
    expect(result.localOnlyToUpload).toHaveLength(0);
  });
});

describe('mergeSettingsForSync', () => {
  it('keeps local study preferences when cloud settings are missing them', () => {
    const local = {
      studyPreferences: {
        customTags: ['reading', 'middle game'],
        tagConfigs: {},
        lastModified: new Date('2026-02-20T10:00:00.000Z'),
      },
    };
    const cloud = {
      lichessUsername: 'cloud-user',
    };

    const merged = mergeSettingsForSync(local, cloud);

    expect(merged.lichessUsername).toBe('cloud-user');
    expect(merged.studyPreferences).toEqual({
      ...local.studyPreferences,
      customTags: ['middle game', 'reading'],
      tagConfigs: {},
    });
  });

  it('prefers newer local study preferences over stale cloud study preferences', () => {
    const local = {
      studyPreferences: {
        customTags: ['reading', 'calculation'],
        tagConfigs: {},
        lastModified: new Date('2026-02-20T10:00:00.000Z'),
      },
    };
    const cloud = {
      studyPreferences: {
        customTags: ['reading'],
        tagConfigs: {},
        lastModified: new Date('2026-02-18T10:00:00.000Z'),
      },
      lastModified: new Date('2026-02-18T10:00:00.000Z'),
    };

    const merged = mergeSettingsForSync(local, cloud);

    expect(merged.studyPreferences).toEqual({
      ...local.studyPreferences,
      customTags: ['calculation', 'reading'],
      tagConfigs: {},
    });
  });

  it('prefers cloud study preferences when they are newer', () => {
    const local = {
      studyPreferences: {
        customTags: ['reading'],
        tagConfigs: {},
        lastModified: new Date('2026-02-18T10:00:00.000Z'),
      },
    };
    const cloud = {
      studyPreferences: {
        customTags: ['reading', 'endgames'],
        tagConfigs: {},
        lastModified: new Date('2026-02-20T10:00:00.000Z'),
      },
    };

    const merged = mergeSettingsForSync(local, cloud);

    expect(merged.studyPreferences).toEqual({
      ...cloud.studyPreferences,
      customTags: ['endgames', 'reading'],
      tagConfigs: {},
    });
  });

  it('unions custom tags across local and cloud study preferences', () => {
    const local = {
      studyPreferences: {
        customTags: ['reading', 'calculation'],
        tagConfigs: {},
        lastModified: new Date('2026-02-18T10:00:00.000Z'),
      },
    };
    const cloud = {
      studyPreferences: {
        customTags: ['Reading', 'endgames'],
        tagConfigs: {},
        lastModified: new Date('2026-02-20T10:00:00.000Z'),
      },
    };

    const merged = mergeSettingsForSync(local, cloud);

    expect(merged.studyPreferences.customTags).toEqual(['calculation', 'endgames', 'reading']);
    expect(merged.studyPreferences.tagConfigs).toEqual({});
    expect(merged.studyPreferences.lastModified).toEqual(cloud.studyPreferences.lastModified);
  });

  it('merges tag configs and prefers newer study preferences on key conflicts', () => {
    const local = {
      studyPreferences: {
        customTags: ['reading', 'chessable'],
        tagConfigs: {
          reading: { unitLabel: 'chapters' },
          chessable: { unitLabel: 'reps' },
        },
        lastModified: new Date('2026-02-18T10:00:00.000Z'),
      },
    };
    const cloud = {
      studyPreferences: {
        customTags: ['reading', 'chessable'],
        tagConfigs: {
          reading: { unitLabel: 'sections' },
        },
        lastModified: new Date('2026-02-20T10:00:00.000Z'),
      },
    };

    const merged = mergeSettingsForSync(local, cloud);

    expect(merged.studyPreferences.tagConfigs).toEqual({
      chessable: { unitLabel: 'reps' },
      reading: { unitLabel: 'sections' },
    });
  });

  it('prunes tag configs for removed tags after merge', () => {
    const local = {
      studyPreferences: {
        customTags: ['reading'],
        tagConfigs: {
          reading: { unitLabel: 'chapters' },
          chessable: { unitLabel: 'variations' },
        },
        lastModified: new Date('2026-02-20T10:00:00.000Z'),
      },
    };
    const cloud = {
      studyPreferences: {
        customTags: ['reading'],
        tagConfigs: {
          reading: { unitLabel: 'chapters' },
        },
        lastModified: new Date('2026-02-20T10:00:00.000Z'),
      },
    };

    const merged = mergeSettingsForSync(local, cloud);

    expect(merged.studyPreferences.tagConfigs).toEqual({
      reading: { unitLabel: 'chapters' },
    });
  });
});
