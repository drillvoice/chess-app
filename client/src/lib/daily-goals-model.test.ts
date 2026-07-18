import { describe, it, expect } from 'vitest';
import { resolveGoals, sanitizeDailyGoalSettings, tagGoalId } from './daily-goals-model';

describe('sanitizeDailyGoalSettings', () => {
  it('returns disabled defaults for non-object input', () => {
    for (const raw of [null, undefined, 'junk', 42]) {
      expect(sanitizeDailyGoalSettings(raw)).toEqual({
        tacticsMinutes: undefined,
        gamesCount: undefined,
        studyMinutes: undefined,
        tagGoals: [],
        isCustomized: false,
        autoTracking: false,
        lastModified: undefined,
      });
    }
  });

  it('drops non-finite built-in targets and clamps to 99', () => {
    const result = sanitizeDailyGoalSettings({
      tacticsMinutes: NaN,
      gamesCount: Infinity,
      studyMinutes: 500,
    });
    expect(result.tacticsMinutes).toBeUndefined();
    expect(result.gamesCount).toBeUndefined();
    expect(result.studyMinutes).toBe(99);
  });

  it('preserves 0 (disabled) built-in targets', () => {
    expect(sanitizeDailyGoalSettings({ gamesCount: 0 }).gamesCount).toBe(0);
  });

  it('drops corrupt tag-goal entries', () => {
    const result = sanitizeDailyGoalSettings({
      tagGoals: [
        { id: 'x', tag: 'anki', target: 1 },
        { tag: '', target: 2 },
        { tag: 'bad<tag>', target: 2 },
        { tag: 'chessable', target: NaN },
        { tag: 'chessable', target: 0 },
        { tag: 'chessable', target: 100 },
        'garbage',
        null,
      ],
    });
    expect(result.tagGoals).toEqual([{ id: 'tag:anki', tag: 'anki', target: 1, label: undefined }]);
  });

  it('forces deterministic ids and dedupes by normalized tag', () => {
    const result = sanitizeDailyGoalSettings({
      tagGoals: [
        { id: 'whatever', tag: 'Anki', target: 1 },
        { id: 'other', tag: 'anki ', target: 3 },
      ],
    });
    expect(result.tagGoals).toHaveLength(1);
    expect(result.tagGoals?.[0].id).toBe('tag:anki');
    expect(result.tagGoals?.[0].target).toBe(1);
  });

  it('caps tag goals at 10', () => {
    const tagGoals = Array.from({ length: 15 }, (_, i) => ({ tag: `tag${i}`, target: 1 }));
    expect(sanitizeDailyGoalSettings({ tagGoals }).tagGoals).toHaveLength(10);
  });

  it('drops invalid lastModified values', () => {
    expect(sanitizeDailyGoalSettings({ lastModified: 'not-a-date' }).lastModified).toBeUndefined();
    expect(sanitizeDailyGoalSettings({ lastModified: new Date(NaN) }).lastModified).toBeUndefined();
    const valid = sanitizeDailyGoalSettings({ lastModified: '2026-01-01T00:00:00.000Z' });
    expect(valid.lastModified).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('is idempotent', () => {
    const once = sanitizeDailyGoalSettings({
      tacticsMinutes: 10,
      tagGoals: [{ tag: 'Step Method', target: 3 }],
      isCustomized: true,
      autoTracking: true,
      lastModified: '2026-01-01T00:00:00.000Z',
    });
    expect(sanitizeDailyGoalSettings(once)).toEqual(once);
  });
});

describe('resolveGoals', () => {
  const customized = (overrides: object) =>
    sanitizeDailyGoalSettings({ isCustomized: true, ...overrides });

  it('returns the classic default goals when not customized', () => {
    const goals = resolveGoals(null);
    expect(goals.map((g) => g.id)).toEqual(['tactics', 'study', 'game']);
    expect(goals.every((g) => g.target === 0)).toBe(true);
  });

  it('includes only built-ins with a positive target when customized', () => {
    const goals = resolveGoals(customized({ tacticsMinutes: 10, gamesCount: 2, studyMinutes: 0 }));
    expect(goals.map((g) => g.id)).toEqual(['tactics', 'game']);
    expect(goals[0].label).toBe('Practice tactics for 10 minutes');
    expect(goals[1].label).toBe('Play 2 games');
  });

  it('uses tag config unit + quantity mode when the tag has a configured unit', () => {
    const goals = resolveGoals(customized({ tagGoals: [{ tag: 'Step Method', target: 3 }] }), {
      'step method': { unitLabel: 'modules', minutesPerUnit: 10 },
    });
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({
      id: 'tag:step method',
      kind: 'tag',
      tag: 'Step Method',
      target: 3,
      unitLabel: 'modules',
      useQuantity: true,
      label: 'Step Method: 3 modules',
    });
  });

  it('falls back to session counting when the tag has no unit config', () => {
    const goals = resolveGoals(customized({ tagGoals: [{ tag: 'anki', target: 1 }] }));
    expect(goals[0]).toMatchObject({ unitLabel: 'sessions', useQuantity: false });
    expect(goals[0].label).toBe('anki: 1 sessions');
  });
});

describe('tagGoalId', () => {
  it('normalizes case and whitespace', () => {
    expect(tagGoalId(' Anki ')).toBe('tag:anki');
  });
});
