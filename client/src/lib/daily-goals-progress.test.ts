import { describe, it, expect } from 'vitest';
import type { TrainingSession } from '@shared/schema';
import { SessionAnalyzer, ProgressFormatter } from './daily-goals-progress';
import { resolveGoals, sanitizeDailyGoalSettings } from './daily-goals-model';

const createSession = (
  overrides: Partial<TrainingSession>,
  id: number,
  date: Date = new Date(),
): TrainingSession => {
  const base: TrainingSession = {
    id,
    type: 'tactics',
    date,
    duration: 0,
    pointsGained: null,
    finalScore: null,
    puzzlesAttempted: null,
    puzzlesCorrect: null,
    tacticsNotes: null,
    gameResult: null,
    gameType: null,
    gameComments: null,
    playerColor: null,
    platform: null,
    timeControl: null,
    opponentUsername: null,
    openingName: null,
    openingEco: null,
    needsReview: false,
    studyType: null,
    studyTags: null,
    studyNotes: null,
    quantity: null,
    primaryStudyTag: null,
    goalTitle: null,
    goalDescription: null,
    goalWeekStart: null,
  };
  return { ...base, ...overrides } as TrainingSession;
};

const customizedSettings = (overrides: object) =>
  sanitizeDailyGoalSettings({ isCustomized: true, autoTracking: true, ...overrides });

describe('SessionAnalyzer.calculateProgress', () => {
  it('measures built-in goals from today’s sessions only', () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const sessions: TrainingSession[] = [
      createSession({ type: 'tactics', duration: 10 }, 1, today),
      createSession({ type: 'study', duration: 5 }, 2, today),
      createSession({ type: 'game' }, 3, today),
      createSession({ type: 'tactics', duration: 50 }, 4, yesterday),
    ];

    const goals = resolveGoals(
      customizedSettings({ tacticsMinutes: 15, studyMinutes: 10, gamesCount: 2 }),
    );
    const progress = SessionAnalyzer.calculateProgress(sessions, goals);

    expect(progress).toEqual([
      { goalId: 'tactics', completed: 10, target: 15, unitLabel: 'min', isComplete: false },
      { goalId: 'study', completed: 5, target: 10, unitLabel: 'min', isComplete: false },
      { goalId: 'game', completed: 1, target: 2, unitLabel: 'games', isComplete: false },
    ]);
  });

  it('sums logged quantity for tag goals with a configured unit', () => {
    const sessions: TrainingSession[] = [
      createSession(
        {
          type: 'study',
          duration: 30,
          quantity: 2,
          primaryStudyTag: 'Step Method',
          studyTags: JSON.stringify(['Step Method']),
        },
        1,
      ),
      createSession(
        {
          type: 'study',
          duration: 15,
          quantity: 1,
          primaryStudyTag: 'step method',
          studyTags: JSON.stringify(['step method']),
        },
        2,
      ),
      // Different primary tag: must not count.
      createSession(
        {
          type: 'study',
          duration: 15,
          quantity: 5,
          primaryStudyTag: 'reading',
          studyTags: JSON.stringify(['reading', 'step method']),
        },
        3,
      ),
    ];

    const goals = resolveGoals(
      customizedSettings({ tagGoals: [{ tag: 'step method', target: 3 }] }),
      { 'step method': { unitLabel: 'modules', minutesPerUnit: 10 } },
    );
    const progress = SessionAnalyzer.calculateProgress(sessions, goals);

    expect(progress).toEqual([
      {
        goalId: 'tag:step method',
        completed: 3,
        target: 3,
        unitLabel: 'modules',
        isComplete: true,
      },
    ]);
  });

  it('counts sessions carrying the tag when there is no unit config', () => {
    const sessions: TrainingSession[] = [
      createSession(
        { type: 'study', duration: 10, studyTags: JSON.stringify(['Anki', 'reading']) },
        1,
      ),
      createSession({ type: 'study', duration: 10, studyTags: JSON.stringify(['anki']) }, 2),
      createSession({ type: 'study', duration: 10, studyTags: JSON.stringify(['reading']) }, 3),
      createSession({ type: 'tactics', duration: 10 }, 4),
    ];

    const goals = resolveGoals(customizedSettings({ tagGoals: [{ tag: 'anki', target: 1 }] }));
    const progress = SessionAnalyzer.calculateProgress(sessions, goals);

    expect(progress[0]).toEqual({
      goalId: 'tag:anki',
      completed: 2,
      target: 1,
      unitLabel: 'sessions',
      isComplete: true,
    });
  });

  it('tolerates malformed studyTags JSON and non-finite quantities', () => {
    const sessions: TrainingSession[] = [
      createSession({ type: 'study', duration: 10, studyTags: 'not-json{' }, 1),
      createSession({ type: 'study', duration: 10, studyTags: JSON.stringify('3') }, 2),
      createSession(
        {
          type: 'study',
          duration: 10,
          quantity: NaN,
          primaryStudyTag: 'chessable',
          studyTags: JSON.stringify(['chessable']),
        },
        3,
      ),
    ];

    const countGoals = resolveGoals(
      customizedSettings({ tagGoals: [{ tag: 'chessable', target: 2 }] }),
    );
    expect(SessionAnalyzer.calculateProgress(sessions, countGoals)[0].completed).toBe(1);

    const quantityGoals = resolveGoals(
      customizedSettings({ tagGoals: [{ tag: 'chessable', target: 2 }] }),
      { chessable: { unitLabel: 'sessions', minutesPerUnit: 10 } },
    );
    expect(SessionAnalyzer.calculateProgress(sessions, quantityGoals)[0].completed).toBe(0);
  });
});

describe('ProgressFormatter', () => {
  it('formats progress with the goal unit label', () => {
    expect(
      ProgressFormatter.formatProgress({
        goalId: 'tag:anki',
        completed: 1,
        target: 2,
        unitLabel: 'sessions',
        isComplete: false,
      }),
    ).toBe('1/2 sessions');
  });

  it('caps completion percentage at 100', () => {
    expect(
      ProgressFormatter.getCompletionPercentage({
        goalId: 'game',
        completed: 5,
        target: 2,
        unitLabel: 'games',
        isComplete: true,
      }),
    ).toBe(100);
  });
});
