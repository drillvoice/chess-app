// Tag-list fields (studyTags on study sessions, mistakeTags on game sessions) are
// persisted as JSON-encoded strings but consumed as string[]. These helpers
// centralize that conversion so the parse/serialize logic stays consistent across
// the storage and sync layers.

export function parseTagList<T>(
  value: T,
  sessionId?: number | string,
  field = 'studyTags',
): T | string[] | undefined {
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      // A corrupt record (e.g. studyTags stored as `"3"`) parses to a non-array.
      // Casting it to string[] would let the bad value propagate, so reject it.
      throw new Error(`${field} is not an array (got ${typeof parsed})`);
    }
    return parsed as string[];
  } catch (error) {
    const suffix = sessionId != null ? ` for session ${sessionId}` : '';
    console.warn(`Failed to parse ${field}${suffix}:`, error);
    return undefined;
  }
}

export function serializeTagList<T>(value: T): T | string {
  return Array.isArray(value) ? JSON.stringify(value) : value;
}

/**
 * parseTagList for read paths that only want to render the tags: absent, null
 * and corrupt values all collapse to an empty array.
 */
export function toTagList(
  value: unknown,
  sessionId?: number | string,
  field = 'studyTags',
): string[] {
  const parsed = parseTagList(value, sessionId, field);
  return Array.isArray(parsed) ? parsed : [];
}
