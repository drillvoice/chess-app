import { describe, it, expect } from 'vitest';
import type { DailyGoalSettings, TrainingSession } from '@shared/schema';
import { SessionAnalyzer } from './daily-goals-progress';

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

describe('SessionAnalyzer', () => {
  describe('summarizeSessions', () => {
    it('aggregates tactics minutes, study minutes, and game count in one pass', () => {
      const today = new Date();
      const sessions: TrainingSession[] = [
        createSession({ type: 'tactics', duration: 15 }, 1, today),
        createSession({ type: 'study', duration: 20 }, 2, today),
        createSession({ type: 'game' }, 3, today),
        createSession({ type: 'goal' }, 4, today),
      ];

      const summary = SessionAnalyzer.summarizeSessions(sessions);

      expect(summary).toEqual({
        tacticsMinutes: 15,
        studyMinutes: 20,
        gamesCount: 1,
      });
    });
  });

  describe('calculateProgress', () => {
    it('returns progress totals derived from summarized sessions', () => {
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const sessions: TrainingSession[] = [
        createSession({ type: 'tactics', duration: 10 }, 1, today),
        createSession({ type: 'study', duration: 5 }, 2, today),
        createSession({ type: 'game' }, 3, today),
        createSession({ type: 'tactics', duration: 50 }, 4, yesterday),
      ];

      const settings: DailyGoalSettings = {
        tacticsMinutes: 15,
        studyMinutes: 10,
        gamesCount: 2,
        isCustomized: true,
        autoTracking: true,
      };

      const progress = SessionAnalyzer.calculateProgress(sessions, settings);

      expect(progress).toEqual({
        tactics: {
          completed: 10,
          target: 15,
          unit: 'minutes',
          isComplete: false,
        },
        study: {
          completed: 5,
          target: 10,
          unit: 'minutes',
          isComplete: false,
        },
        game: {
          completed: 1,
          target: 2,
          unit: 'count',
          isComplete: false,
        },
      });
    });

    it('handles missing settings by defaulting targets to zero', () => {
      const today = new Date();
      const sessions: TrainingSession[] = [
        createSession({ type: 'tactics', duration: 5 }, 1, today),
        createSession({ type: 'study', duration: 5 }, 2, today),
        createSession({ type: 'game' }, 3, today),
      ];

      const progress = SessionAnalyzer.calculateProgress(sessions, null);

      expect(progress).toEqual({
        tactics: {
          completed: 5,
          target: 0,
          unit: 'minutes',
          isComplete: false,
        },
        study: {
          completed: 5,
          target: 0,
          unit: 'minutes',
          isComplete: false,
        },
        game: {
          completed: 1,
          target: 0,
          unit: 'count',
          isComplete: false,
        },
      });
    });
  });
});
