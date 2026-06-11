/**
 * Shared Lichess API proxy logic used by both the dev/production Express server
 * (server/routes.ts) and the Vercel serverless entry (api/index.ts).
 *
 * Keeping the implementation here means the two deployment targets can never
 * silently diverge in their fetch behaviour, error handling, or response shape.
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
    format: 'json',
  });

  if (sinceTimestamp !== undefined) {
    params.set('since', sinceTimestamp.toString());
  }

  const lichessUrl = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`;

  let lichessResponse: Response;
  try {
    lichessResponse = await fetch(lichessUrl, {
      headers: {
        Accept: 'application/x-ndjson',
        'User-Agent': 'Chess Logger Sync (+https://github.com/chess-log/chess-app)',
      },
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
    throw new LichessProxyError(
      502,
      `Failed to fetch data from Lichess (status ${lichessResponse.status})`,
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
