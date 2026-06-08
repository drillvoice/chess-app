// Vercel serverless function entry point
// NOTE: This is a PROXY-ONLY serverless function for the Lichess API.
// All data storage happens client-side (IndexedDB), not on the backend.
import express from 'express';
import path from 'path';
import { fetchLichessGames, LichessProxyError } from '../server/lichess';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Lichess API proxy — delegates to the shared fetchLichessGames handler so
// dev-server and Vercel behaviour cannot silently diverge.
app.get('/api/lichess/latest', async (req, res) => {
  try {
    const { username, since } = req.query;

    if (typeof username !== 'string' || username.trim() === '') {
      res.status(400).json({ message: 'Lichess username is required' });
      return;
    }

    let sinceTimestamp: number | undefined;
    if (typeof since === 'string' && since.length > 0) {
      const parsed = Number.parseInt(since, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        res.status(400).json({ message: 'Invalid since parameter' });
        return;
      }
      sinceTimestamp = parsed;
    }

    const result = await fetchLichessGames(username, sinceTimestamp);
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (err) {
    if (err instanceof LichessProxyError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    console.error('[Lichess] Unexpected error:', err);
    res.status(500).json({
      message: 'Internal server error',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// SPA fallback — for any non-API, non-static route, serve index.html.
// Vercel's static file serving happens before the serverless function, so
// this handler only receives requests that don't match a static file.
app.get('*', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

export default app;
