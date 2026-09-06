import { describe, expect, it } from 'vitest';
import type { TrainingSession } from '@shared/schema';
import { computeMistakeStats } from './mistake-stats';

const NOW = new Date('2026-06-15T12:00:00');

function gameSession(
  id: number,
  daysAgo: number,
  mistakeTags: unknown,
  overrides: Partial<TrainingSession> = {},
): TrainingSession {
  const date = new Date(NOW);
  date.setHours(9, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);

  return {
    id,
    type: 'game',
    date,
    gameResult: 'loss',
    mistakeTags: typeof mistakeTags === 'string' ? mistakeTags : JSON.stringify(mistakeTags),
    ...overrides,
  } as TrainingSession;
}

describe('computeMistakeStats', () => {
  it('counts each tag across all game sessions', () => {
    const stats = computeMistakeStats(
      [
        gameSession(1, 0, ['hung a piece', 'time trouble']),
        gameSession(2, 3, ['hung a piece']),
        gameSession(3, 200, ['missed a fork']),
      ],
      'all',
      NOW,
    );

    expect(stats.tags).toEqual([
      { tag: 'hung a piece', key: 'hung a piece', count: 2 },
      { tag: 'missed a fork', key: 'missed a fork', count: 1 },
      { tag: 'time trouble', key: 'time trouble', count: 1 },
    ]);
    expect(stats.totalGames).toBe(3);
    expect(stats.taggedGames).toBe(3);
  });

  it('groups spellings case-insensitively and shows the most recent one', () => {
    const stats = computeMistakeStats(
      [gameSession(1, 0, ['Hung a Piece']), gameSession(2, 5, ['hung a piece'])],
      'all',
      NOW,
    );

    expect(stats.tags).toEqual([{ tag: 'Hung a Piece', key: 'hung a piece', count: 2 }]);
  });

  it('counts a tag once per game even when a record repeats it', () => {
    const stats = computeMistakeStats(
      [gameSession(1, 0, ['hung a piece', 'hung a piece'])],
      'all',
      NOW,
    );

    expect(stats.tags).toEqual([{ tag: 'hung a piece', key: 'hung a piece', count: 1 }]);
    expect(stats.taggedGames).toBe(1);
  });

  it('restricts counts and totals to the selected window', () => {
    const sessions = [
      gameSession(1, 0, ['hung a piece']),
      gameSession(2, 13, ['hung a piece']),
      gameSession(3, 20, ['hung a piece']),
      gameSession(4, 45, ['hung a piece']),
    ];

    expect(computeMistakeStats(sessions, '14d', NOW).tags[0].count).toBe(2);
    expect(computeMistakeStats(sessions, '30d', NOW).tags[0].count).toBe(3);
    expect(computeMistakeStats(sessions, '90d', NOW).tags[0].count).toBe(4);
    expect(computeMistakeStats(sessions, '14d', NOW).totalGames).toBe(2);
  });

  it('ignores non-game sessions and untagged games, but still counts the games', () => {
    const stats = computeMistakeStats(
      [
        gameSession(1, 0, ['hung a piece']),
        gameSession(2, 1, []),
        {
          id: 3,
          type: 'study',
          date: NOW,
          studyTags: JSON.stringify(['endgames']),
        } as TrainingSession,
      ],
      'all',
      NOW,
    );

    expect(stats.tags).toEqual([{ tag: 'hung a piece', key: 'hung a piece', count: 1 }]);
    expect(stats.totalGames).toBe(2);
    expect(stats.taggedGames).toBe(1);
  });

  it('survives corrupt tag payloads and unusable dates', () => {
    const sessions = [
      gameSession(1, 0, '"not-an-array"'),
      gameSession(2, 0, ['  ', 'hung a piece']),
      gameSession(
        3,
        0,
        null as unknown as string,
        { mistakeTags: null } as Partial<TrainingSession>,
      ),
      gameSession(4, 0, ['blunder'], { date: 'not a date' } as unknown as Partial<TrainingSession>),
      gameSession(5, 0, ['blunder'], { date: null } as unknown as Partial<TrainingSession>),
    ];

    const allTime = computeMistakeStats(sessions, 'all', NOW);
    expect(allTime.tags).toEqual([
      { tag: 'blunder', key: 'blunder', count: 2 },
      { tag: 'hung a piece', key: 'hung a piece', count: 1 },
    ]);
    expect(allTime.totalGames).toBe(5);

    // Sessions with an unreadable date can't be placed in a bounded window.
    const recent = computeMistakeStats(sessions, '14d', NOW);
    expect(recent.tags).toEqual([{ tag: 'hung a piece', key: 'hung a piece', count: 1 }]);
    expect(recent.totalGames).toBe(3);
  });

  it('returns empty stats for missing session data', () => {
    expect(computeMistakeStats(undefined, 'all', NOW)).toEqual({
      tags: [],
      totalGames: 0,
      taggedGames: 0,
    });
  });
});
