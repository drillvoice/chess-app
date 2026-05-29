// studyTags is persisted as a JSON-encoded string but consumed as a string[].
// These helpers centralize that conversion so the parse/serialize logic stays
// consistent across the storage and sync layers.

export function parseStudyTags<T>(value: T, sessionId?: number | string): T | string[] | undefined {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as string[];
  } catch (error) {
    const suffix = sessionId != null ? ` for session ${sessionId}` : '';
    console.warn(`Failed to parse studyTags${suffix}:`, error);
    return undefined;
  }
}

export function serializeStudyTags<T>(value: T): T | string {
  return Array.isArray(value) ? JSON.stringify(value) : value;
}
