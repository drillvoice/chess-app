// Vercel serverless function entry point
// NOTE: This is a PROXY-ONLY serverless function for the Lichess API.
// All data storage happens client-side (IndexedDB), not on the backend.
import type { IncomingMessage, ServerResponse } from 'node:http';

class LichessProxyError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'LichessProxyError';
  }
}

async function fetchLichessGames(
  username: string,
  sinceTimestamp?: number,
): Promise<{ games: unknown[] }> {
  const params = new URLSearchParams({
    max: '50',
    clocks: 'false',
    moves: 'false',
    opening: 'true',
  });
  if (sinceTimestamp !== undefined) {
    params.set('since', sinceTimestamp.toString());
  }

  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`;

  let lichessResponse: Response;
  try {
    lichessResponse = await fetch(url, {
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
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { games: [] };

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

  return { games };
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { message: 'Method not allowed' });
    return;
  }

  const { searchParams } = new URL(req.url ?? '/', 'http://localhost');
  const username = searchParams.get('username') ?? '';
  const sinceRaw = searchParams.get('since') ?? '';

  if (username.trim() === '') {
    sendJson(res, 400, { message: 'Lichess username is required' });
    return;
  }

  let sinceTimestamp: number | undefined;
  if (sinceRaw.length > 0) {
    const parsed = Number.parseInt(sinceRaw, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      sendJson(res, 400, { message: 'Invalid since parameter' });
      return;
    }
    sinceTimestamp = parsed;
  }

  try {
    const result = await fetchLichessGames(username, sinceTimestamp);
    sendJson(res, 200, result, { 'Cache-Control': 'no-store' });
  } catch (err) {
    if (err instanceof LichessProxyError) {
      sendJson(res, err.statusCode, { message: err.message });
      return;
    }
    console.error('[Lichess] Unexpected error:', err);
    sendJson(res, 500, {
      message: 'Internal server error',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
