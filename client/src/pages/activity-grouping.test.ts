import { describe, expect, it } from 'vitest';
import type { TrainingSession } from '@shared/schema';
import { groupSessionsByDate } from './activity';

function makeSession(id: number, daysAgo: number): TrainingSession {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);

  return {
    id,
    type: 'study',
    date,
    quantity: null,
    primaryStudyTag: null,
  } as TrainingSession;
}

describe('groupSessionsByDate', () => {
  it('assigns each session to exactly one time bucket', () => {
    const sessions = [
      makeSession(1, 0),
      makeSession(2, 1),
      makeSession(3, 3),
      makeSession(4, 10),
      makeSession(5, 40),
    ];

    const grouped = groupSessionsByDate(sessions);

    expect(grouped.todaySessions.map((s) => s.id)).toEqual([1]);
    expect(grouped.yesterdaySessions.map((s) => s.id)).toEqual([2]);
    expect(grouped.last7DaysSessions.map((s) => s.id)).toEqual([3]);
    expect(grouped.last30DaysSessions.map((s) => s.id)).toEqual([4]);
    expect(grouped.earlierSessions.map((s) => s.id)).toEqual([5]);

    const allIds = [
      ...grouped.todaySessions,
      ...grouped.yesterdaySessions,
      ...grouped.last7DaysSessions,
      ...grouped.last30DaysSessions,
      ...grouped.earlierSessions,
    ].map((session) => session.id);

    expect(allIds.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
});
