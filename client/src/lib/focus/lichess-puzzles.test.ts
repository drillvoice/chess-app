import { describe, expect, it, vi } from 'vitest';
import {
  fetchFocusPuzzles,
  LichessUnauthorizedError,
  parseLichessPuzzle,
  submitPuzzleResults,
} from './lichess-puzzles';
import { MATE_IN_2_RAW } from './test-fixtures';

describe('parseLichessPuzzle', () => {
  it('rebuilds the puzzle position from the game PGN', () => {
    const puzzle = parseLichessPuzzle(MATE_IN_2_RAW);
    expect(puzzle.id).toBe('FyTck');
    expect(puzzle.rating).toBe(1391);
    expect(puzzle.lastMove).toBe('c4e6');
    // Black to move after White's Qe6.
    expect(puzzle.fen.split(' ')[1]).toBe('b');
    expect(puzzle.solution).toEqual(['g5e3', 'b6e3', 'g6g2']);
  });

  it('uses a FEN when one is provided', () => {
    const puzzle = parseLichessPuzzle({
      puzzle: {
        id: 'abc',
        rating: 'oops',
        solution: ['d6e4', 'f6g6', 'e4g5'],
        fen: '8/p7/3N1k2/1P3br1/2Pp2p1/8/3K4/5R2 w - - 1 1',
        lastMove: 'g8g5',
      },
    });
    expect(puzzle.fen).toBe('8/p7/3N1k2/1P3br1/2Pp2p1/8/3K4/5R2 w - - 1 1');
    expect(puzzle.rating).toBeNull();
    expect(puzzle.lastMove).toBe('g8g5');
  });

  it('rejects puzzles whose solution is illegal', () => {
    const raw = structuredClone(MATE_IN_2_RAW);
    raw.puzzle.solution = ['a1a8'];
    expect(() => parseLichessPuzzle(raw)).toThrow(/illegal/);
  });

  it('rejects payloads without an id or solution', () => {
    expect(() => parseLichessPuzzle({})).toThrow(/missing an id/);
    expect(() => parseLichessPuzzle({ puzzle: { id: 'x', solution: [] } })).toThrow(/no solution/);
  });
});

describe('fetchFocusPuzzles', () => {
  it('requests the themed batch and skips malformed entries', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn(
      async (_url: string) =>
        new Response(JSON.stringify({ puzzles: [MATE_IN_2_RAW, { puzzle: {} }] }), { status: 200 }),
    );
    const puzzles = await fetchFocusPuzzles('pin', 'harder', 10, {
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(puzzles).toHaveLength(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://lichess.org/api/puzzle/batch/pin?nb=10&difficulty=harder',
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('surfaces the HTTP status on failure', async () => {
    const fetchImpl = vi.fn(async () => new Response('Too many requests', { status: 429 }));
    await expect(
      fetchFocusPuzzles('pin', 'normal', 5, { fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toThrow(/status 429.*Too many requests/);
  });

  it('fails loudly when nothing usable comes back', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ puzzles: [] })));
    await expect(
      fetchFocusPuzzles('pin', 'normal', 5, { fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toThrow(/no usable puzzles/);
  });
});

describe('authenticated requests', () => {
  it('sends the bearer token when fetching', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ puzzles: [MATE_IN_2_RAW] })),
    );
    await fetchFocusPuzzles('pin', 'normal', 5, {
      token: 'lip_abc',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const init = fetchImpl.mock.calls[0][1];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer lip_abc');
  });

  it('turns a 401 into LichessUnauthorizedError', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }));
    await expect(
      fetchFocusPuzzles('pin', 'normal', 5, {
        token: 'dead',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(LichessUnauthorizedError);
  });

  it('posts rated results and reads rating changes', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            puzzles: [],
            glicko: { rating: 1612.4, deviation: 70 },
            rounds: [
              { id: 'a', win: true, ratingDiff: 7 },
              { id: 'b', win: false, ratingDiff: 'x' },
            ],
          }),
        ),
    );
    const result = await submitPuzzleResults(
      'pin',
      [
        { id: 'a', win: true },
        { id: 'b', win: false },
      ],
      'lip_abc',
      fetchImpl as typeof fetch,
    );
    expect(result).toEqual({ ratingDiffs: { a: 7 }, rating: 1612 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://lichess.org/api/puzzle/batch/pin?nb=0');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      solutions: [
        { id: 'a', win: true, rated: true },
        { id: 'b', win: false, rated: true },
      ],
    });
  });
});
