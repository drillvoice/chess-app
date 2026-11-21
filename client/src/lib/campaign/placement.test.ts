import { describe, expect, it } from 'vitest';
import {
  isPlacementNodeId,
  placementNodeId,
  placementRoundEnd,
  startingChapterIndex,
} from './placement';
import { CAMPAIGN } from './chapters';
import { normalizeAttempt } from './attempts';

describe('placementRoundEnd', () => {
  it('passes as soon as 4 are solved', () => {
    expect(placementRoundEnd({ attempted: 4, clean: 4 })).toBe('completed');
    expect(placementRoundEnd({ attempted: 5, clean: 4 })).toBe('completed');
  });
  it('stops once a pass is out of reach', () => {
    expect(placementRoundEnd({ attempted: 2, clean: 1 })).toBeNull();
    expect(placementRoundEnd({ attempted: 2, clean: 0 })).toBe('ended');
    expect(placementRoundEnd({ attempted: 5, clean: 3 })).toBe('ended');
  });
});

describe('placement ids', () => {
  it('recognises placement rounds for real chapters only', () => {
    expect(isPlacementNodeId(placementNodeId('advanced'))).toBe(true);
    expect(isPlacementNodeId('placement:nowhere')).toBe(false);
    expect(isPlacementNodeId('advanced:fork')).toBe(false);
  });
  it('lets placement rounds through attempt validation', () => {
    const attempt = normalizeAttempt({
      id: 'r1',
      nodeId: placementNodeId('beginner'),
      startedAt: '2026-11-01T10:00:00.000Z',
      durationMs: 60_000,
      attempted: 4,
      clean: 4,
      completedMs: 60_000,
    });
    expect(attempt?.nodeId).toBe('placement:beginner');
    // A completion time only means something for a full trial.
    expect(attempt?.completedMs).toBeNull();
  });
});

describe('startingChapterIndex', () => {
  it('starts one chapter above the last round passed, capped at the last chapter', () => {
    expect(startingChapterIndex(-1)).toBe(0);
    expect(startingChapterIndex(1)).toBe(2);
    expect(startingChapterIndex(CAMPAIGN.length - 1)).toBe(CAMPAIGN.length - 1);
  });
});
