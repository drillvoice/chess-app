import { describe, expect, it } from 'vitest';
import {
  tacticsSessionSchema,
  tacticsSessionValidationSchema,
  gameSessionSchema,
  studySessionSchema,
  goalSessionSchema,
  insertTrainingSessionSchema,
  userStudyPreferencesSchema,
  dailyGoalSettingsSchema,
  gameFields,
  studyFields,
  goalFields,
  tacticsFields,
} from './schema';

const keys = (schema: { shape: Record<string, unknown> }) => Object.keys(schema.shape);

describe('session schema field omission', () => {
  it('tactics session omits game, study and goal fields', () => {
    const shape = keys(tacticsSessionSchema);
    [...gameFields, ...studyFields, ...goalFields].forEach((field) => {
      expect(shape).not.toContain(field);
    });
  });

  it('game session omits tactics, study, goal fields plus gameType and duration', () => {
    const shape = keys(gameSessionSchema);
    [...tacticsFields, ...studyFields, ...goalFields, 'gameType', 'duration'].forEach((field) => {
      expect(shape).not.toContain(field);
    });
  });

  it('study session omits tactics, game and goal fields', () => {
    const shape = keys(studySessionSchema);
    [...tacticsFields, ...gameFields, ...goalFields].forEach((field) => {
      expect(shape).not.toContain(field);
    });
  });

  it('goal session omits tactics, game and study fields and duration', () => {
    const shape = keys(goalSessionSchema);
    [...tacticsFields, ...gameFields, ...studyFields, 'duration'].forEach((field) => {
      expect(shape).not.toContain(field);
    });
  });
});

describe('session schema validation', () => {
  it('validates tactics sessions', () => {
    const valid = { type: 'tactics', duration: 5 } as any;
    expect(tacticsSessionSchema.parse(valid)).toMatchObject(valid);
    expect(() => tacticsSessionSchema.parse({ type: 'tactics' } as any)).toThrow();
  });

  it('validates optional puzzles ratio fields', () => {
    // Only attempted
    const onlyAttempted = { type: 'tactics', duration: 5, puzzlesAttempted: 10 } as any;
    expect(tacticsSessionSchema.parse(onlyAttempted)).toMatchObject(onlyAttempted);

    // Only correct
    const onlyCorrect = { type: 'tactics', duration: 5, puzzlesCorrect: 4 } as any;
    expect(tacticsSessionSchema.parse(onlyCorrect)).toMatchObject(onlyCorrect);

    // Both present with correct <= attempted (valid)
    const bothValid = { type: 'tactics', duration: 5, puzzlesAttempted: 8, puzzlesCorrect: 4 } as any;
    expect(tacticsSessionSchema.parse(bothValid)).toMatchObject(bothValid);
    // Equal should be valid
    const equalValid = { type: 'tactics', duration: 5, puzzlesAttempted: 8, puzzlesCorrect: 8 } as any;
    expect(tacticsSessionValidationSchema.parse(equalValid)).toMatchObject(equalValid);

    // Invalid: correct > attempted
    expect(() =>
      tacticsSessionValidationSchema.parse({
        type: 'tactics',
        duration: 5,
        puzzlesAttempted: 5,
        puzzlesCorrect: 6,
      } as any),
    ).toThrow();
  });

  it('validates game sessions', () => {
    const valid = { type: 'game', gameResult: 'win', playerColor: 'white' } as any;
    expect(gameSessionSchema.parse(valid)).toMatchObject(valid);
    expect(() => gameSessionSchema.parse({ type: 'game' } as any)).toThrow();
  });

  it('validates study sessions', () => {
    const valid = { type: 'study', duration: 10, studyTags: ['book'] } as any;
    expect(studySessionSchema.parse(valid)).toMatchObject({
      ...valid,
      studyTags: ['book'],
    });
    expect(() =>
      studySessionSchema.parse({ type: 'study', duration: 10, studyTags: ['<bad>'] } as any),
    ).toThrow();
  });

  it('validates goal sessions', () => {
    const valid = { type: 'goal', goalTitle: 'Win' } as any;
    expect(goalSessionSchema.parse(valid)).toMatchObject(valid);
    expect(() => goalSessionSchema.parse({ type: 'goal' } as any)).toThrow();
  });
});

describe('date preprocessing', () => {
  const isoString = '2025-01-01T00:00:00.000Z';

  it('accepts ISO strings for goal session week start', () => {
    const parsed = goalSessionSchema.parse({
      type: 'goal',
      goalTitle: 'Win more games',
      goalWeekStart: isoString,
    } as any);
    expect(parsed.goalWeekStart).toBeInstanceOf(Date);
    expect(parsed.goalWeekStart?.toISOString()).toBe(isoString);
  });

  it('accepts ISO strings for base training session date', () => {
    const parsed = insertTrainingSessionSchema.parse({
      type: 'goal',
      date: isoString,
    } as any);
    expect(parsed.date).toBeInstanceOf(Date);
    expect(parsed.date?.toISOString()).toBe(isoString);
  });

  it('accepts ISO strings for user study preferences lastModified', () => {
    const parsed = userStudyPreferencesSchema.parse({
      customTags: ['reading'],
      lastModified: isoString,
    });
    expect(parsed.lastModified).toBeInstanceOf(Date);
    expect(parsed.lastModified?.toISOString()).toBe(isoString);
  });

  it('accepts ISO strings for daily goal settings lastModified', () => {
    const parsed = dailyGoalSettingsSchema.parse({
      lastModified: isoString,
    });
    expect(parsed.lastModified).toBeInstanceOf(Date);
    expect(parsed.lastModified?.toISOString()).toBe(isoString);
  });
});
