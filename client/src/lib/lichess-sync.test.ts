import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';

const createSessionMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const invalidateQueriesMock = vi.hoisted(() => vi.fn());

vi.mock('./firebase', () => ({
  createSession: createSessionMock,
}));

vi.mock('./queryClient', () => ({
  queryClient: {
    invalidateQueries: invalidateQueriesMock,
  },
}));

import { startLichessSync } from './lichess-sync';
import { createSession } from './firebase';

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('startLichessSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    invalidateQueriesMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).fetch;
  });

  it('requests games strictly after the stored timestamp', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        games: [
          {
            id: 'game1',
            lastMoveAt: 2000,
            createdAt: 1000,
            players: {
              white: { user: { name: 'TestUser' } },
              black: { user: { name: 'Opponent' } },
            },
            winner: 'white',
            clock: { initial: 600, increment: 0 },
          },
        ],
      }),
    });
    (globalThis as any).fetch = fetchMock;

    localStorage.setItem('lichess-last-game-testuser', '1999');

    const stopSync = startLichessSync('TestUser');

    await flushPromises();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0] as string, 'https://example.com');
    expect(url.searchParams.get('since')).toBe('2000');

    expect(localStorage.getItem('lichess-last-game-testuser')).toBe('2000');
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'lichess',
        gameResult: 'win',
      }),
    );

    expect(invalidateQueriesMock).toHaveBeenCalledTimes(3);

    stopSync?.();
  });

  it('imports multiple games in order and updates timestamp after each save', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        games: [
          {
            id: 'game2',
            lastMoveAt: 4000,
            createdAt: 2000,
            players: {
              white: { user: { name: 'Opponent' } },
              black: { user: { name: 'TestUser' } },
            },
            winner: 'black',
            clock: { initial: 900, increment: 0 },
          },
          {
            id: 'game1',
            lastMoveAt: 3000,
            createdAt: 1500,
            players: {
              white: { user: { name: 'TestUser' } },
              black: { user: { name: 'Opponent' } },
            },
            winner: 'white',
            clock: { initial: 600, increment: 0 },
          },
        ],
      }),
    });
    (globalThis as any).fetch = fetchMock;

    const stopSync = startLichessSync('TestUser');

    await flushPromises();
    await flushPromises();

    expect(createSession).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('lichess-last-game-testuser')).toBe('4000');
    expect(invalidateQueriesMock).toHaveBeenCalledTimes(3);

    stopSync?.();
  });

  it('does not advance the stored timestamp when createSession fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        games: [
          {
            id: 'game1',
            lastMoveAt: 2000,
            createdAt: 1000,
            players: {
              white: { user: { name: 'TestUser' } },
              black: { user: { name: 'Opponent' } },
            },
            winner: 'white',
            clock: { initial: 600, increment: 0 },
          },
        ],
      }),
    });
    (globalThis as any).fetch = fetchMock;

    localStorage.setItem('lichess-last-game-testuser', '1500');
    vi.mocked(createSession).mockRejectedValueOnce(new Error('failed'));

    const stopSync = startLichessSync('TestUser');

    await flushPromises();
    await flushPromises();

    expect(localStorage.getItem('lichess-last-game-testuser')).toBe('1500');
    expect(invalidateQueriesMock).not.toHaveBeenCalled();

    stopSync?.();
  });
});
