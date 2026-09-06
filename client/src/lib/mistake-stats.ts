import { normalizeStudyTagKey, type TrainingSession } from '@shared/schema';
import { toTagList } from './storage/study-tags';

/** Time windows offered by the Mistake stats section. */
export const MISTAKE_STATS_RANGES = [
  { value: 'all', label: 'All time', days: null },
  { value: '14d', label: 'Last 2 weeks', days: 14 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
] as const;

export type MistakeStatsRange = (typeof MISTAKE_STATS_RANGES)[number]['value'];

export interface MistakeTagCount {
  /** Display spelling — the most recent one used, since sessions arrive newest-first. */
  tag: string;
  /** Case-insensitive key the count is grouped by. */
  key: string;
  /** Games in the window carrying this tag. */
  count: number;
}

export interface MistakeStats {
  tags: MistakeTagCount[];
  /** Game sessions in the window, tagged or not — the denominator for the counts. */
  totalGames: number;
  /** Game sessions in the window carrying at least one mistake tag. */
  taggedGames: number;
}

function daysForRange(range: MistakeStatsRange): number | null {
  return MISTAKE_STATS_RANGES.find((option) => option.value === range)?.days ?? null;
}

/**
 * Whole days between `date` and today, using local day boundaries so the windows
 * line up with the "Last 7 days" buckets in the training history. Returns null
 * for a date that isn't usable — a persisted/synced value can be missing or
 * unparseable, and `new Date(NaN)` arithmetic would silently yield NaN.
 */
function daysAgo(date: unknown, now: Date): number | null {
  if (date == null) return null;
  const parsed = new Date(date as string | number | Date);
  const time = parsed.getTime();
  if (!Number.isFinite(time)) return null;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return Math.floor((today.getTime() - day.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Tally how often each mistake tag has been recorded on game sessions.
 *
 * A tag is counted once per game even if a corrupt record lists it twice, so a
 * count always reads as "games where I made this mistake". Sessions whose date
 * can't be read still count towards all-time totals — the tag was really
 * recorded — but are left out of the bounded windows, where they'd otherwise be
 * attributed to a period we can't confirm.
 */
export function computeMistakeStats(
  sessions: TrainingSession[] | undefined,
  range: MistakeStatsRange,
  now: Date = new Date(),
): MistakeStats {
  const windowDays = daysForRange(range);
  const counts = new Map<string, MistakeTagCount>();
  let totalGames = 0;
  let taggedGames = 0;

  for (const session of sessions ?? []) {
    if (session.type !== 'game') continue;

    if (windowDays !== null) {
      const age = daysAgo(session.date, now);
      if (age === null || age < 0 || age >= windowDays) continue;
    }

    totalGames += 1;

    const seenInSession = new Set<string>();
    for (const rawTag of toTagList(session.mistakeTags, session.id, 'mistakeTags')) {
      if (typeof rawTag !== 'string') continue;
      const tag = rawTag.trim();
      if (tag.length === 0) continue;

      const key = normalizeStudyTagKey(tag);
      if (seenInSession.has(key)) continue;
      seenInSession.add(key);

      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { tag, key, count: 1 });
      }
    }

    if (seenInSession.size > 0) taggedGames += 1;
  }

  const tags = Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key),
  );

  return { tags, totalGames, taggedGames };
}
