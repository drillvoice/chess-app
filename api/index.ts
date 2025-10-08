// Vercel serverless function entry point
// NOTE: This is a PROXY-ONLY serverless function for the Lichess API.
// All data storage happens client-side (IndexedDB), not on the backend.
import express, { type Request, Response, NextFunction } from 'express';
import path from 'path';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Lichess API proxy endpoint - CORS-friendly proxy for Lichess API
app.get('/api/lichess/latest', async (req, res) => {
  try {
    console.log('[Lichess Endpoint] Called with query:', req.query);
    const { username, since } = req.query;

    if (typeof username !== 'string' || username.trim() === '') {
      console.log('[Lichess Endpoint] Missing username');
      res.status(400).json({ message: 'Lichess username is required' });
      return;
    }

    console.log('[Lichess Endpoint] Processing request for username:', username, 'since:', since);

    let sinceTimestamp: number | undefined;
    if (typeof since === 'string' && since.length > 0) {
      const parsed = Number.parseInt(since, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        res.status(400).json({ message: 'Invalid since parameter' });
        return;
      }
      sinceTimestamp = parsed;
    }

    const params = new URLSearchParams({
      max: '50',
      clocks: 'false',
      moves: 'false',
      opening: 'false',
      format: 'json',
    });

    if (sinceTimestamp !== undefined) {
      params.set('since', sinceTimestamp.toString());
    }

    const lichessUrl = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`;

    console.log('[Lichess API] Fetching:', lichessUrl);

    let lichessResponse;
    try {
      lichessResponse = await fetch(lichessUrl, {
        headers: {
          Accept: 'application/x-ndjson',
          'User-Agent': 'Chess Logger Sync (+https://github.com/chess-log/chess-app)',
        },
      });
      console.log('[Lichess API] Response status:', lichessResponse.status);
    } catch (fetchError) {
      console.error('[Lichess API] Fetch failed:', fetchError);
      res.status(500).json({
        message: `Failed to connect to Lichess API: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
      });
      return;
    }

    if (lichessResponse.status === 404) {
      res.status(404).json({ message: 'Lichess user not found' });
      return;
    }

    if (!lichessResponse.ok) {
      const errorBody = await lichessResponse.text().catch(() => 'Unable to read error body');
      console.error('[Lichess API] Non-OK response:', lichessResponse.status, errorBody);
      res.status(502).json({
        message: `Failed to fetch data from Lichess (status ${lichessResponse.status})`,
      });
      return;
    }

    const rawText = await lichessResponse.text();
    const lines = rawText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    res.setHeader('Cache-Control', 'no-store');

    if (lines.length === 0) {
      res.json({ games: [] });
      return;
    }

    const parsedGames: unknown[] = [];
    for (const line of lines) {
      try {
        parsedGames.push(JSON.parse(line));
      } catch (_error) {
        res.status(502).json({ message: 'Received malformed data from Lichess' });
        return;
      }
    }

    const gamesWithTimestamps = parsedGames
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

    res.json({ games: gamesWithTimestamps });
  } catch (error) {
    console.error('[Lichess Endpoint] Unexpected error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// For non-API routes, let Vercel handle static files
// The vercel.json rewrites configuration sends all requests here,
// but Vercel's static file serving happens before the serverless function,
// so this handler only receives requests that don't match static files.

// SPA fallback - for any non-API, non-static route, serve index.html
// This is needed for client-side routing (e.g., /account, /activity)
app.get('*', (_req, res) => {
  // In Vercel, static files are served from the outputDirectory (dist/public)
  // This fallback handles SPA routes that don't match files
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

export default app;
