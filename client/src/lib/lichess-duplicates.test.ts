import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainingSession } from '@shared/schema';

const getAllSessions = vi.hoisted(() => vi.fn());
const updateSession = vi.hoisted(() => vi.fn());
const deleteSession = vi.hoisted(() => vi.fn());

vi.mock('./firebase/firestore', () => ({ getAllSessions, updateSession, deleteSession }));

import { mergeDuplicateLichessGames, planLichessDuplicateMerge } from './lichess-duplicates';

const GAME_END = '2025-03-01T18:30:00.123Z';

function lichessCopy(id: number, overrides: Record<string, unknown> = {}): TrainingSession {
  return {
    id,
    type: 'game',
    platform: 'lichess',
    date: new Date(GAME_END),
    updatedAt: new Date(GAME_END),
    needsReview: true,
    gameComments: '',
    mistakeTags: [],
    gameResult: 'win',
    playerColor: 'white',
    ...overrides,
  } as unknown as TrainingSession;
}

describe('planLichessDuplicateMerge', () => {
  it('ignores games that have a single copy', () => {
    const sessions = [
      lichessCopy(1),
      lichessCopy(2, { date: new Date('2025-03-02T10:00:00.000Z') }),
    ];

    expect(planLichessDuplicateMerge(sessions)).toEqual([]);
  });

  it('keeps the lowest id and deletes the other copies', () => {
    const [plan] = planLichessDuplicateMerge([lichessCopy(30), lichessCopy(10), lichessCopy(20)]);

    expect(plan.survivorId).toBe(10);
    expect(plan.duplicateIds).toEqual([20, 30]);
    expect(plan.patch).toEqual({});
  });

  it('carries the review and archive state of any copy onto the survivor', () => {
    const [plan] = planLichessDuplicateMerge([
      lichessCopy(1, { needsReview: true }),
      lichessCopy(2, { needsReview: false }),
    ]);

    expect(plan.patch.needsReview).toBe(false);
  });

  it('unions mistake tags and keeps every distinct comment', () => {
    const [plan] = planLichessDuplicateMerge([
      lichessCopy(1, { mistakeTags: ['hung a piece'], gameComments: 'Lost the thread at move 20' }),
      lichessCopy(2, {
        mistakeTags: ['hung a piece', 'time trouble'],
        gameComments: 'Lost the thread at move 20',
      }),
      lichessCopy(3, { gameComments: 'Should have castled' }),
    ]);

    expect(plan.patch.mistakeTags).toEqual(['hung a piece', 'time trouble']);
    expect(plan.patch.gameComments).toBe('Lost the thread at move 20\n\nShould have castled');
  });

  it('fills fields the survivor lacks from the most recently edited copy', () => {
    const [plan] = planLichessDuplicateMerge([
      lichessCopy(1, { openingName: null, gameResult: 'win' }),
      lichessCopy(2, { openingName: 'French Defense', updatedAt: new Date('2025-03-02') }),
      lichessCopy(3, { openingName: 'Sicilian', updatedAt: new Date('2025-03-05') }),
    ]);

    expect(plan.patch.openingName).toBe('Sicilian');
    // The survivor's own values are never replaced.
    expect(plan.patch).not.toHaveProperty('gameResult');
  });

  it('leaves non-Lichess sessions and hand-redated copies alone', () => {
    const sessions = [
      lichessCopy(1, { platform: 'chess.com' }),
      lichessCopy(2, { platform: 'chess.com' }),
      lichessCopy(3),
      lichessCopy(4, { date: new Date('2025-03-01T18:30:00.000Z') }),
    ];

    expect(planLichessDuplicateMerge(sessions)).toEqual([]);
  });

  it('never deletes the lowest id, whatever subset of copies a device sees', () => {
    const all = [lichessCopy(1), lichessCopy(2), lichessCopy(3)];
    const views = [all, [all[1], all[2]], [all[0], all[2]]];

    for (const view of views) {
      const [plan] = planLichessDuplicateMerge(view);
      expect(plan.duplicateIds).not.toContain(1);
    }
  });
});

describe('mergeDuplicateLichessGames', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSession.mockResolvedValue(null);
    deleteSession.mockResolvedValue(true);
  });

  it('updates the survivor before deleting the copies', async () => {
    getAllSessions.mockResolvedValue([
      lichessCopy(1),
      lichessCopy(2, { needsReview: false, mistakeTags: ['missed tactic'] }),
    ]);
    const calls: string[] = [];
    updateSession.mockImplementation(async (id: number) => {
      calls.push(`update:${id}`);
      return null;
    });
    deleteSession.mockImplementation(async (id: number) => {
      calls.push(`delete:${id}`);
      return true;
    });

    const result = await mergeDuplicateLichessGames();

    expect(calls).toEqual(['update:1', 'delete:2']);
    expect(updateSession).toHaveBeenCalledWith(1, {
      needsReview: false,
      mistakeTags: ['missed tactic'],
    });
    expect(result).toEqual({ gamesMerged: 1, copiesRemoved: 1, failures: 0 });
  });

  it('keeps every copy of a game whose survivor update fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getAllSessions.mockResolvedValue([lichessCopy(1), lichessCopy(2, { needsReview: false })]);
    updateSession.mockRejectedValue(new Error('disk full'));

    const result = await mergeDuplicateLichessGames();

    expect(deleteSession).not.toHaveBeenCalled();
    expect(result.failures).toBe(1);
  });

  it('writes nothing when there are no duplicates', async () => {
    getAllSessions.mockResolvedValue([lichessCopy(1)]);

    await mergeDuplicateLichessGames();

    expect(updateSession).not.toHaveBeenCalled();
    expect(deleteSession).not.toHaveBeenCalled();
  });
});
