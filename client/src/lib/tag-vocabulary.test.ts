import { describe, expect, it } from 'vitest';
import type { TrainingSession, UserStudyPreferences } from '@shared/schema';
import {
  collectSessionTagVocabularies,
  normalizeTagVocabulary,
  rebuildVocabularies,
} from './tag-vocabulary';

const SEEDED_STUDY_TAGS = ['reading', 'videos', 'coaching'];

function makeSession(overrides: Partial<TrainingSession>): TrainingSession {
  return {
    id: 1,
    type: 'game',
    date: new Date('2026-08-15T10:00:00.000Z'),
    needsReview: false,
    ...overrides,
  } as TrainingSession;
}

function makePreferences(overrides: Partial<UserStudyPreferences> = {}): UserStudyPreferences {
  return {
    customTags: [...SEEDED_STUDY_TAGS],
    tagConfigs: {},
    customMistakeTags: [],
    ...overrides,
  };
}

describe('normalizeTagVocabulary', () => {
  it('drops entries the schema would reject and dedupes case-insensitively', () => {
    expect(
      normalizeTagVocabulary(
        [
          'hung a piece',
          'Hung A Piece',
          '',
          '  ',
          'bad "quote"',
          42,
          'x'.repeat(26),
          'time trouble',
        ],
        20,
      ),
    ).toEqual(['hung a piece', 'time trouble']);
  });

  it('clamps to the vocabulary cap and tolerates non-arrays', () => {
    expect(normalizeTagVocabulary(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
    expect(normalizeTagVocabulary(undefined, 20)).toEqual([]);
    expect(normalizeTagVocabulary('hung a piece', 20)).toEqual([]);
  });
});

describe('collectSessionTagVocabularies', () => {
  it('orders tags by how often they were used', () => {
    const sessions = [
      makeSession({ id: 1, mistakeTags: ['time trouble'] as never }),
      makeSession({ id: 2, mistakeTags: ['hung a piece', 'time trouble'] as never }),
      makeSession({ id: 3, mistakeTags: ['time trouble'] as never }),
      makeSession({ id: 4, type: 'study', studyTags: ['endgames'] as never }),
    ];

    const collected = collectSessionTagVocabularies(sessions);

    expect(collected.mistakeTags).toEqual(['time trouble', 'hung a piece']);
    expect(collected.studyTags).toEqual(['endgames']);
  });

  it('reads tag lists that are still JSON-encoded and skips corrupt ones', () => {
    const sessions = [
      makeSession({ id: 1, mistakeTags: JSON.stringify(['hung a piece']) as never }),
      makeSession({ id: 2, mistakeTags: '"3"' as never }),
      makeSession({ id: 3, mistakeTags: null as never }),
    ];

    expect(collectSessionTagVocabularies(sessions).mistakeTags).toEqual(['hung a piece']);
  });
});

describe('rebuildVocabularies', () => {
  it('restores an emptied mistake vocabulary from the tags used on games', () => {
    const preferences = makePreferences();

    const repaired = rebuildVocabularies(
      preferences,
      { studyTags: [], mistakeTags: ['hung a piece', 'time trouble'] },
      SEEDED_STUDY_TAGS,
    );

    expect(repaired.customMistakeTags).toEqual(['hung a piece', 'time trouble']);
  });

  it('leaves a curated vocabulary alone so deleted tags stay deleted', () => {
    const preferences = makePreferences({ customMistakeTags: ['hung a piece'] });

    const repaired = rebuildVocabularies(
      preferences,
      { studyTags: [], mistakeTags: ['hung a piece', 'time trouble'] },
      SEEDED_STUDY_TAGS,
    );

    expect(repaired).toBe(preferences);
  });

  it('refills study tags only when they still match the seeded defaults', () => {
    const reset = rebuildVocabularies(
      makePreferences(),
      { studyTags: ['endgames'], mistakeTags: [] },
      SEEDED_STUDY_TAGS,
    );
    expect(reset.customTags).toEqual([...SEEDED_STUDY_TAGS, 'endgames']);

    const curated = makePreferences({ customTags: ['openings'] });
    expect(
      rebuildVocabularies(curated, { studyTags: ['endgames'], mistakeTags: [] }, SEEDED_STUDY_TAGS),
    ).toBe(curated);
  });

  it('respects the vocabulary caps', () => {
    const sessionMistakeTags = Array.from({ length: 25 }, (_, i) => `mistake ${i}`);

    const repaired = rebuildVocabularies(
      makePreferences(),
      { studyTags: [], mistakeTags: sessionMistakeTags },
      SEEDED_STUDY_TAGS,
    );

    expect(repaired.customMistakeTags).toHaveLength(20);
  });

  it('returns the same object when there is nothing to recover', () => {
    const preferences = makePreferences();

    expect(
      rebuildVocabularies(preferences, { studyTags: [], mistakeTags: [] }, SEEDED_STUDY_TAGS),
    ).toBe(preferences);
  });
});
