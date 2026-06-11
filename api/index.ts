// Vercel serverless function entry point
// NOTE: This is a PROXY-ONLY serverless function for the Lichess API.
// All data storage happens client-side (IndexedDB), not on the backend.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchLichessGames, LichessProxyError } from './_lichess';

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
