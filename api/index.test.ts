// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from './index';
import fs from 'fs';
import path from 'path';
import type { Response } from 'express';

describe('Vercel API serverless function', () => {
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

  describe('GET /api/lichess/latest', () => {
    it('requires a username parameter', async () => {
      const res = await request(app).get('/api/lichess/latest');
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: expect.stringContaining('username') });
    });

    it('returns 400 for empty username', async () => {
      const res = await request(app).get('/api/lichess/latest').query({ username: '' });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: expect.stringContaining('username') });
    });

    it('validates the since parameter', async () => {
      const res = await request(app)
        .get('/api/lichess/latest')
        .query({ username: 'testuser', since: 'invalid' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('since');
    });

    it('rejects negative since parameter', async () => {
      const res = await request(app)
        .get('/api/lichess/latest')
        .query({ username: 'testuser', since: '-100' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('since');
    });

    it('proxies requests to Lichess API with correct headers', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'game1', lastMoveAt: 1000 }) + '\n',
      });

      const res = await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('lichess.org/api/games/user/softtalk'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/x-ndjson',
            'User-Agent': expect.stringContaining('Chess Logger'),
          }),
        }),
      );
    });

    it('returns games sorted by timestamp (oldest first)', async () => {
      const latestGame = { id: 'game2', lastMoveAt: 3000, createdAt: 2500 };
      const olderGame = { id: 'game1', lastMoveAt: 2000, createdAt: 1000 };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => `${JSON.stringify(latestGame)}\n${JSON.stringify(olderGame)}\n`,
      });

      const res = await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });

      expect(res.status).toBe(200);
      expect(res.body.games).toHaveLength(2);
      expect(res.body.games[0].id).toBe('game1'); // older game first
      expect(res.body.games[1].id).toBe('game2'); // newer game second
    });

    it('returns empty games array when no games available', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '\n\n',
      });

      const res = await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ games: [] });
    });

    it('handles 404 when user not found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'User not found',
      });

      const res = await request(app).get('/api/lichess/latest').query({ username: 'NonExistent' });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('returns 502 for upstream errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const res = await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });

      expect(res.status).toBe(502);
      expect(res.body.message).toContain('Failed to fetch');
    });

    it('handles malformed JSON response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'invalid-json\n',
      });

      const res = await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });

      expect(res.status).toBe(502);
      expect(res.body.message).toContain('malformed');
    });

    it('handles fetch errors', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const res = await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Failed to connect');
    });

    it('includes since parameter when provided', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
      });

      await request(app).get('/api/lichess/latest').query({ username: 'softtalk', since: '12345' });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('since=12345'),
        expect.anything(),
      );
    });

    it('filters out games without valid timestamps', async () => {
      const validGame = { id: 'game1', lastMoveAt: 1000, createdAt: 500 };
      const invalidGame = { id: 'game2' }; // no timestamps

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => `${JSON.stringify(validGame)}\n${JSON.stringify(invalidGame)}\n`,
      });

      const res = await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });

      expect(res.status).toBe(200);
      expect(res.body.games).toHaveLength(1);
      expect(res.body.games[0].id).toBe('game1');
    });

    it('uses createdAt when lastMoveAt is not available', async () => {
      const gameWithoutLastMove = { id: 'game1', createdAt: 1000 };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(gameWithoutLastMove) + '\n',
      });

      const res = await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });

      expect(res.status).toBe(200);
      expect(res.body.games).toHaveLength(1);
      expect(res.body.games[0].id).toBe('game1');
    });

    it('sets no-cache header on responses', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
      });

      const res = await request(app).get('/api/lichess/latest').query({ username: 'softtalk' });

      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('SPA fallback', () => {
    it('serves the built index.html when available', async () => {
      const distIndexPath = path.join(process.cwd(), 'dist', 'public', 'index.html');
      const sendFileSpy = vi
        .spyOn(app.response, 'sendFile')
        .mockImplementation(function mockSendFile(this: Response, filePath: string) {
          this.status(200).send(`sent ${filePath}`);
          return this;
        });
      const existsSpy = vi
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: fs.PathLike) => filePath === distIndexPath);

      const res = await request(app).get('/non-existent-route');

      expect(res.status).toBe(200);
      expect(res.text).toContain(distIndexPath);

      sendFileSpy.mockRestore();
      existsSpy.mockRestore();
    });

    it('returns 500 when no index file is present', async () => {
      const sendFileSpy = vi.spyOn(app.response, 'sendFile');
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const res = await request(app).get('/another-route');

      expect(res.status).toBe(500);
      expect(res.text).toContain('SPA index file not found');
      expect(sendFileSpy).not.toHaveBeenCalled();

      sendFileSpy.mockRestore();
      existsSpy.mockRestore();
    });
  });
});
