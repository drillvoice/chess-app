import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseTagList, serializeTagList, toTagList } from './study-tags';

describe('parseTagList', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses a JSON-encoded array string', () => {
    expect(parseTagList('["openings","endgames"]')).toEqual(['openings', 'endgames']);
  });

  it('passes through values that are not strings', () => {
    expect(parseTagList(['already', 'array'])).toEqual(['already', 'array']);
    expect(parseTagList(null)).toBeNull();
    expect(parseTagList(undefined)).toBeUndefined();
  });

  it('returns undefined and warns on invalid JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseTagList('not json', 7)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'Failed to parse studyTags for session 7:',
      expect.anything(),
    );
  });

  it('returns undefined and warns when valid JSON is not an array', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A corrupt record (e.g. studyTags stored as `"3"`) parses to a non-array.
    expect(parseTagList('3', 11)).toBeUndefined();
    expect(parseTagList('{"a":1}', 11)).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('names the offending field in the warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseTagList('not json', 7, 'mistakeTags')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'Failed to parse mistakeTags for session 7:',
      expect.anything(),
    );
  });
});

describe('toTagList', () => {
  afterEach(() => vi.restoreAllMocks());

  it('collapses absent, null and corrupt values to an empty array', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(toTagList(undefined)).toEqual([]);
    expect(toTagList(null)).toEqual([]);
    expect(toTagList('3', 11, 'mistakeTags')).toEqual([]);
  });

  it('returns the parsed tags when the value is valid', () => {
    expect(toTagList('["hung a piece"]')).toEqual(['hung a piece']);
    expect(toTagList(['already', 'array'])).toEqual(['already', 'array']);
  });
});

describe('serializeTagList', () => {
  it('stringifies arrays', () => {
    expect(serializeTagList(['a', 'b'])).toBe('["a","b"]');
    expect(serializeTagList([])).toBe('[]');
  });

  it('passes through non-array values unchanged', () => {
    expect(serializeTagList(null)).toBeNull();
    expect(serializeTagList(undefined)).toBeUndefined();
    expect(serializeTagList('already-a-string')).toBe('already-a-string');
  });
});
