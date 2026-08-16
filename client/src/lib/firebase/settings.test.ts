import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted: the mock factories run while the module graph loads, before plain
// top-level consts in this file are initialized.
const { getSettings, setSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
}));

vi.mock('../offline-storage', () => ({
  offlineStorage: {
    getSettings,
    setSettings,
    getSessions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../cache-utils', () => ({
  WeeklyGoalCache: { set: vi.fn(), get: vi.fn(), remove: vi.fn() },
}));

vi.mock('./core', () => ({
  db: {},
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  waitForAuth: vi.fn().mockRejectedValue(new Error('not signed in')),
  getCurrentUserId: vi.fn(() => null),
  Timestamp: class {},
}));

vi.mock('./firestore', () => ({
  getAllSessions: vi.fn().mockResolvedValue([]),
}));

import {
  DEFAULT_STUDY_PREFERENCES,
  getUserStudyPreferences,
  normalizeStudyPreferences,
} from './settings';

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue(null);
  setSettings.mockResolvedValue(undefined);
});

describe('normalizeStudyPreferences', () => {
  it('keeps the tag vocabularies when lastModified is an unreadable Timestamp', () => {
    // A Firestore Timestamp loses its prototype when structured-cloned into
    // IndexedDB; before healing, this rejected the whole document and the caller
    // fell back to defaults, wiping the mistake vocabulary.
    const healed = normalizeStudyPreferences({
      customTags: ['openings'],
      customMistakeTags: ['hung a piece', 'time trouble'],
      tagConfigs: {},
      lastModified: { seconds: 1771581600, nanoseconds: 0 },
    });

    expect(healed?.customMistakeTags).toEqual(['hung a piece', 'time trouble']);
    expect(healed?.customTags).toEqual(['openings']);
    expect(healed?.lastModified).toBeUndefined();
  });

  it('converts a live Timestamp to a Date', () => {
    const healed = normalizeStudyPreferences({
      customTags: ['openings'],
      tagConfigs: {},
      lastModified: { toDate: () => new Date('2026-08-15T10:00:00.000Z') },
    });

    expect(healed?.lastModified).toBeInstanceOf(Date);
  });

  it('drops individual bad tags rather than the whole document', () => {
    const healed = normalizeStudyPreferences({
      customTags: ['openings', 'bad "tag"', 42],
      customMistakeTags: ['hung a piece'],
      tagConfigs: { openings: { unitLabel: 'chapters', minutesPerUnit: 15 } },
    });

    expect(healed?.customTags).toEqual(['openings']);
    expect(healed?.customMistakeTags).toEqual(['hung a piece']);
  });

  it('leaves absent fields to their schema defaults', () => {
    const healed = normalizeStudyPreferences({ tagConfigs: {} });

    expect(healed?.customTags).toEqual(DEFAULT_STUDY_PREFERENCES.customTags);
    expect(healed?.customMistakeTags).toEqual([]);
  });

  it('rejects values that are not preference documents', () => {
    expect(normalizeStudyPreferences(null)).toBeNull();
    expect(normalizeStudyPreferences('preferences')).toBeNull();
  });
});

describe('getUserStudyPreferences', () => {
  it('returns the healed cached preferences instead of resetting to defaults', async () => {
    getSettings.mockResolvedValue({
      lichessUsername: 'someone',
      studyPreferences: {
        customTags: ['openings'],
        customMistakeTags: ['hung a piece'],
        tagConfigs: {},
        lastModified: { seconds: 1771581600, nanoseconds: 0 },
      },
    });

    const preferences = await getUserStudyPreferences();

    expect(preferences.customMistakeTags).toEqual(['hung a piece']);
    expect(preferences.customTags).toEqual(['openings']);
  });

  it('keeps the rest of the settings record when it does fall back to defaults', async () => {
    getSettings.mockResolvedValue({ lichessUsername: 'someone' });

    const preferences = await getUserStudyPreferences();

    expect(preferences).toEqual(DEFAULT_STUDY_PREFERENCES);
    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        lichessUsername: 'someone',
        studyPreferences: DEFAULT_STUDY_PREFERENCES,
      }),
    );
  });
});
