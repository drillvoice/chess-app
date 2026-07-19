import {
  normalizeStudyTagKey,
  studyTagSchema,
  type DailyGoalSettings,
  type StudyTagConfig,
  type TagGoal,
} from '@shared/schema';

export type TagConfigMap = Record<string, StudyTagConfig>;

export const MAX_TAG_GOALS = 10;

export const tagGoalId = (tag: string): string => `tag:${normalizeStudyTagKey(tag)}`;

// Legacy built-in goal targets are 0–99 where 0 (or absent) means disabled.
function sanitizeBuiltinTarget(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value <= 0) return value === 0 ? 0 : undefined;
  return Math.min(99, Math.floor(value));
}

function sanitizeTagGoals(raw: unknown): TagGoal[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const goals: TagGoal[] = [];
  for (const entry of raw) {
    if (goals.length >= MAX_TAG_GOALS) break;
    if (!entry || typeof entry !== 'object') continue;
    const { tag, target, label } = entry as Record<string, unknown>;
    if (typeof tag !== 'string' || !studyTagSchema.safeParse(tag).success) continue;
    if (typeof target !== 'number' || !Number.isFinite(target)) continue;
    const intTarget = Math.floor(target);
    if (intTarget < 1 || intTarget > 99) continue;

    const id = tagGoalId(tag);
    if (seen.has(id)) continue;
    seen.add(id);

    goals.push({
      id,
      tag: tag.trim(),
      target: intTarget,
      label:
        typeof label === 'string' && label.trim().length > 0 && label.length <= 40
          ? label.trim()
          : undefined,
    });
  }
  return goals;
}

function sanitizeLastModified(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : undefined;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Heal-on-read guard for daily goal settings coming from untrusted seams
 * (IndexedDB, Firestore snapshots, imported JSON). Non-finite numbers, corrupt
 * tag-goal entries, duplicate tags, and oversized arrays are dropped rather
 * than propagated. Idempotent: sanitizing sanitized settings is a no-op.
 */
export function sanitizeDailyGoalSettings(raw: unknown): DailyGoalSettings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    tacticsMinutes: sanitizeBuiltinTarget(source.tacticsMinutes),
    gamesCount: sanitizeBuiltinTarget(source.gamesCount),
    studyMinutes: sanitizeBuiltinTarget(source.studyMinutes),
    tagGoals: sanitizeTagGoals(source.tagGoals),
    isCustomized: Boolean(source.isCustomized),
    autoTracking: Boolean(source.autoTracking),
    lastModified: sanitizeLastModified(source.lastModified),
  };
}

// Treat 0 and undefined (both "disabled") as equal for a built-in target.
function builtinsEqual(a: number | undefined, b: number | undefined): boolean {
  return (a ?? 0) === (b ?? 0);
}

/**
 * Compare two daily goal settings for meaningful equivalence, ignoring
 * `lastModified` and tag-goal ordering. Used by backup verification to detect
 * when the cloud copy has drifted from local (e.g. missing custom goals).
 * Inputs are sanitized first so unsaved corruption doesn't cause false diffs.
 */
export function areDailyGoalsEquivalent(
  a: DailyGoalSettings | null | undefined,
  b: DailyGoalSettings | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  const sa = sanitizeDailyGoalSettings(a);
  const sb = sanitizeDailyGoalSettings(b);

  if (
    !builtinsEqual(sa.tacticsMinutes, sb.tacticsMinutes) ||
    !builtinsEqual(sa.gamesCount, sb.gamesCount) ||
    !builtinsEqual(sa.studyMinutes, sb.studyMinutes) ||
    Boolean(sa.autoTracking) !== Boolean(sb.autoTracking) ||
    Boolean(sa.isCustomized) !== Boolean(sb.isCustomized)
  ) {
    return false;
  }

  const goalsA = sa.tagGoals ?? [];
  const goalsB = sb.tagGoals ?? [];
  if (goalsA.length !== goalsB.length) return false;

  // Compare by deterministic id + target, order-insensitive.
  const targetsById = new Map(goalsA.map((goal) => [goal.id, goal.target]));
  return goalsB.every((goal) => targetsById.get(goal.id) === goal.target);
}

export type ResolvedGoalKind = 'tactics' | 'study' | 'game' | 'tag';

export interface ResolvedGoal {
  /** Stable checklist/progress key: 'tactics' | 'study' | 'game' | 'tag:<key>' */
  id: string;
  kind: ResolvedGoalKind;
  /** Original tag string for kind 'tag' */
  tag?: string;
  label: string;
  /** 0 means "no numeric target" (default goals in manual mode) */
  target: number;
  unitLabel: string;
  /** Tag goals only: measure progress by summing logged quantity of this unit */
  useQuantity: boolean;
}

function builtinGoal(
  kind: 'tactics' | 'study' | 'game',
  target: number,
  label: string,
  unitLabel: string,
): ResolvedGoal {
  return { id: kind, kind, label, target, unitLabel, useQuantity: false };
}

/**
 * Flatten settings into the ordered list of goals to display/track. Built-in
 * goal ids keep their historical 'tactics'/'study'/'game' values so existing
 * localStorage checklists remain valid.
 */
export function resolveGoals(
  settings: DailyGoalSettings | null,
  tagConfigs: TagConfigMap = {},
): ResolvedGoal[] {
  // Default (non-customized) mode: the classic three goals without targets.
  if (!settings || !settings.isCustomized) {
    return [
      builtinGoal('tactics', 0, 'Practice tactics', 'min'),
      builtinGoal('study', 0, 'Study chess', 'min'),
      builtinGoal('game', 0, 'Play a game', 'games'),
    ];
  }

  const goals: ResolvedGoal[] = [];

  const tacticsTarget = settings.tacticsMinutes ?? 0;
  if (tacticsTarget > 0) {
    goals.push(
      builtinGoal('tactics', tacticsTarget, `Practice tactics for ${tacticsTarget} minutes`, 'min'),
    );
  }

  const studyTarget = settings.studyMinutes ?? 0;
  if (studyTarget > 0) {
    goals.push(builtinGoal('study', studyTarget, `Study for ${studyTarget} minutes`, 'min'));
  }

  const gamesTarget = settings.gamesCount ?? 0;
  if (gamesTarget > 0) {
    goals.push(
      builtinGoal(
        'game',
        gamesTarget,
        `Play ${gamesTarget} game${gamesTarget !== 1 ? 's' : ''}`,
        'games',
      ),
    );
  }

  for (const tagGoal of settings.tagGoals ?? []) {
    const key = normalizeStudyTagKey(tagGoal.tag);
    const config = tagConfigs[key];
    const useQuantity = Boolean(config?.unitLabel && config?.minutesPerUnit);
    const unitLabel = useQuantity ? config!.unitLabel : 'sessions';
    const displayName = tagGoal.label ?? tagGoal.tag;
    goals.push({
      id: tagGoal.id,
      kind: 'tag',
      tag: tagGoal.tag,
      label: `${displayName}: ${tagGoal.target} ${unitLabel}`,
      target: tagGoal.target,
      unitLabel,
      useQuantity,
    });
  }

  return goals;
}
