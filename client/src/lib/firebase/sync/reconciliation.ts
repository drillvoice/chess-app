import {
  MAX_CUSTOM_MISTAKE_TAGS,
  MAX_CUSTOM_STUDY_TAGS,
  normalizeStudyTagKey,
  type TrainingSession,
} from '@shared/schema';
import { normalizeSessionForSync, sessionRecency, toDate } from './serialization';

export function mergeSessionCollections(
  localSessions: TrainingSession[],
  cloudSessions: TrainingSession[],
): { merged: TrainingSession[]; collisionsResolved: number } {
  const map = new Map<number, TrainingSession>();
  let collisionsResolved = 0;

  for (const rawSession of localSessions) {
    const session = normalizeSessionForSync(rawSession);
    if (!session) continue;
    map.set(session.id, session);
  }

  for (const rawCloudSession of cloudSessions) {
    const cloudSession = normalizeSessionForSync(rawCloudSession);
    if (!cloudSession) continue;
    const existing = map.get(cloudSession.id);
    if (!existing) {
      map.set(cloudSession.id, cloudSession);
      continue;
    }
    collisionsResolved += 1;
    if (sessionRecency(cloudSession) >= sessionRecency(existing)) {
      map.set(cloudSession.id, cloudSession);
    }
  }

  const merged = Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  return { merged, collisionsResolved };
}

export function reconcileRealtimeSnapshot(
  localSessions: TrainingSession[],
  remoteSessions: TrainingSession[],
): {
  nextLocal: TrainingSession[];
  localOnlyToUpload: TrainingSession[];
  tombstonedIds: number[];
} {
  const normalizedLocalSessions = localSessions
    .map((session) => normalizeSessionForSync(session))
    .filter((session): session is TrainingSession => Boolean(session));
  const normalizedRemoteSessions = remoteSessions
    .map((session) => normalizeSessionForSync(session))
    .filter((session): session is TrainingSession => Boolean(session));

  const tombstoneRecencyById = new Map<number, number>();
  for (const session of normalizedRemoteSessions) {
    const deletedAt = (session as Record<string, unknown>).deletedAt;
    if (!deletedAt) continue;
    const deletedAtTs = toDate(deletedAt)?.getTime();
    const tombstoneRecency = deletedAtTs ?? sessionRecency(session);
    tombstoneRecencyById.set(session.id, tombstoneRecency);
  }

  const tombstonedIdSet = new Set(tombstoneRecencyById.keys());
  const remoteActive = normalizedRemoteSessions.filter(
    (session) => !tombstonedIdSet.has(session.id),
  );

  const localWithoutTombstones = normalizedLocalSessions.filter((session) => {
    const tombstoneRecency = tombstoneRecencyById.get(session.id);
    if (tombstoneRecency == null) return true;
    return sessionRecency(session) > tombstoneRecency;
  });

  const resurrectedIdSet = new Set(
    localWithoutTombstones
      .filter((session) => tombstoneRecencyById.has(session.id))
      .map((session) => session.id),
  );
  const tombstonedIds = Array.from(tombstoneRecencyById.keys()).filter(
    (id) => !resurrectedIdSet.has(id),
  );
  const effectiveTombstonedIdSet = new Set(tombstonedIds);

  const { merged } = mergeSessionCollections(localWithoutTombstones, remoteActive);
  const remoteActiveIds = new Set(remoteActive.map((session) => session.id));
  const localOnlyToUpload = merged.filter(
    (session) => !remoteActiveIds.has(session.id) && !effectiveTombstonedIdSet.has(session.id),
  );

  return { nextLocal: merged, localOnlyToUpload, tombstonedIds };
}

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' ? (value as LooseRecord) : {};
}

export function isCloudNewer(localValue: unknown, cloudValue: unknown): boolean {
  const localTs = toDate(asRecord(localValue).lastModified)?.getTime();
  const cloudTs = toDate(asRecord(cloudValue).lastModified)?.getTime();
  if (!localTs && cloudTs) return true;
  if (localTs && !cloudTs) return false;
  if (!localTs && !cloudTs) return true;
  return (cloudTs ?? 0) >= (localTs ?? 0);
}

