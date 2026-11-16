import type { SessionInput, TrainingSession } from '@shared/schema';
import { deleteSession, getAllSessions, updateSession } from './firebase/firestore';
import { logger } from './logger';

/**
 * Merge duplicate copies of the same Lichess game into one session.
 *
 * Before imports had game-derived ids (see `lichessSessionId` in lichess-sync),
 * two devices importing the same game created two unrelated sessions, and
 * cloud sync handed both to every device. The review queue already hides the
 * twins (`selectSessionsNeedingReview`), but they still sit in the log and
 * count twice in game statistics. This folds each group of copies into one and
 * deletes the rest; the deletes are tombstones, so they reach every device.
 *
 * Copies are matched on the session date, which the importer sets from the
 * game's own end time in exact milliseconds — the same key the importer's
 * duplicate check uses. A copy whose date was edited by hand no longer matches
 * and is left alone.
 */

/** Fields that identify or timestamp a record: never copied between copies. */
const PROTECTED_FIELDS = new Set([
  'id',
  'date',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'type',
  'platform',
  'needsReview',
  'gameComments',
  'mistakeTags',
]);

export interface LichessDuplicateGroup {
  survivorId: number;
  duplicateIds: number[];
  /** Changes to apply to the survivor; empty when it already holds everything. */
  patch: Partial<SessionInput>;
}

function lichessGameKey(session: TrainingSession): number | null {
  if (session.type !== 'game' || session.platform !== 'lichess') return null;
  const endedAt = new Date(session.date).getTime();
  return Number.isFinite(endedAt) ? endedAt : null;
}

function recency(session: TrainingSession): number {
  const raw = (session as { updatedAt?: unknown }).updatedAt;
  const ts = raw ? new Date(raw as string).getTime() : Number.NaN;
  return Number.isFinite(ts) ? ts : Number.NEGATIVE_INFINITY;
}

function isBlank(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

function tagsOf(session: TrainingSession): string[] {
  const raw = (session as { mistakeTags?: unknown }).mistakeTags;
  return Array.isArray(raw) ? raw.filter((tag): tag is string => typeof tag === 'string') : [];
}

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

/**
 * Plan the merge without touching storage.
 *
 * The survivor is always the copy with the lowest id. That rule is what makes
 * the merge safe to run on several devices at once, each from its own possibly
 * incomplete view of the data: a device deletes a copy only when it can see a
 * copy with a lower id, so the lowest id of the group is never deleted by
 * anyone, and the game cannot vanish. Recency or review state would be a
 * worse choice: two devices that disagree on them could each keep the copy the
 * other deletes.
 *
 * Into the survivor go:
 * - review state: reviewed if any copy was reviewed or archived (an import
 *   always starts out needing review, so a copy that no longer does was
 *   cleared by the user);
 * - mistake tags: the union of every copy's tags;
 * - comments: every distinct non-empty comment, survivor's first;
 * - any other field the survivor lacks, from the most recently edited copy
 *   that has it.
 */
export function planLichessDuplicateMerge(sessions: TrainingSession[]): LichessDuplicateGroup[] {
  const groups = new Map<number, TrainingSession[]>();
  for (const session of sessions) {
    const key = lichessGameKey(session);
    if (key == null) continue;
    const group = groups.get(key);
    if (group) group.push(session);
    else groups.set(key, [session]);
  }

  const plans: LichessDuplicateGroup[] = [];
  for (const copies of Array.from(groups.values())) {
    if (copies.length < 2) continue;

    const [survivor, ...duplicates] = [...copies].sort((a, b) => a.id - b.id);
    const patch: Record<string, unknown> = {};

    if (survivor.needsReview && duplicates.some((copy) => !copy.needsReview)) {
      patch.needsReview = false;
    }

    const survivorTags = tagsOf(survivor);
    const mergedTags = [...survivorTags];
    for (const copy of duplicates) {
      for (const tag of tagsOf(copy)) {
        if (!mergedTags.includes(tag)) mergedTags.push(tag);
      }
    }
    if (!sameTags(survivorTags, mergedTags)) patch.mistakeTags = mergedTags;

    const comments: string[] = [];
    for (const copy of [survivor, ...duplicates]) {
      const comment = typeof copy.gameComments === 'string' ? copy.gameComments.trim() : '';
      if (comment && !comments.includes(comment)) comments.push(comment);
    }
    const mergedComments = comments.join('\n\n');
    if (mergedComments !== (survivor.gameComments ?? '').trim() && mergedComments) {
      patch.gameComments = mergedComments;
    }

    const donors = [...duplicates].sort((a, b) => recency(b) - recency(a));
    const survivorRecord = survivor as unknown as Record<string, unknown>;
    for (const donor of donors) {
      for (const [field, value] of Object.entries(donor as unknown as Record<string, unknown>)) {
        if (PROTECTED_FIELDS.has(field) || field in patch) continue;
        if (isBlank(value) || !isBlank(survivorRecord[field])) continue;
        patch[field] = value;
      }
    }

    plans.push({
      survivorId: survivor.id,
      duplicateIds: duplicates.map((copy) => copy.id),
      patch: patch as Partial<SessionInput>,
    });
  }

  return plans;
}

export interface LichessDuplicateMergeResult {
  gamesMerged: number;
  copiesRemoved: number;
  failures: number;
}

let inFlight: Promise<LichessDuplicateMergeResult> | null = null;

/**
 * Apply the merge to the stored sessions. Idempotent: with no duplicates left
 * it reads the log and writes nothing, so it is safe to run on every start.
 * The survivor is updated before any copy is deleted, so a failure part-way
 * never loses a copy's tags or comments.
 */
export function mergeDuplicateLichessGames(): Promise<LichessDuplicateMergeResult> {
  inFlight ??= runMerge().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runMerge(): Promise<LichessDuplicateMergeResult> {
  const plans = planLichessDuplicateMerge(await getAllSessions());
  const result: LichessDuplicateMergeResult = { gamesMerged: 0, copiesRemoved: 0, failures: 0 };

  for (const plan of plans) {
    try {
      if (Object.keys(plan.patch).length > 0) {
        await updateSession(plan.survivorId, plan.patch);
      }
      for (const id of plan.duplicateIds) {
        await deleteSession(id);
        result.copiesRemoved += 1;
      }
      result.gamesMerged += 1;
    } catch (error) {
      result.failures += 1;
      logger.error(
        `Failed to merge duplicate Lichess game copies into session ${plan.survivorId}`,
        { duplicateIds: plan.duplicateIds, error },
      );
    }
  }

  if (plans.length > 0) {
    logger.info(
      `Merged ${result.gamesMerged} duplicated Lichess games, removing ${result.copiesRemoved} copies` +
        (result.failures > 0 ? ` (${result.failures} failed)` : ''),
    );
  }
  return result;
}
