import type { Express } from 'express';
import { createServer, type Server } from 'http';
import { asyncHandler } from './asyncHandler';

interface LichessLatestResponse {
  games: unknown[];
}

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

      const lichessResponse = await fetch(lichessUrl, {
        headers: {
          Accept: 'application/x-ndjson',
          'User-Agent': 'Chess Logger Sync (+https://github.com/chess-log/chess-app)',
        },
      });

      if (lichessResponse.status === 404) {
        res.status(404).json({ message: 'Lichess user not found' });
        return;
      }

      if (!lichessResponse.ok) {
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
        res.json({ games: [] } satisfies LichessLatestResponse);
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

      res.json({ games: gamesWithTimestamps } satisfies LichessLatestResponse);
    }),
  );

  const httpServer = createServer(app);
  return httpServer;
}
