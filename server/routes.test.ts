// @vitest-environment node
import express, { json } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { registerRoutes } from './routes';
import { storage } from './storage';

describe('API routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = express();
    app.use(json());
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

  it('validates tactics sessions', async () => {
    const res = await request(app)
      .post('/api/training-sessions/tactics')
      .send({ type: 'tactics', duration: 15 });
    expect(res.status).toBe(201);

    const badRes = await request(app)
      .post('/api/training-sessions/tactics')
      .send({ type: 'tactics' });
    expect(badRes.status).toBe(400);
  });

  it('validates game sessions', async () => {
    const res = await request(app)
      .post('/api/training-sessions/game')
      .send({ type: 'game', gameResult: 'win', playerColor: 'black' });
    expect(res.status).toBe(201);

    const badRes = await request(app)
      .post('/api/training-sessions/game')
      .send({ type: 'game', playerColor: 'black' });
    expect(badRes.status).toBe(400);
  });

  it('validates study sessions', async () => {
    const res = await request(app)
      .post('/api/training-sessions/study')
      .send({ type: 'study', duration: 20, studyTags: ['book'] });
    expect(res.status).toBe(201);

    const badRes = await request(app)
      .post('/api/training-sessions/study')
      .send({ type: 'study', duration: 0 });
    expect(badRes.status).toBe(400);
  });

  it('validates goal sessions', async () => {
    const res = await request(app)
      .post('/api/training-sessions/goal')
      .send({ type: 'goal', goalTitle: 'Win tournament' });
    expect(res.status).toBe(201);

    const badRes = await request(app).post('/api/training-sessions/goal').send({ type: 'goal' });
    expect(badRes.status).toBe(400);
  });
});
