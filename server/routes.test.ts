// @vitest-environment node
import express, { json } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerRoutes } from './routes';

describe('API routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = express();
    app.use(json());
    await registerRoutes(app);
  });

  describe('GET /api/lichess/latest', () => {
    const originalFetch = globalThis.fetch;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      (globalThis as any).fetch = fetchMock;
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
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

    it('sends the Lichess API token as a bearer header when configured', async () => {
      vi.stubEnv('LICHESS_API_TOKEN', '  lip_secret  ');
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '\n' });

      await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });

      expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
        Authorization: 'Bearer lip_secret',
      });
    });

    it('sends no Authorization header without a token', async () => {
      vi.stubEnv('LICHESS_API_TOKEN', '');
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '\n' });

      await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });

      expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    });

    it('includes the upstream error body (HTML stripped) in the error message', async () => {
      vi.stubEnv('LICHESS_API_TOKEN', '');
      vi.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () =>
          '<html><head><title>Just a moment...</title><script>x()</script></head></html>',
      });

      const res = await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });

      expect(res.status).toBe(502);
      expect(res.body.message).toBe(
        'Failed to fetch data from Lichess (status 403, anonymous): Just a moment...',
      );
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
