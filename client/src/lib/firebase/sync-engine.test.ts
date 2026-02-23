import { describe, expect, it } from 'vitest';
import type { TrainingSession } from '@shared/schema';
import { mergeSessionCollections } from './sync-engine';

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
});
