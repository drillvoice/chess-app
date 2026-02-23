// @vitest-environment node
import express, { json } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  it('preserves provided session dates', async () => {
    const sessionDate = '2024-03-14T12:34:56.000Z';
    const res = await request(app)
      .post('/api/training-sessions/tactics')
      .send({ type: 'tactics', duration: 20, date: sessionDate })
      .expect(201);

    expect(new Date(res.body.date).toISOString()).toBe(sessionDate);
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

  it('handles storage errors with 500 responses', async () => {
    const spy = vi.spyOn(storage, 'createTrainingSession').mockRejectedValue(new Error('db error'));
    const res = await request(app)
      .post('/api/training-sessions/tactics')
      .send({ type: 'tactics', duration: 15 });
    expect(res.status).toBe(500);
    spy.mockRestore();
  });

  it('returns 404 when deleting a missing session', async () => {
    const res = await request(app).delete('/api/training-sessions/999');
    expect(res.status).toBe(404);
  });

  it('returns 500 for invalid import data', async () => {
    const res = await request(app).post('/api/import').send({ data: 'not json' });
    expect(res.status).toBe(500);
  });

  describe('GET /api/lichess/latest', () => {
    const originalFetch = globalThis.fetch;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      (globalThis as any).fetch = fetchMock;
    });

    afterEach(() => {
      if (originalFetch) {
        (globalThis as any).fetch = originalFetch;
      } else {
        delete (globalThis as any).fetch;
      }
    });

    it('requires a username', async () => {
      const res = await request(app).get('/api/lichess/latest');
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: expect.stringContaining('username') });
    });

    it('returns games ordered from oldest to newest', async () => {
      const latestPayload = { lastMoveAt: 3000, createdAt: 1500, id: 'game2' };
      const earlierPayload = { lastMoveAt: 2000, createdAt: 1000, id: 'game1' };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => `${JSON.stringify(latestPayload)}\n${JSON.stringify(earlierPayload)}\n`,
      });

      const res = await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('softtalk'),
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'application/x-ndjson' }),
        }),
      );
      expect(res.body).toEqual({ games: [earlierPayload, latestPayload] });
    });

    it('returns null when Lichess has no games', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '\n',
      });

      const res = await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ games: [] });
    });

    it('bubbles up upstream errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'error',
      });

      const res = await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });
      expect(res.status).toBe(502);
      expect(res.body.message).toContain('Failed to fetch');
    });

    it('validates the since parameter', async () => {
      const res = await request(app)
        .get('/api/lichess/latest')
        .query({ username: 'softtalk', since: 'not-a-number' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('since');
    });
  });
});