function settingsTimestamp(value: unknown): number {
  const record = asRecord(value);
  const settingsTs = toDate(record.lastModified)?.getTime() ?? Number.NEGATIVE_INFINITY;
  const studyPrefsTs =
    toDate(asRecord(record.studyPreferences).lastModified)?.getTime() ?? Number.NEGATIVE_INFINITY;
  return Math.max(settingsTs, studyPrefsTs);
}

function studyPreferencesTimestamp(value: unknown): number {
  return toDate(asRecord(value).lastModified)?.getTime() ?? Number.NEGATIVE_INFINITY;
}

/**
 * Cloud payloads carry `lastModified` as a Firestore `Timestamp`, whose prototype
 * (and therefore its `toDate()`) is stripped by the structured clone into IndexedDB —
 * leaving a bare `{seconds, nanoseconds}` that `isoDateOptional` rejects on the next
 * read. Merged records go straight into the offline cache, so the timestamp has to be
 * a real `Date` before it leaves here or the whole preferences object gets discarded.
 */
function withNormalizedTimestamp(record: LooseRecord): LooseRecord {
  if (!('lastModified' in record)) return record;
  const normalized = toDate(record.lastModified);
  if (normalized) return { ...record, lastModified: normalized };
  const { lastModified: _dropped, ...rest } = record;
  return rest;
}

function normalizeCustomTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];

  const deduped = new Map<string, string>();
  for (const rawTag of tags) {
    if (typeof rawTag !== 'string') continue;
    const trimmed = rawTag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, trimmed);
    }
  }

  return Array.from(deduped.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}

interface TagConfig {
  unitLabel: string;
  minutesPerUnit: number;
}

export function normalizeTagConfigs(tagConfigs: unknown): Record<string, TagConfig> {
  if (!tagConfigs || typeof tagConfigs !== 'object') return {};

  const normalized: Record<string, TagConfig> = {};
  for (const [rawKey, rawConfig] of Object.entries(tagConfigs as Record<string, unknown>)) {
    const key = normalizeStudyTagKey(rawKey);
    const config = asRecord(rawConfig);
    const unitLabel = config.unitLabel;
    const minutesPerUnitRaw = config.minutesPerUnit;
    if (typeof unitLabel !== 'string') continue;
    const trimmedUnit = unitLabel.trim();
    if (!trimmedUnit) continue;
    const minutesPerUnit = Number(minutesPerUnitRaw);
    if (!Number.isFinite(minutesPerUnit) || minutesPerUnit <= 0) continue;
    normalized[key] = { unitLabel: trimmedUnit, minutesPerUnit };
  }

  return normalized;
}

function pruneTagConfigsByTags(
  tagConfigs: Record<string, TagConfig>,
  tags: string[],
): Record<string, TagConfig> {
  const allowedKeys = new Set(tags.map((tag) => normalizeStudyTagKey(tag)));
  return Object.fromEntries(
    Object.entries(tagConfigs).filter(([key]) => allowedKeys.has(normalizeStudyTagKey(key))),
  );
}

function unionTagLists(a: unknown, b: unknown, limit: number): string[] {
  return normalizeCustomTags([
    ...(Array.isArray(a) ? a : []),
    ...(Array.isArray(b) ? b : []),
  ]).slice(0, limit);
}

/**
 * Union the mistake vocabulary rather than letting the newer document win: the
 * vocabulary is the only record of these tags — sessions store their own copy,
 * never the list — so a device that has not yet seen a tag would otherwise
 * clobber it on the next write. Absent on both sides stays absent; inventing an
 * empty list would write the field into documents that never had one.
 */
function mergeMistakeTags(a: unknown, b: unknown): { customMistakeTags?: string[] } {
  if (!Array.isArray(a) && !Array.isArray(b)) return {};
  return { customMistakeTags: unionTagLists(a, b, MAX_CUSTOM_MISTAKE_TAGS) };
}

