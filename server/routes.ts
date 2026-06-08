import type { Express } from 'express';
import { createServer, type Server } from 'http';
import { asyncHandler } from './asyncHandler';
import { fetchLichessGames, LichessProxyError } from './lichess';

export async function registerRoutes(app: Express): Promise<Server> {
  app.get(
    '/api/lichess/latest',
    asyncHandler(async (req, res) => {
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

      try {
        const result = await fetchLichessGames(username, sinceTimestamp);
        res.setHeader('Cache-Control', 'no-store');
        res.json(result);
      } catch (err) {
        if (err instanceof LichessProxyError) {
          res.status(err.statusCode).json({ message: err.message });
          return;
        }
        throw err; // unexpected — let asyncHandler pass to Express error handler
      }
    }),
  );

  const httpServer = createServer(app);
  return httpServer;
}
