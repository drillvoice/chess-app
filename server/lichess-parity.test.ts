// @vitest-environment node
/**
 * Drift guard for the deliberately duplicated Lichess proxy.
 *
 * The implementation exists twice — server/lichess.ts (dev/Express) and
 * api/index.ts (Vercel serverless) — because importing shared code into the
 * serverless function has repeatedly broken the production deploy
 * (FUNCTION_INVOCATION_FAILED). This suite drives BOTH deployment targets
 * through their public HTTP surfaces with identical mocked upstream responses
 * and asserts they make the same upstream request and return the same
 * (status, body). If you change one implementation, this fails until you
 * make the matching change in the other.
 */
import express, { json } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerRoutes } from './routes';
import vercelHandler from '../api/index';

type MockUpstream =
  | { kind: 'response'; ok: boolean; status: number; body: string }
  | { kind: 'network-error' };

interface Scenario {
  name: string;
  query: Record<string, string>;
  upstream?: MockUpstream;
}

const game = (id: string, lastMoveAt?: number, createdAt?: number) =>
  JSON.stringify({ id, lastMoveAt, createdAt });

const scenarios: Scenario[] = [
  { name: 'missing username', query: {} },
  { name: 'empty username', query: { username: '   ' } },
  { name: 'invalid since', query: { username: 'softtalk', since: 'nope' } },
  { name: 'negative since', query: { username: 'softtalk', since: '-5' } },
  {
    name: 'success with sorting and since',
    query: { username: 'softtalk', since: '12345' },
    upstream: {
      kind: 'response',
      ok: true,
      status: 200,
      body: `${game('newer', 3000)}\n${game('older', 2000)}\n${game('no-timestamps')}\n`,
    },
  },
  {
    name: 'empty upstream body',
    query: { username: 'softtalk' },
    upstream: { kind: 'response', ok: true, status: 200, body: '\n\n' },
  },
  {
    name: 'user not found',
    query: { username: 'ghost' },
    upstream: { kind: 'response', ok: false, status: 404, body: '' },
  },
  {
    name: 'upstream 500',
    query: { username: 'softtalk' },
    upstream: { kind: 'response', ok: false, status: 500, body: '' },
  },
  {
    name: 'malformed ndjson',
    query: { username: 'softtalk' },
    upstream: { kind: 'response', ok: true, status: 200, body: 'not-json\n' },
  },
  {
    name: 'network error',
    query: { username: 'softtalk' },
    upstream: { kind: 'network-error' },
  },
];

describe('Lichess proxy parity (server/lichess.ts vs api/index.ts)', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  let expressApp: express.Express;

  beforeEach(async () => {
    fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;
    expressApp = express();
    expressApp.use(json());
    await registerRoutes(expressApp);
  });

  afterEach(() => {
    if (originalFetch) {
      (globalThis as any).fetch = originalFetch;
    } else {
      delete (globalThis as any).fetch;
    }
  });

  const mockUpstream = (upstream?: MockUpstream) => {
    if (!upstream) return;
    if (upstream.kind === 'network-error') {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
    } else {
      fetchMock.mockResolvedValueOnce({
        ok: upstream.ok,
        status: upstream.status,
        text: async () => upstream.body,
      });
    }
  };

  it.each(scenarios)('responds identically: $name', async ({ query, upstream }) => {
    mockUpstream(upstream);
    const expressRes = await request(expressApp).get('/api/lichess/latest').query(query);
    const expressFetchCalls = fetchMock.mock.calls.splice(0);

    mockUpstream(upstream);
    const vercelRes = await request(vercelHandler).get('/api/lichess/latest').query(query);
    const vercelFetchCalls = fetchMock.mock.calls.splice(0);

    // Same response to the client...
    expect(vercelRes.status).toBe(expressRes.status);
    expect(vercelRes.body).toEqual(expressRes.body);

    // ...and the same upstream request (URL incl. query params, and headers).
    // The AbortSignal instances necessarily differ, so compare url + headers.
    const comparable = (calls: unknown[][]) =>
      calls.map(([url, init]) => [url, (init as RequestInit | undefined)?.headers]);
    expect(comparable(vercelFetchCalls)).toEqual(comparable(expressFetchCalls));
  });
});
