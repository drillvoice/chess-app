// studyTags is persisted as a JSON-encoded string but consumed as a string[].
// These helpers centralize that conversion so the parse/serialize logic stays
// consistent across the storage and sync layers.

export function parseStudyTags<T>(value: T, sessionId?: number | string): T | string[] | undefined {
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      // A corrupt record (e.g. studyTags stored as `"3"`) parses to a non-array.
      // Casting it to string[] would let the bad value propagate, so reject it.
      throw new Error(`studyTags is not an array (got ${typeof parsed})`);
    }
    return parsed as string[];
  } catch (error) {
    const suffix = sessionId != null ? ` for session ${sessionId}` : '';
    console.warn(`Failed to parse studyTags${suffix}:`, error);
    return undefined;
  }
}

export function serializeStudyTags<T>(value: T): T | string {
  return Array.isArray(value) ? JSON.stringify(value) : value;
}
