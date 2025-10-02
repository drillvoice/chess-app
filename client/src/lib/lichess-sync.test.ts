import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';

vi.mock('./firebase', () => ({
  createSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./queryClient', () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

import { startLichessSync } from './lichess-sync';
import { createSession } from './firebase';

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('startLichessSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).fetch;
  });

  it('requests games strictly after the stored timestamp', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        game: {
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

    stopSync?.();
  });
});
