import { describe, expect, it } from 'vitest';
import type { CampaignAttempt } from './attempts';
import { CAMPAIGN } from './chapters';
import {
  campaignProgress,
  currentChapterId,
  SET_SIZE,
  placementSummary,
  summarizeAttempts,
} from './progress';
import { placementNodeId } from './placement';

let n = 0;
function attempt(
  nodeId: string,
  clean: number,
  completedMs: number | null = null,
): CampaignAttempt {
  n += 1;
  return {
    id: `a${n}`,
    nodeId,
    startedAt: new Date(Date.UTC(2026, 10, 1, 0, n)).toISOString(),
    durationMs: completedMs ?? 300_000,
    attempted: clean + 2,
    clean,
    completedMs,
  };
}

const beginner = CAMPAIGN[0];
/** ★ on a node: cleared but not mastered. */
const oneStar = (id: string) => attempt(id, 6);
/** ★★: the full target inside the time limit. */
const twoStars = (id: string) => attempt(id, 10, 300_000);
/** ★★★: the full target inside the three-star time. */
const threeStars = (id: string) => attempt(id, 10, 200_000);
/** Pass every set in a chapter (★★ everywhere). */
const clearAll = (chapterIndex: number) =>
  CAMPAIGN[chapterIndex].nodes.map((node) => twoStars(node.id));
const ids = (from: number, to: number) => beginner.nodes.slice(from, to).map((node) => node.id);
const openIds = (status: Record<string, string>) =>
  beginner.nodes.filter((node) => status[node.id] === 'open').map((node) => node.id);

describe('summarizeAttempts', () => {
  it('keeps the best stars and pace per node', () => {
    const id = beginner.nodes[0].id;
    const summary = summarizeAttempts([
      attempt(id, 7),
      attempt(id, 10, 300_000),
      attempt(id, 4),
    ]).get(id)!;
    expect(summary.bestStars).toBe(2);
    expect(summary.bestPace).toBe(10);
    expect(summary.attempts).toBe(3);
  });
});

