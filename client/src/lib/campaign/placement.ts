import { CAMPAIGN } from './chapters';

/**
 * Placement test: a ladder of short rounds, one per chapter's rating band,
 * each drawing mixed puzzles from that chapter's themes (like its boss).
 * A round is 5 puzzles in 2:30, which is ★★ trial pace, and passes with 4
 * clean. Passing a round unlocks the next chapter, so you start at the band
 * of the first round you fail. Lower chapters stay open to play but aren't
 * required. Placement only ever opens chapters; a worse retake locks nothing.
 *
 * Rounds are stored as ordinary campaign attempts under `placement:<chapterId>`,
 * so they sync with everything else.
 */
export const PLACEMENT_ROUND_SIZE = 5;
export const PLACEMENT_PASS = 4;
export const PLACEMENT_ROUND_MS = 150_000;

const PREFIX = 'placement:';

export function placementNodeId(chapterId: string): string {
  return `${PREFIX}${chapterId}`;
}

export function isPlacementNodeId(id: string): boolean {
  return id.startsWith(PREFIX) && CAMPAIGN.some((c) => c.id === id.slice(PREFIX.length));
}

export function placementRoundPassed(clean: number): boolean {
  return clean >= PLACEMENT_PASS;
}

/** End a round as soon as it is passed, or as soon as it can no longer be. */
export function placementRoundEnd(tally: {
  attempted: number;
  clean: number;
}): 'completed' | 'ended' | null {
  if (placementRoundPassed(tally.clean)) return 'completed';
  if (tally.attempted - tally.clean > PLACEMENT_ROUND_SIZE - PLACEMENT_PASS) return 'ended';
  return null;
}

/** Chapter index to start at after passing rounds 0..passedThrough (-1: none passed). */
export function startingChapterIndex(passedThrough: number): number {
  return Math.min(passedThrough + 1, CAMPAIGN.length - 1);
}
