import { describe, expect, it } from 'vitest';
import type { CampaignAttempt } from './attempts';
import { CAMPAIGN } from './chapters';
import {
  campaignProgress,
  currentChapterId,
  OPEN_WINDOW,
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
const clearAll = (chapterIndex: number) =>
  CAMPAIGN[chapterIndex].nodes.map((node) => attempt(node.id, 6));

describe('summarizeAttempts', () => {
  it('keeps the best stars and pace per node', () => {
    const id = beginner.nodes[0].id;
    const summary = summarizeAttempts([
      attempt(id, 7),
      attempt(id, 10, 200_000),
      attempt(id, 4),
    ]).get(id)!;
    expect(summary.bestStars).toBe(2);
    expect(summary.bestPace).toBe(15);
    expect(summary.attempts).toBe(3);
  });
});

describe('campaignProgress', () => {
  it('starts with the first chapter open and a window of nodes', () => {
    const [first, second] = campaignProgress(new Map());
    expect(first.unlocked).toBe(true);
    expect(second.unlocked).toBe(false);
    const open = first.chapter.nodes.filter((node) => first.status[node.id] === 'open');
    expect(open.map((node) => node.id)).toEqual(
      beginner.nodes.slice(0, OPEN_WINDOW).map((node) => node.id),
    );
    expect(first.status[beginner.boss.id]).toBe('locked');
  });

  it('opens the next node as one is cleared, keeping the window size', () => {
    const progress = summarizeAttempts([attempt(beginner.nodes[1].id, 6)]);
    const [first] = campaignProgress(progress);
    expect(first.status[beginner.nodes[1].id]).toBe('cleared');
    const open = beginner.nodes.filter((node) => first.status[node.id] === 'open');
    expect(open).toHaveLength(OPEN_WINDOW);
    expect(first.status[beginner.nodes[OPEN_WINDOW].id]).toBe('open');
  });

  it('does not count a zero-star attempt as a clear', () => {
    const progress = summarizeAttempts([attempt(beginner.nodes[0].id, 5)]);
    expect(campaignProgress(progress)[0].status[beginner.nodes[0].id]).toBe('open');
  });

  it('opens the boss once every node is cleared, and needs two stars to beat it', () => {
    let chapters = campaignProgress(summarizeAttempts(clearAll(0)));
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
    // Skipped chapters still start with their usual window of open nodes.
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
