import type { CampaignAttempt } from './attempts';
import { CAMPAIGN, type CampaignChapter, type CampaignNode } from './chapters';
import { placementNodeId, placementRoundPassed } from './placement';
import { BOSS_CLEAR_STARS, CLEAR_STARS, starsFor, trialPace, type Stars } from './trial-rules';

/**
 * A chapter's nodes are played in sets of SET_SIZE themes. The next set opens
 * only once every node in the current one is cleared AND the set averages
 * SET_STARS_PER_NODE stars, so you master a few themes before going broader.
 * The average lets a strong node carry a weak one (★★★ + ★★ + ★ passes).
 */
export const SET_SIZE = 3;
export const SET_STARS_PER_NODE = 2;

/** The set holding a chapter back: what it still needs before the next set opens. */
export interface SetGate {
  nodeIds: string[];
  stars: number;
  starsNeeded: number;
  /** Nodes in the set without a clear yet. */
  uncleared: number;
}

export interface NodeProgress {
  bestStars: Stars;
  /** Best pace (clean solves per PACE_WINDOW_MS); see trialPace. */
  bestPace: number | null;
  /** Most clean solves in one trial. */
  bestClean: number;
  /** Fastest time to the full target, if ever reached. */
  bestCompletedMs: number | null;
  attempts: number;
  lastPlayedAt: string | null;
}

export type NodeStatus = 'locked' | 'open' | 'cleared';

export interface ChapterProgress {
  chapter: CampaignChapter;
  unlocked: boolean;
  /** Status per node id, including the boss. */
  status: Record<string, NodeStatus>;
  clearedCount: number;
  bossBeaten: boolean;
  /** The first set not yet passed, or null once every set is (the boss is then open). */
  gate: SetGate | null;
  /** Opened past by the placement test: playable, but not needed to progress. */
  skippedByPlacement: boolean;
  /** Stars earned out of the chapter's maximum (3 per node, boss included). */
  stars: number;
  maxStars: number;
}

const EMPTY: NodeProgress = {
  bestStars: 0,
  bestPace: null,
  bestClean: 0,
  bestCompletedMs: null,
  attempts: 0,
  lastPlayedAt: null,
};

export function summarizeAttempts(attempts: CampaignAttempt[]): Map<string, NodeProgress> {
  const byNode = new Map<string, NodeProgress>();
  for (const attempt of attempts) {
    const prev = byNode.get(attempt.nodeId) ?? EMPTY;
    const stars = starsFor(attempt);
    const pace = trialPace(attempt);
    byNode.set(attempt.nodeId, {
      bestStars: Math.max(prev.bestStars, stars) as Stars,
      bestPace: prev.bestPace === null ? pace : Math.max(prev.bestPace, pace),
      bestClean: Math.max(prev.bestClean, attempt.clean),
      bestCompletedMs:
        attempt.completedMs === null
          ? prev.bestCompletedMs
          : Math.min(prev.bestCompletedMs ?? Infinity, attempt.completedMs),
      attempts: prev.attempts + 1,
      lastPlayedAt:
        prev.lastPlayedAt === null || attempt.startedAt > prev.lastPlayedAt
          ? attempt.startedAt
          : prev.lastPlayedAt,
    });
  }
  return byNode;
}

export function nodeProgress(progress: Map<string, NodeProgress>, nodeId: string): NodeProgress {
  return progress.get(nodeId) ?? EMPTY;
}

export function isNodeCleared(node: CampaignNode, p: NodeProgress): boolean {
  return p.bestStars >= (node.kind === 'boss' ? BOSS_CLEAR_STARS : CLEAR_STARS);
}

/** Split a chapter's nodes into consecutive sets of SET_SIZE (the last may be shorter). */
export function chapterSets<T>(nodes: T[]): T[][] {
  const sets: T[][] = [];
  for (let i = 0; i < nodes.length; i += SET_SIZE) sets.push(nodes.slice(i, i + SET_SIZE));
  return sets;
}

/**
 * Unlocks: chapter 1 is always open; each later chapter opens when the previous
 * boss is beaten. Within a chapter, sets open one at a time (see SET_SIZE); a
 * node that already has a clear stays playable even if its set is closed (e.g.
 * after a rule change). The boss opens once every set is passed.
 */
export function campaignProgress(progress: Map<string, NodeProgress>): ChapterProgress[] {
  const { passedThrough } = placementSummary(progress);
  const result: ChapterProgress[] = [];
  let previousBossBeaten = true;
  CAMPAIGN.forEach((chapter, chapterIndex) => {
    // Passing placement round k opens every chapter up to k + 1.
    const unlocked: boolean = previousBossBeaten || chapterIndex <= passedThrough + 1;
    const status: Record<string, NodeStatus> = {};
    const clearedCount = chapter.nodes.filter((n) =>
      isNodeCleared(n, nodeProgress(progress, n.id)),
    ).length;
    let gate: SetGate | null = null;
    for (const set of chapterSets(chapter.nodes)) {
      const setOpen = unlocked && gate === null;
      for (const n of set) {
        const cleared = isNodeCleared(n, nodeProgress(progress, n.id));
        status[n.id] = !unlocked ? 'locked' : cleared ? 'cleared' : setOpen ? 'open' : 'locked';
      }
      if (!setOpen) continue;
      const stars = set.reduce((sum, n) => sum + nodeProgress(progress, n.id).bestStars, 0);
      const starsNeeded = set.length * SET_STARS_PER_NODE;
      const uncleared = set.filter((n) => status[n.id] !== 'cleared').length;
      if (uncleared > 0 || stars < starsNeeded) {
        gate = { nodeIds: set.map((n) => n.id), stars, starsNeeded, uncleared };
      }
    }
    const bossBeaten: boolean =
      unlocked && isNodeCleared(chapter.boss, nodeProgress(progress, chapter.boss.id));
    status[chapter.boss.id] = bossBeaten
      ? 'cleared'
      : unlocked && gate === null
        ? 'open'
        : 'locked';

    const allNodes = [...chapter.nodes, chapter.boss];
    result.push({
      chapter,
      unlocked,
      status,
      clearedCount,
      bossBeaten,
      gate: unlocked ? gate : null,
      skippedByPlacement: chapterIndex <= passedThrough && !bossBeaten,
      stars: unlocked
        ? allNodes.reduce((sum, n) => sum + nodeProgress(progress, n.id).bestStars, 0)
        : 0,
      maxStars: allNodes.length * 3,
    });
    previousBossBeaten = bossBeaten;
  });
  return result;
}

/** The chapter to show first: the furthest one unlocked. */
export function currentChapterId(chapters: ChapterProgress[]): string {
  const unlocked = chapters.filter((c) => c.unlocked);
  return (unlocked[unlocked.length - 1] ?? chapters[0]).chapter.id;
}

export interface PlacementSummary {
  /** Whether any placement round has been played. */
  taken: boolean;
  /** Index of the highest chapter whose round was passed (-1 if none). */
  passedThrough: number;
}

export function placementSummary(progress: Map<string, NodeProgress>): PlacementSummary {
  let taken = false;
  let passedThrough = -1;
  CAMPAIGN.forEach((chapter, i) => {
    const round = progress.get(placementNodeId(chapter.id));
    if (!round) return;
    taken = true;
    if (placementRoundPassed(round.bestClean)) passedThrough = Math.max(passedThrough, i);
  });
  return { taken, passedThrough };
}
