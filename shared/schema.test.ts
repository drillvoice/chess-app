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

const keys = (schema: { shape: Record<string, unknown> }) =>
  Object.keys(schema.shape);

describe('session schema field omission', () => {
  it('tactics session omits game, study and goal fields', () => {
    const shape = keys(tacticsSessionSchema);
    [...gameFields, ...studyFields, ...goalFields].forEach((field) => {
      expect(shape).not.toContain(field);
    });
  });

  it('game session omits tactics, study, goal fields plus gameType and duration', () => {
    const shape = keys(gameSessionSchema);
    [...tacticsFields, ...studyFields, ...goalFields, 'gameType', 'duration'].forEach(
      (field) => {
        expect(shape).not.toContain(field);
      },
    );
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

