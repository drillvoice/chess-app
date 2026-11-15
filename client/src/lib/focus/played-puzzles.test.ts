import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LichessUnauthorizedError } from './lichess-puzzles';
import { loadPlayedCache, PLAYED_CAP, syncPlayedPuzzles } from './played-puzzles';

const line = (id: string, date: number) => JSON.stringify({ date, win: true, puzzle: { id } });

/** A response whose body arrives in several chunks, like Lichess's throttled stream. */
function chunkedResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
        controller.close();
      },
    }),
    { status },
  );
}

function run(fetchImpl: (url: string) => Promise<Response>, onIds = vi.fn()) {
  return syncPlayedPuzzles({
    token: 't',
    username: 'softtalk',
    signal: new AbortController().signal,
    onIds,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}

describe('syncPlayedPuzzles', () => {
  beforeEach(() => localStorage.clear());

  it('streams ids as they arrive, splitting lines across chunks', async () => {
    const onIds = vi.fn();
    const body = `${line('a', 300)}\n${line('b', 200)}\n${line('c', 100)}\n`;
    const fetchImpl = vi.fn(async (_url: string) =>
      chunkedResponse([body.slice(0, 30), body.slice(30, 75), body.slice(75)]),
    );
    const cache = await run(fetchImpl, onIds);

    expect(onIds.mock.calls.flatMap((c) => c[0])).toEqual(['a', 'b', 'c']);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `https://lichess.org/api/puzzle/activity?max=${PLAYED_CAP}`,
    );
    // Fewer than asked for: the whole history is in.
    expect(cache).toMatchObject({ newest: 300, oldest: 100, complete: true });
    expect(loadPlayedCache('softtalk').ids).toEqual(['a', 'b', 'c']);
  });

  it('only fetches new entries once the history is cached', async () => {
    localStorage.setItem(
      'lichess-played-puzzles',
      JSON.stringify({
        username: 'softtalk',
        ids: ['a'],
        newest: 300,
        oldest: 300,
        complete: true,
      }),
    );
    const onIds = vi.fn();
    const fetchImpl = vi.fn(async (_url: string) => chunkedResponse([`${line('new', 400)}\n`]));
    await run(fetchImpl, onIds);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://lichess.org/api/puzzle/activity?since=301');
    expect(onIds.mock.calls.map((c) => c[0])).toEqual([['a'], ['new']]);
    expect(loadPlayedCache('softtalk').ids).toEqual(['new', 'a']);
  });

  it('keeps progress from an interrupted download and resumes from the oldest entry', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(encoder.encode(`${line('a', 300)}\n${line('b', 200)}\n`));
              // The user leaves the page before the stream finishes.
              setTimeout(() => {
                controller.abort();
                c.error(new DOMException('aborted', 'AbortError'));
              }, 0);
            },
          }),
        ),
    );
    await expect(
      syncPlayedPuzzles({
        token: 't',
        username: 'softtalk',
        signal: controller.signal,
        onIds: vi.fn(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow();
    expect(loadPlayedCache('softtalk')).toMatchObject({
      ids: ['a', 'b'],
      oldest: 200,
      complete: false,
    });

    const resume = vi.fn(async (url: string) =>
      chunkedResponse(url.includes('since=') ? [] : [`${line('c', 100)}\n`]),
    );
    await run(resume);
    expect(resume.mock.calls.map((c) => c[0])).toEqual([
      'https://lichess.org/api/puzzle/activity?since=301',
      `https://lichess.org/api/puzzle/activity?max=${PLAYED_CAP - 2}&before=200`,
    ]);
    expect(loadPlayedCache('softtalk')).toMatchObject({ ids: ['a', 'b', 'c'], complete: true });
  });

  it("ignores another user's cache", () => {
    localStorage.setItem(
      'lichess-played-puzzles',
      JSON.stringify({ username: 'someone', ids: ['x'], newest: 1, oldest: 1, complete: true }),
    );
    expect(loadPlayedCache('softtalk').ids).toEqual([]);
  });

  it('reports an expired token', async () => {
    await expect(run(async () => new Response('', { status: 401 }))).rejects.toBeInstanceOf(
      LichessUnauthorizedError,
    );
  });
});
