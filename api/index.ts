// Vercel serverless function entry point
import express, { type Request, Response, NextFunction } from 'express';
import path from 'path';
import { storage } from '../server/storage';
import {
  tacticsSessionSchema,
  gameSessionSchema,
  studySessionSchema,
  goalSessionSchema,
  type InsertTrainingSession,
} from '../shared/schema';
import { asyncHandler } from '../server/asyncHandler';
import { fromZodError } from 'zod-validation-error';
import { z, ZodError, type ZodTypeAny } from 'zod';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Create session route factory
function createSessionRoute<T extends ZodTypeAny>(
  schema: T,
  transform?: (data: z.infer<T>) => InsertTrainingSession,
) {
  return asyncHandler(async (req, res) => {
    try {
      const validated = schema.parse(req.body);
      const toStore = transform ? transform(validated) : (validated as InsertTrainingSession);
      const session = await storage.createTrainingSession(toStore);
      res.status(201).json(session);
    } catch (err) {
      if (err instanceof ZodError) {
        const validationError = fromZodError(err);
        res.status(400).json({ message: validationError.message });
      } else {
        throw err;
      }
    }
  });
}

// Lichess API endpoint
app.get(
  '/api/lichess/latest',
  asyncHandler(async (req, res) => {
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
  }),
);

// Other API routes
app.get(
  '/api/training-sessions',
  asyncHandler(async (_req, res) => {
    const sessions = await storage.getAllTrainingSessions();
    res.json(sessions);
  }),
);

app.get(
  '/api/training-sessions/today',
  asyncHandler(async (_req, res) => {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const sessions = await storage.getTrainingSessionsByDateRange(startOfDay, endOfDay);
    res.json(sessions);
  }),
);

app.get(
  '/api/training-sessions/:type',
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    const sessions = await storage.getTrainingSessionsByType(type);
    res.json(sessions);
  }),
);

app.post('/api/training-sessions/tactics', createSessionRoute(tacticsSessionSchema));
app.post('/api/training-sessions/game', createSessionRoute(gameSessionSchema));
app.post(
  '/api/training-sessions/study',
  createSessionRoute(studySessionSchema, (data) => ({
    ...data,
    studyTags: data.studyTags ? JSON.stringify(data.studyTags) : undefined,
  })),
);

app.get(
  '/api/weekly-goal',
  asyncHandler(async (_req, res) => {
    const goal = await storage.getCurrentWeeklyGoal();
    res.json(goal || null);
  }),
);

app.get(
  '/api/statistics',
  asyncHandler(async (_req, res) => {
    const sessions = await storage.getAllTrainingSessions();

    const totalSessions = sessions.length;
    const totalHours =
      sessions.reduce((sum, session) => {
        return sum + (session.duration || 0);
      }, 0) / 60;

    const tacticsSession = sessions.filter((s) => s.type === 'tactics');
    const currentTacticsRating = tacticsSession.length > 0 ? tacticsSession[0].finalScore : 0;

    const gameSessions = sessions.filter((s) => s.type === 'game');
    const wins = gameSessions.filter((s) => s.gameResult === 'win').length;
    const winRate = gameSessions.length > 0 ? Math.round((wins / gameSessions.length) * 100) : 0;

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todaySessions = sessions.filter((s) => new Date(s.date) >= startOfDay);
    const todayTotalTime = todaySessions.reduce((sum, session) => {
      return sum + (session.duration || 0);
    }, 0);

    res.json({
      totalHours: Math.round(totalHours * 10) / 10,
      totalSessions,
      tacticsRating: currentTacticsRating || 0,
      winRate,
      todayTotalTime,
      todaySessions: todaySessions.length,
    });
  }),
);

app.post('/api/training-sessions/goal', createSessionRoute(goalSessionSchema));

app.get(
  '/api/export',
  asyncHandler(async (_req, res) => {
    const data = await storage.exportData();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="chess-training-data.json"');
    res.send(data);
  }),
);

app.post(
  '/api/import',
  asyncHandler(async (req, res) => {
    const { data } = req.body;
    await storage.importData(data);
    res.json({ message: 'Data imported successfully' });
  }),
);

app.delete(
  '/api/training-sessions/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    const success = await storage.deleteTrainingSession(id);

    if (success) {
      res.json({ message: 'Training session deleted successfully' });
    } else {
      res.status(404).json({ message: 'Training session not found' });
    }
  }),
);

// Serve static files for non-API routes
app.use(express.static('public'));

// SPA fallback - serve index.html for all other routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Serverless function error:', err);
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  if (err.name === 'ZodError') {
    const validationError = fromZodError(err);
    status = 400;
    message = validationError.message;
  }

  res.status(status).json({ message });
});

export default app;