describe('campaignProgress', () => {
  it('starts with the first chapter open and only the first set playable', () => {
    const [first, second] = campaignProgress(new Map());
    expect(first.unlocked).toBe(true);
    expect(second.unlocked).toBe(false);
    expect(openIds(first.status)).toEqual(ids(0, SET_SIZE));
    expect(first.status[beginner.boss.id]).toBe('locked');
    expect(first.gate).toEqual({
      nodeIds: ids(0, SET_SIZE),
      stars: 0,
      starsNeeded: 6,
      uncleared: 3,
    });
  });

  it('keeps the next set shut while the current one is cleared on one star each', () => {
    const progress = summarizeAttempts(ids(0, SET_SIZE).map(oneStar));
    const [first] = campaignProgress(progress);
    expect(first.clearedCount).toBe(SET_SIZE);
    expect(openIds(first.status)).toEqual([]);
    expect(first.status[beginner.nodes[SET_SIZE].id]).toBe('locked');
    expect(first.gate).toMatchObject({ stars: 3, starsNeeded: 6, uncleared: 0 });
  });

  it('opens the next set once the current one averages two stars', () => {
    // ★★★ + ★★ + ★ = 6: a strong node carries a weak one.
    const [a, b, c] = ids(0, SET_SIZE);
    const [first] = campaignProgress(summarizeAttempts([threeStars(a), twoStars(b), oneStar(c)]));
    expect(openIds(first.status)).toEqual(ids(SET_SIZE, 2 * SET_SIZE));
    expect(first.gate?.nodeIds).toEqual(ids(SET_SIZE, 2 * SET_SIZE));
  });

  it('needs every node in the set cleared, whatever the star total', () => {
    const [a, b] = ids(0, SET_SIZE);
    const [first] = campaignProgress(summarizeAttempts([threeStars(a), threeStars(b)]));
    expect(first.gate).toMatchObject({ stars: 6, uncleared: 1 });
    expect(first.status[beginner.nodes[SET_SIZE].id]).toBe('locked');
  });

  it('keeps a node that was already cleared playable even if its set is shut', () => {
    const later = beginner.nodes[SET_SIZE].id;
    const [first] = campaignProgress(summarizeAttempts([oneStar(later)]));
    expect(first.status[later]).toBe('cleared');
    expect(first.status[beginner.nodes[SET_SIZE + 1].id]).toBe('locked');
  });

  it('does not count a zero-star attempt as a clear', () => {
    const progress = summarizeAttempts([attempt(beginner.nodes[0].id, 5)]);
    expect(campaignProgress(progress)[0].status[beginner.nodes[0].id]).toBe('open');
  });

  it('opens the boss once every set is passed, and needs two stars to beat it', () => {
    const allOneStar = beginner.nodes.map((node) => oneStar(node.id));
    expect(campaignProgress(summarizeAttempts(allOneStar))[0].status[beginner.boss.id]).toBe(
      'locked',
    );

    let chapters = campaignProgress(summarizeAttempts(clearAll(0)));
    expect(chapters[0].gate).toBeNull();
    expect(chapters[0].status[beginner.boss.id]).toBe('open');
    expect(chapters[1].unlocked).toBe(false);

    chapters = campaignProgress(summarizeAttempts([...clearAll(0), attempt(beginner.boss.id, 9)]));
    expect(chapters[0].bossBeaten).toBe(false);

    chapters = campaignProgress(
      summarizeAttempts([...clearAll(0), attempt(beginner.boss.id, 10, 280_000)]),
    );
    expect(chapters[0].bossBeaten).toBe(true);
    expect(chapters[1].unlocked).toBe(true);
    expect(currentChapterId(chapters)).toBe(CAMPAIGN[1].id);
  });

  it('keeps later chapters locked even with stray attempts in them', () => {
    const progress = summarizeAttempts([attempt(CAMPAIGN[1].nodes[0].id, 10, 100_000)]);
    const chapters = campaignProgress(progress);
    expect(chapters[1].unlocked).toBe(false);
    expect(chapters[1].stars).toBe(0);
    expect(currentChapterId(chapters)).toBe(CAMPAIGN[0].id);
  });

  it('opens chapters up to one past the highest placement round passed', () => {
    const progress = summarizeAttempts([
      attempt(placementNodeId('beginner'), 4),
      attempt(placementNodeId('easy'), 5),
      attempt(placementNodeId('intermediate'), 2),
    ]);
    const chapters = campaignProgress(progress);
    expect(chapters.map((c) => c.unlocked)).toEqual([true, true, true, false, false]);
    expect(chapters.map((c) => c.skippedByPlacement)).toEqual([true, true, false, false, false]);
    expect(currentChapterId(chapters)).toBe('intermediate');
    expect(placementSummary(progress)).toEqual({ taken: true, passedThrough: 1 });
    // Skipped chapters still start with their first set open.
    expect(chapters[0].status[CAMPAIGN[0].nodes[0].id]).toBe('open');
  });

  it('never locks anything because of a failed or worse retake', () => {
    const chapters = campaignProgress(
      summarizeAttempts([
        attempt(placementNodeId('beginner'), 4),
        attempt(placementNodeId('beginner'), 1),
      ]),
    );
    expect(chapters[1].unlocked).toBe(true);
  });

  it('continues the normal chain after the placed chapter', () => {
    const placed = 2; // passed Beginner and Easy rounds
    const progress = summarizeAttempts([
      attempt(placementNodeId('beginner'), 4),
      attempt(placementNodeId('easy'), 4),
      ...clearAll(placed),
      attempt(CAMPAIGN[placed].boss.id, 10, 250_000),
    ]);
    const chapters = campaignProgress(progress);
    expect(chapters[placed + 1].unlocked).toBe(true);
    expect(chapters[placed + 2].unlocked).toBe(false);
  });
});
