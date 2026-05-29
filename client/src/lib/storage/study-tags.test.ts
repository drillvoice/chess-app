import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseStudyTags, serializeStudyTags } from './study-tags';

describe('parseStudyTags', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses a JSON-encoded array string', () => {
    expect(parseStudyTags('["openings","endgames"]')).toEqual(['openings', 'endgames']);
  });

  it('passes through values that are not strings', () => {
    expect(parseStudyTags(['already', 'array'])).toEqual(['already', 'array']);
    expect(parseStudyTags(null)).toBeNull();
    expect(parseStudyTags(undefined)).toBeUndefined();
  });

  it('returns undefined and warns on invalid JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseStudyTags('not json', 7)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Failed to parse studyTags for session 7:', expect.anything());
  });
});

describe('serializeStudyTags', () => {
  it('stringifies arrays', () => {
    expect(serializeStudyTags(['a', 'b'])).toBe('["a","b"]');
    expect(serializeStudyTags([])).toBe('[]');
  });

  it('passes through non-array values unchanged', () => {
    expect(serializeStudyTags(null)).toBeNull();
    expect(serializeStudyTags(undefined)).toBeUndefined();
    expect(serializeStudyTags('already-a-string')).toBe('already-a-string');
  });
});
