/**
 * Lichess API proxy logic for the dev/production Express server
 * (server/routes.ts). The Vercel serverless entry (api/index.ts) carries a
 * deliberately duplicated copy: importing shared code into the serverless
 * function has repeatedly broken the production deploy (FUNCTION_INVOCATION_FAILED;
 * see commits 2c7c5f2 / 00d4b23 / 3b2a3b1+revert), so the two are kept inline
 * and lichess-parity.test.ts asserts they behave identically. If you change
 * this function, make the same change in api/index.ts — the parity test will
 * fail until you do.
 */

export interface LichessLatestResponse {
  games: unknown[];
}

/**
 * Thrown by fetchLichessGames for all known failure modes.
 * Callers map this to an HTTP error response; unexpected errors propagate.
 */
export class LichessProxyError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'LichessProxyError';
  }
}

/**
 * Fetch and parse the latest games for a Lichess user.
 *
 * @param username  Validated, non-empty Lichess username.
 * @param sinceTimestamp  Optional Unix-ms lower bound passed to the Lichess API.
 * @throws LichessProxyError for known failure modes (404, bad gateway, malformed data,
 *   or network-level fetch failure). Unexpected errors propagate as-is.
 */
export async function fetchLichessGames(
  username: string,
  sinceTimestamp?: number,
): Promise<LichessLatestResponse> {
  const params = new URLSearchParams({
    max: '50',
    clocks: 'false',
    moves: 'false',
    opening: 'true',
  });

  if (sinceTimestamp !== undefined) {
    params.set('since', sinceTimestamp.toString());
  }

  const lichessUrl = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`;

  // Since Oct 2026 Lichess restricts anonymous game exports (and its Cloudflare
  // bot filter is stricter on unauthenticated datacenter traffic), so send a
  // personal API token when one is configured. The token needs no scopes.
  const token = process.env.LICHESS_API_TOKEN?.trim();
  const headers: Record<string, string> = {
    Accept: 'application/x-ndjson',
    'User-Agent': 'Chess Logger Sync (+https://github.com/chess-log/chess-app)',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let lichessResponse: Response;
  try {
    lichessResponse = await fetch(lichessUrl, {
      headers,
      // Bound the request so a hung Lichess connection can't block indefinitely.
      signal: AbortSignal.timeout(15000),
    });
  } catch (fetchError) {
    throw new LichessProxyError(
      500,
      `Failed to connect to Lichess API: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
    );
  }

  if (lichessResponse.status === 404) {
    throw new LichessProxyError(404, 'Lichess user not found');
  }

  if (!lichessResponse.ok) {
    // Surface what Lichess actually said: a Cloudflare challenge page and a
    // Lichess API refusal both arrive as 403 but need different fixes.
    let detail = '';
    try {
      detail = (await lichessResponse.text())
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
    } catch {
      detail = '(could not read response body)';
    }
    const auth = token ? 'authenticated' : 'anonymous';
    console.error(
      `[Lichess] Upstream ${lichessResponse.status} (${auth}) for user "${username}": ${detail}`,
    );
    throw new LichessProxyError(
      502,
      `Failed to fetch data from Lichess (status ${lichessResponse.status}, ${auth})` +
        (detail ? `: ${detail}` : ''),
    );
  }

  const rawText = await lichessResponse.text();
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { games: [] };
  }

  const parsedGames: unknown[] = [];
  for (const line of lines) {
    try {
      parsedGames.push(JSON.parse(line));
    } catch {
      throw new LichessProxyError(502, 'Received malformed data from Lichess');
    }
  }

  const games = parsedGames
    .map((game) => {
      const record = game as Record<string, unknown> | undefined;
      const lastMove = Number(record?.lastMoveAt);
      const created = Number(record?.createdAt);
      const timestamp = Number.isFinite(lastMove)
        ? lastMove
        : Number.isFinite(created)
          ? created
          : null;
      return { game, timestamp };
    })
    .filter((entry): entry is { game: unknown; timestamp: number } => entry.timestamp !== null)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((entry) => entry.game);

  return { games } satisfies LichessLatestResponse;
}
