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
    expect(result.sessionsToUpload.map((s) => s.id)).toEqual([1]);
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
    expect(result.sessionsToUpload).toEqual([]);
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
    expect(result.sessionsToUpload.map((s) => s.id)).toEqual([1]);
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
    expect(result.sessionsToUpload).toEqual([]);
  });

  it('re-uploads a local edit the cloud never received', () => {
    // The mistake tag / archive case: the phone wrote the edit locally but its
    // fire-and-forget cloud write was skipped or failed, so the cloud still
    // holds the pre-edit copy. Recency keeps the local copy, and the snapshot
    // has to push it or the edit never leaves the device.
    const local = [
      makeSession(7, '2025-01-01T10:00:00.000Z', '2025-01-05T10:00:00.000Z', {
        mistakeTags: JSON.stringify(['hung a piece']),
        needsReview: false,
      }),
    ];
    const remote = [
      makeSession(7, '2025-01-01T10:00:00.000Z', '2025-01-02T10:00:00.000Z', {
        mistakeTags: JSON.stringify([]),
        needsReview: true,
      }),
    ];

    const result = reconcileRealtimeSnapshot(local, remote);

    expect(result.nextLocal[0].needsReview).toBe(false);
    expect(result.sessionsToUpload.map((s) => s.id)).toEqual([7]);
  });

  it('does not re-upload once the cloud has caught up', () => {
    // The echo of the upload above: both sides now carry the same updatedAt, so
    // the comparison must be strict or every snapshot would queue another write.
    const local = [makeSession(7, '2025-01-01T10:00:00.000Z', '2025-01-05T10:00:00.000Z')];
    const remote = [makeSession(7, '2025-01-01T10:00:00.000Z', '2025-01-05T10:00:00.000Z')];

    const result = reconcileRealtimeSnapshot(local, remote);

    expect(result.sessionsToUpload).toEqual([]);
  });

  it('uploads a local tombstone the cloud has not heard about', () => {
    // The delete's own cloud write was skipped or failed. The local row keeps a
    // deletedAt marker precisely so this pass can push it — without that the
    // cloud copy below would be merged straight back in and the delete undone.
    const deletedAt = new Date('2025-01-05T10:00:00.000Z');
    const local = [
      makeSession(3, '2025-01-01T10:00:00.000Z', '2025-01-05T10:00:00.000Z', {
        deletedAt,
      } as Partial<TrainingSession>),
    ];
    const remote = [makeSession(3, '2025-01-01T10:00:00.000Z', '2025-01-02T10:00:00.000Z')];

    const result = reconcileRealtimeSnapshot(local, remote);

    expect(result.sessionsToUpload.map((s) => s.id)).toEqual([3]);
    expect((result.sessionsToUpload[0] as { deletedAt?: Date }).deletedAt).toEqual(deletedAt);
    expect(result.tombstonedIds).toEqual([]);
  });

  it('clears the local tombstone once the cloud carries the same one', () => {
    // The echo of the upload above. Both sides agree, so the row drops out of
    // nextLocal and setSessions deletes it for real — tombstones do not pile up.
    const deletedAt = new Date('2025-01-05T10:00:00.000Z');
    const local = [
      makeSession(3, '2025-01-01T10:00:00.000Z', '2025-01-05T10:00:00.000Z', {
        deletedAt,
      } as Partial<TrainingSession>),
    ];
    const remote = [
      makeSession(3, '2025-01-01T10:00:00.000Z', '2025-01-05T10:00:00.000Z', {
        deletedAt,
      } as Partial<TrainingSession>),
    ];

    const result = reconcileRealtimeSnapshot(local, remote);

    expect(result.nextLocal).toEqual([]);
    expect(result.sessionsToUpload).toEqual([]);
    expect(result.tombstonedIds).toEqual([3]);
  });

  it('normalizes local numeric string ids before deciding what to upload', () => {
    const local = [makeSession(12, '2025-01-01T10:00:00.000Z')] as any;
    local[0].id = '12';
    const remote = [makeSession(12, '2025-01-01T10:00:00.000Z')];

    const result = reconcileRealtimeSnapshot(local, remote);

    expect(result.nextLocal).toHaveLength(1);
    expect(result.nextLocal[0].id).toBe(12);
    expect(result.sessionsToUpload).toHaveLength(0);
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
    const studyPreferences = merged.studyPreferences as Record<string, unknown>;

    expect(studyPreferences.customTags).toEqual(['calculation', 'endgames', 'reading']);
    expect(studyPreferences.tagConfigs).toEqual({});
    expect(studyPreferences.lastModified).toEqual(cloud.studyPreferences.lastModified);
  });

  it('merges tag configs and prefers newer study preferences on key conflicts', () => {
    const local = {
      studyPreferences: {
        customTags: ['reading', 'chessable'],
        tagConfigs: {
          reading: { unitLabel: 'chapters', minutesPerUnit: 15 },
          chessable: { unitLabel: 'reps', minutesPerUnit: 0.25 },
        },
        lastModified: new Date('2026-02-18T10:00:00.000Z'),
      },
    };
    const cloud = {
      studyPreferences: {
        customTags: ['reading', 'chessable'],
        tagConfigs: {
          reading: { unitLabel: 'sections', minutesPerUnit: 12 },
        },
        lastModified: new Date('2026-02-20T10:00:00.000Z'),
      },
    };

    const merged = mergeSettingsForSync(local, cloud);
    const studyPreferences = merged.studyPreferences as Record<string, unknown>;

    expect(studyPreferences.tagConfigs).toEqual({
      chessable: { unitLabel: 'reps', minutesPerUnit: 0.25 },
      reading: { unitLabel: 'sections', minutesPerUnit: 12 },
    });
  });

  it('unions mistake tags instead of letting the newer document win', () => {
    const local = {
      studyPreferences: {
        customTags: ['reading'],
        customMistakeTags: ['hung a piece', 'time trouble'],
        tagConfigs: {},
        lastModified: new Date('2026-02-18T10:00:00.000Z'),
      },
    };
    const cloud = {
      studyPreferences: {
        customTags: ['reading'],
        customMistakeTags: ['missed a pin'],
        tagConfigs: {},
        lastModified: new Date('2026-02-20T10:00:00.000Z'),
      },
    };

    const merged = mergeSettingsForSync(local, cloud);
    const studyPreferences = merged.studyPreferences as Record<string, unknown>;

    expect(studyPreferences.customMistakeTags).toEqual([
      'hung a piece',
      'missed a pin',
      'time trouble',
    ]);
  });

  it('keeps local mistake tags when the cloud document predates the field', () => {
    const local = {
      studyPreferences: {
        customTags: ['reading'],
        customMistakeTags: ['hung a piece'],
        tagConfigs: {},
        lastModified: new Date('2026-02-18T10:00:00.000Z'),
      },
    };
    const cloud = {
      studyPreferences: {
        customTags: ['reading'],
        tagConfigs: {},
        lastModified: new Date('2026-02-20T10:00:00.000Z'),
      },
    };

    const merged = mergeSettingsForSync(local, cloud);
    const studyPreferences = merged.studyPreferences as Record<string, unknown>;

    expect(studyPreferences.customMistakeTags).toEqual(['hung a piece']);
  });

  it('leaves the mistake field absent when neither side has one', () => {
    const local = {
      studyPreferences: {
        customTags: ['reading'],
        tagConfigs: {},
        lastModified: new Date('2026-02-18T10:00:00.000Z'),
      },
    };
    const cloud = {
      studyPreferences: {
        customTags: ['reading'],
        tagConfigs: {},
        lastModified: new Date('2026-02-20T10:00:00.000Z'),
      },
    };

    const merged = mergeSettingsForSync(local, cloud);

    expect(merged.studyPreferences).not.toHaveProperty('customMistakeTags');
  });

  it('converts Firestore timestamps to Dates before the merged record is cached', () => {
    // A Timestamp survives the merge as a plain {seconds, nanoseconds} once
    // structured-cloned into IndexedDB, which the preferences schema rejects.
    const cloudTimestamp = {
      seconds: 1771581600,
      nanoseconds: 0,
      toDate: () => new Date('2026-02-20T10:00:00.000Z'),
    };
    const local = {
      studyPreferences: {
        customTags: ['reading'],
        customMistakeTags: ['hung a piece'],
        tagConfigs: {},
        lastModified: new Date('2026-02-18T10:00:00.000Z'),
      },
    };
    const cloud = {
      lastModified: cloudTimestamp,
      studyPreferences: {
        customTags: ['reading'],
        tagConfigs: {},
        lastModified: cloudTimestamp,
      },
    };

    const merged = mergeSettingsForSync(local, cloud);
    const studyPreferences = merged.studyPreferences as Record<string, unknown>;

    expect(merged.lastModified).toBeInstanceOf(Date);
    expect(studyPreferences.lastModified).toBeInstanceOf(Date);
    expect((studyPreferences.lastModified as Date).toISOString()).toBe('2026-02-20T10:00:00.000Z');
  });

  it('drops an unreadable timestamp rather than caching it', () => {
    const local = {
      studyPreferences: {
        customTags: ['reading'],
        tagConfigs: {},
        lastModified: { seconds: 1771581600, nanoseconds: 0 },
      },
    };

    const merged = mergeSettingsForSync(local, {});
    const studyPreferences = merged.studyPreferences as Record<string, unknown>;

    expect(studyPreferences).not.toHaveProperty('lastModified');
  });

  it('prunes tag configs for removed tags after merge', () => {
    const local = {
      studyPreferences: {
        customTags: ['reading'],
        tagConfigs: {
          reading: { unitLabel: 'chapters', minutesPerUnit: 15 },
          chessable: { unitLabel: 'variations', minutesPerUnit: 0.25 },
        },
        lastModified: new Date('2026-02-20T10:00:00.000Z'),
      },
    };
    const cloud = {
      studyPreferences: {
        customTags: ['reading'],
        tagConfigs: {
          reading: { unitLabel: 'chapters', minutesPerUnit: 15 },
        },
        lastModified: new Date('2026-02-20T10:00:00.000Z'),
      },
    };

    const merged = mergeSettingsForSync(local, cloud);
    const studyPreferences = merged.studyPreferences as Record<string, unknown>;

    expect(studyPreferences.tagConfigs).toEqual({
      reading: { unitLabel: 'chapters', minutesPerUnit: 15 },
    });
  });
});
