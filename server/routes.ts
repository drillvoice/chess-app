import type { Express } from 'express';
import { createServer, type Server } from 'http';
import { storage } from './storage';
import {
  tacticsSessionSchema,
  gameSessionSchema,
  studySessionSchema,
  goalSessionSchema,
} from '@shared/schema';
import path from 'path';
import { asyncHandler } from './asyncHandler';

/**
 * Helper to register a static file route with predefined headers.
 */
function serveStaticFile(
  app: Express,
  urlPath: string,
  filename: string,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): void {
  app.get(urlPath, (_req, res) => {
    res.setHeader('Content-Type', contentType);
    for (const [key, value] of Object.entries(extraHeaders)) {
      res.setHeader(key, value);
    }
    res.sendFile(path.join(process.cwd(), 'public', filename));
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // PWA routes with proper headers
  serveStaticFile(app, '/manifest.json', 'manifest.json', 'application/manifest+json');
  serveStaticFile(app, '/sw.js', 'sw.js', 'application/javascript', {
    'Service-Worker-Allowed': '/',
    'Cache-Control': 'no-cache',
  });

  ['192', '512'].forEach((size) => {
    serveStaticFile(app, `/icon-${size}.svg`, `icon-${size}.svg`, 'image/svg+xml');
    serveStaticFile(app, `/icon-${size}.png`, `icon-${size}.png`, 'image/png');
  });

  serveStaticFile(app, '/screenshot-mobile.png', 'screenshot-mobile.png', 'image/png');

  // Get all training sessions
  app.get(
    '/api/training-sessions',
    asyncHandler(async (_req, res) => {
      const sessions = await storage.getAllTrainingSessions();
      res.json(sessions);
    }),
  );

  // Get today's training sessions
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

  // Get training sessions by type
  app.get(
    '/api/training-sessions/:type',
    asyncHandler(async (req, res) => {
      const { type } = req.params;
      const sessions = await storage.getTrainingSessionsByType(type);
      res.json(sessions);
    }),
  );

  // Create a tactics session
  app.post(
    '/api/training-sessions/tactics',
    asyncHandler(async (req, res) => {
      const validatedData = tacticsSessionSchema.parse(req.body);
      const session = await storage.createTrainingSession(validatedData);
      res.status(201).json(session);
    }),
  );

  // Create a game session
  app.post(
    '/api/training-sessions/game',
    asyncHandler(async (req, res) => {
      const validatedData = gameSessionSchema.parse(req.body);
      const session = await storage.createTrainingSession(validatedData);
      res.status(201).json(session);
    }),
  );

  // Create a study session
  app.post(
    '/api/training-sessions/study',
    asyncHandler(async (req, res) => {
      const validatedData = studySessionSchema.parse(req.body);
      const session = await storage.createTrainingSession({
        ...validatedData,
        studyTags: validatedData.studyTags ? JSON.stringify(validatedData.studyTags) : undefined,
      });
      res.status(201).json(session);
    }),
  );

  // Get current weekly goal
  app.get(
    '/api/weekly-goal',
    asyncHandler(async (_req, res) => {
      const goal = await storage.getCurrentWeeklyGoal();
      res.json(goal || null);
    }),
  );

  // Get statistics
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

  // Create a goal session
  app.post(
    '/api/training-sessions/goal',
    asyncHandler(async (req, res) => {
      const validatedData = goalSessionSchema.parse(req.body);
      const session = await storage.createTrainingSession(validatedData);
      res.status(201).json(session);
    }),
  );

  // Export data
  app.get(
    '/api/export',
    asyncHandler(async (_req, res) => {
      const data = await storage.exportData();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="chess-training-data.json"');
      res.send(data);
    }),
  );

  // Import data
  app.post(
    '/api/import',
    asyncHandler(async (req, res) => {
      const { data } = req.body;
      await storage.importData(data);
      res.json({ message: 'Data imported successfully' });
    }),
  );

  // Delete a training session
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

  const httpServer = createServer(app);
  return httpServer;
}