function mergeStudyPreferencesForSync(
  localStudy: unknown,
  cloudStudy: unknown,
): LooseRecord | undefined {
  if (!localStudy && !cloudStudy) return undefined;
  if (localStudy && !cloudStudy) {
    const local = asRecord(localStudy);
    const customTags = unionTagLists(local.customTags, [], MAX_CUSTOM_STUDY_TAGS);
    return withNormalizedTimestamp({
      ...local,
      customTags,
      ...mergeMistakeTags(local.customMistakeTags, undefined),
      tagConfigs: pruneTagConfigsByTags(normalizeTagConfigs(local.tagConfigs), customTags),
    });
  }
  if (!localStudy && cloudStudy) {
    const cloud = asRecord(cloudStudy);
    const customTags = unionTagLists(cloud.customTags, [], MAX_CUSTOM_STUDY_TAGS);
    return withNormalizedTimestamp({
      ...cloud,
      customTags,
      ...mergeMistakeTags(cloud.customMistakeTags, undefined),
      tagConfigs: pruneTagConfigsByTags(normalizeTagConfigs(cloud.tagConfigs), customTags),
    });
  }

  const local = asRecord(localStudy);
  const cloud = asRecord(cloudStudy);
  const preferCloud = studyPreferencesTimestamp(cloud) >= studyPreferencesTimestamp(local);

  const primary = preferCloud ? cloud : local;
  const secondary = preferCloud ? local : cloud;
  const customTags = unionTagLists(local.customTags, cloud.customTags, MAX_CUSTOM_STUDY_TAGS);
  const primaryTagConfigs = normalizeTagConfigs(primary.tagConfigs);
  const secondaryTagConfigs = normalizeTagConfigs(secondary.tagConfigs);

  return withNormalizedTimestamp({
    ...secondary,
    ...primary,
    customTags,
    ...mergeMistakeTags(local.customMistakeTags, cloud.customMistakeTags),
    // Merge tag configs by normalized key; newer prefs win conflicts via spread order.
    tagConfigs: pruneTagConfigsByTags(
      {
        ...secondaryTagConfigs,
        ...primaryTagConfigs,
      },
      customTags,
    ),
  });
}

export function areSameTagSet(a: unknown, b: unknown): boolean {
  const aTags = normalizeCustomTags(a);
  const bTags = normalizeCustomTags(b);
  if (aTags.length !== bTags.length) return false;
  for (let i = 0; i < aTags.length; i += 1) {
    if (aTags[i].toLowerCase() !== bTags[i].toLowerCase()) return false;
  }
  return true;
}

export function areSameTagConfigs(a: unknown, b: unknown): boolean {
  const aConfigs = normalizeTagConfigs(a);
  const bConfigs = normalizeTagConfigs(b);
  const aKeys = Object.keys(aConfigs).sort();
  const bKeys = Object.keys(bConfigs).sort();

  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return false;
    if (aConfigs[aKeys[i]]?.unitLabel !== bConfigs[bKeys[i]]?.unitLabel) return false;
    if (aConfigs[aKeys[i]]?.minutesPerUnit !== bConfigs[bKeys[i]]?.minutesPerUnit) return false;
  }

  return true;
}

export function mergeSettingsForSync(localSettings: unknown, cloudSettings: unknown): LooseRecord {
  const local = asRecord(localSettings);
  const cloud = asRecord(cloudSettings);
  const preferCloud = settingsTimestamp(cloud) >= settingsTimestamp(local);
  const merged: LooseRecord = withNormalizedTimestamp(
    preferCloud ? { ...local, ...cloud } : { ...cloud, ...local },
  );

  const localStudyPreferences =
    local.studyPreferences && typeof local.studyPreferences === 'object'
      ? local.studyPreferences
      : null;
  const cloudStudyPreferences =
    cloud.studyPreferences && typeof cloud.studyPreferences === 'object'
      ? cloud.studyPreferences
      : null;

  if (localStudyPreferences || cloudStudyPreferences) {
    merged.studyPreferences = mergeStudyPreferencesForSync(
      localStudyPreferences,
      cloudStudyPreferences,
    );
  }

  return merged;
}
