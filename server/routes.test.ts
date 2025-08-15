// @vitest-environment node
import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { registerRoutes } from './routes';
import { storage } from './storage';

describe('API routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);
    await storage.importData('[]');
  });

  it('creates sessions and returns statistics', async () => {
    await request(app)
      .post('/api/training-sessions/tactics')
      .send({ type: 'tactics', duration: 30 })
      .expect(201);

    await request(app)
      .post('/api/training-sessions/game')
      .send({ type: 'game', gameResult: 'win', playerColor: 'white' })
      .expect(201);

    const res = await request(app).get('/api/statistics').expect(200);
    expect(res.body.totalSessions).toBe(2);
    expect(res.body.winRate).toBe(100);
  });
});
