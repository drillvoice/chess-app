import {
  MAX_CUSTOM_MISTAKE_TAGS,
  MAX_CUSTOM_STUDY_TAGS,
  normalizeStudyTagKey,
  studyTagSchema,
  type TrainingSession,
  type UserStudyPreferences,
} from '@shared/schema';
import { logger } from './logger';
import { offlineStorage } from './offline-storage';
import { toTagList } from './storage/study-tags';

/**
 * Clean a persisted tag vocabulary: drop entries the schema would reject, dedupe
 * case-insensitively (first spelling wins), and clamp to the vocabulary's cap.
 * Order is preserved — these lists are user-facing and already sorted by the
 * add path, so re-sorting here would shuffle them for no reason.
 */
export function normalizeTagVocabulary(tags: unknown, limit: number): string[] {
  if (!Array.isArray(tags)) return [];

  const deduped = new Map<string, string>();
  for (const rawTag of tags) {
    if (typeof rawTag !== 'string') continue;
    const trimmed = rawTag.trim();
    if (!studyTagSchema.safeParse(trimmed).success) continue;
    const key = normalizeStudyTagKey(trimmed);
    if (!deduped.has(key)) {
      deduped.set(key, trimmed);
    }
  }

  return Array.from(deduped.values()).slice(0, limit);
}

/**
 * The tags actually used on logged sessions, most-used first (ties broken by most
 * recent use, since `sessions` arrives newest-first). Sessions are the only other
 * place a tag is recorded, which makes them the sole recovery source when a
 * vocabulary is lost.
 */
export function collectSessionTagVocabularies(sessions: TrainingSession[]): {
  studyTags: string[];
  mistakeTags: string[];
} {
  const study = new Map<string, { tag: string; uses: number }>();
  const mistake = new Map<string, { tag: string; uses: number }>();

  for (const session of sessions) {
    const tally = (tags: string[], into: Map<string, { tag: string; uses: number }>) => {
      for (const rawTag of tags) {
        if (typeof rawTag !== 'string') continue;
        const trimmed = rawTag.trim();
        if (!studyTagSchema.safeParse(trimmed).success) continue;
        const key = normalizeStudyTagKey(trimmed);
        const existing = into.get(key);
        if (existing) {
          existing.uses += 1;
        } else {
          into.set(key, { tag: trimmed, uses: 1 });
        }
      }
    };

    tally(toTagList(session.studyTags, session.id, 'studyTags'), study);
    tally(toTagList(session.mistakeTags, session.id, 'mistakeTags'), mistake);
  }

  const byUses = (entries: Map<string, { tag: string; uses: number }>): string[] =>
    Array.from(entries.values())
      .sort((a, b) => b.uses - a.uses)
      .map((entry) => entry.tag);

  return { studyTags: byUses(study), mistakeTags: byUses(mistake) };
}

function sameTagSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const bKeys = new Set(b.map(normalizeStudyTagKey));
  return a.every((tag) => bKeys.has(normalizeStudyTagKey(tag)));
}

function appendMissing(existing: string[], candidates: string[], limit: number): string[] {
  const seen = new Set(existing.map(normalizeStudyTagKey));
  const merged = [...existing];
  for (const candidate of candidates) {
    if (merged.length >= limit) break;
    const key = normalizeStudyTagKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }
  return merged;
}

/**
 * Rebuild a vocabulary that was reset, from the tags recorded on sessions.
 *
 * Deliberately conservative: it only fills a vocabulary that shows the *signature
 * of a reset* — empty for mistake tags (a tag cannot reach a session without
 * having been in the vocabulary), and empty-or-exactly-the-seeded-defaults for
 * study tags. Backfilling a curated list would resurrect tags the user has
 * deliberately deleted, which is worse than the gap it fills.
 */
export function rebuildVocabularies(
  preferences: UserStudyPreferences,
  sessionTags: { studyTags: string[]; mistakeTags: string[] },
  seededStudyTags: string[],
): UserStudyPreferences {
  const currentStudy = preferences.customTags ?? [];
  const currentMistake = preferences.customMistakeTags ?? [];

  const studyWasReset = currentStudy.length === 0 || sameTagSet(currentStudy, seededStudyTags);
  const nextStudy = studyWasReset
    ? appendMissing(currentStudy, sessionTags.studyTags, MAX_CUSTOM_STUDY_TAGS)
    : currentStudy;
  const nextMistake =
    currentMistake.length === 0
      ? appendMissing(currentMistake, sessionTags.mistakeTags, MAX_CUSTOM_MISTAKE_TAGS)
      : currentMistake;

  if (sameTagSet(nextStudy, currentStudy) && sameTagSet(nextMistake, currentMistake)) {
    return preferences;
  }

  return { ...preferences, customTags: nextStudy, customMistakeTags: nextMistake };
}

/**
 * Read the locally stored sessions and recover any vocabulary that was reset.
 * Returns the same object when there is nothing to recover, so callers can use
 * identity to decide whether a write is needed.
 */
export async function repairTagVocabularies(
  preferences: UserStudyPreferences,
  seededStudyTags: string[],
): Promise<UserStudyPreferences> {
  const sessions = await offlineStorage.getSessions();
  const repaired = rebuildVocabularies(
    preferences,
    collectSessionTagVocabularies(sessions),
    seededStudyTags,
  );

  if (repaired !== preferences) {
    logger.warn('Recovered tag vocabulary from logged sessions', {
      customTags: repaired.customTags,
      customMistakeTags: repaired.customMistakeTags,
    });
  }

  return repaired;
}
