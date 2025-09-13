import { describe, expect, it } from 'vitest';
import {
  tacticsSessionSchema,
  gameSessionSchema,
  studySessionSchema,
  goalSessionSchema,
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
