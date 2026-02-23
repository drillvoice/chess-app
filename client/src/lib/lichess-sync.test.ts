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

import { getSyncStatus, mapLichessTimeControl, startLichessSync } from './lichess-sync';
import { createSession } from './firebase';

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('startLichessSync', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    invalidateQueriesMock.mockClear();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
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

    // Set initial timestamp so test games aren't filtered out
    localStorage.setItem('lichess-last-game-testuser', '1000');

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

  it('handles API errors gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Server error',
    });
    (globalThis as any).fetch = fetchMock;

    localStorage.setItem('lichess-last-game-testuser', '1000');

    const stopSync = startLichessSync('TestUser');

    await flushPromises();
    await flushPromises();

    expect(createSession).not.toHaveBeenCalled();
    expect(invalidateQueriesMock).not.toHaveBeenCalled();

    stopSync?.();
  });

  it('handles network errors gracefully', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network failed'));
    (globalThis as any).fetch = fetchMock;

    localStorage.setItem('lichess-last-game-testuser', '1000');

    const stopSync = startLichessSync('TestUser');

    await flushPromises();
    await flushPromises();

    expect(createSession).not.toHaveBeenCalled();
    expect(invalidateQueriesMock).not.toHaveBeenCalled();

    stopSync?.();
  });

  it('does not start a new poll while a previous poll is in flight', async () => {
    vi.useFakeTimers();
    let resolveFetch: ((value: any) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    (globalThis as any).fetch = fetchMock;

    localStorage.setItem('lichess-last-game-testuser', '1000');

    const stopSync = startLichessSync('TestUser');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.({
      ok: true,
      json: async () => ({ games: [] }),
    });
    await Promise.resolve();
    await Promise.resolve();

    stopSync?.();
    vi.useRealTimers();
  });

  it('increments gamesImported using successfully imported sessions only', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        games: [
          {
            id: 'old-game',
            lastMoveAt: 2000,
            createdAt: 1000,
            players: {
              white: { user: { name: 'TestUser' } },
              black: { user: { name: 'Opponent' } },
            },
            winner: 'white',
            clock: { initial: 600, increment: 0 },
          },
          {
            id: 'new-game',
            lastMoveAt: 3000,
            createdAt: 2000,
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

    localStorage.setItem('lichess-last-game-testuser', '2500');
    const initialImported = getSyncStatus().gamesImported;

    const stopSync = startLichessSync('TestUser');

    await flushPromises();
    await flushPromises();

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(getSyncStatus().gamesImported - initialImported).toBe(1);

    stopSync?.();
  });

  it('skips games with invalid timestamps', async () => {
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
          {
            id: 'game2',
            // missing timestamps
            players: {
              white: { user: { name: 'TestUser' } },
              black: { user: { name: 'Opponent' } },
            },
            winner: 'white',
          },
        ],
      }),
    });
    (globalThis as any).fetch = fetchMock;

    localStorage.setItem('lichess-last-game-testuser', '1000');

    const stopSync = startLichessSync('TestUser');

    await flushPromises();
    await flushPromises();

    // Should only import the valid game
    expect(createSession).toHaveBeenCalledTimes(1);

    stopSync?.();
  });
});

describe('mapLichessTimeControl', () => {
  it.each([
    { expected: 'bullet', initial: 1, increment: 1 },
    { expected: 'blitz', initial: 3, increment: 2 },
    { expected: 'rapid', initial: 10, increment: 5 },
    { expected: 'classical', initial: 30, increment: 0 },
  ])('categorises $initial+$increment games as $expected', ({ expected, initial, increment }) => {
    expect(mapLichessTimeControl(initial, increment)).toBe(expected);
  });
});
