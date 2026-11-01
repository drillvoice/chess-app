import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchLichessGames, LichessUserNotFoundError } from './lichess-api';

const ndjson = (...games: object[]) => games.map((g) => JSON.stringify(g)).join('\n') + '\n';

const textResponse = (status: number, body: string) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
  json: async () => JSON.parse(body),
});

describe('fetchLichessGames', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).fetch;
  });

  it('fetches directly from lichess.org and sorts oldest first', async () => {
    fetchMock.mockResolvedValueOnce(
      textResponse(200, ndjson({ id: 'b', lastMoveAt: 3000 }, { id: 'a', lastMoveAt: 2000 })),
    );

    const games = await fetchLichessGames('Soft Talk', 1234);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin).toBe('https://lichess.org');
    expect(url.pathname).toBe('/api/games/user/Soft%20Talk');
    expect(url.searchParams.get('since')).toBe('1234');
    expect(url.searchParams.get('max')).toBe('50');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Accept: 'application/x-ndjson' });
    expect(games).toEqual([
      { id: 'a', lastMoveAt: 2000 },
      { id: 'b', lastMoveAt: 3000 },
    ]);
  });

  it('omits since when not given and handles an empty body', async () => {
    fetchMock.mockResolvedValueOnce(textResponse(200, '\n'));
    await expect(fetchLichessGames('u')).resolves.toEqual([]);
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.has('since')).toBe(false);
  });

  it('falls back to the proxy when the direct call is blocked', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(textResponse(200, JSON.stringify({ games: [{ id: 'p' }] })));

    await expect(fetchLichessGames('u', 5)).resolves.toEqual([{ id: 'p' }]);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/lichess/latest?username=u&since=5');
  });

  it('falls back to the proxy on a Cloudflare challenge', async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse(403, '<title>Just a moment...</title>'))
      .mockResolvedValueOnce(textResponse(200, JSON.stringify({ games: [] })));

    await expect(fetchLichessGames('u')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports both failures when direct and proxy fail', async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse(403, '<title>Just a moment...</title>'))
      .mockResolvedValueOnce(
        textResponse(502, JSON.stringify({ message: 'Failed to fetch data from Lichess' })),
      );

    await expect(fetchLichessGames('u')).rejects.toThrow(
      'Could not reach Lichess. Direct: status 403: Just a moment.... Proxy: status 502: Failed to fetch data from Lichess',
    );
  });

  it('does not fall back when the user does not exist', async () => {
    fetchMock.mockResolvedValueOnce(textResponse(404, ''));
    await expect(fetchLichessGames('ghost')).rejects.toBeInstanceOf(LichessUserNotFoundError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back on malformed direct data', async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse(200, 'not-json\n'))
      .mockResolvedValueOnce(textResponse(200, JSON.stringify({ games: [{ id: 'p' }] })));
    await expect(fetchLichessGames('u')).resolves.toEqual([{ id: 'p' }]);
  });
});
