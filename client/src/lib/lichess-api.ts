/**
 * Fetch a user's recent Lichess games.
 *
 * Primary path: call the Lichess API directly from the browser (it allows CORS).
 * Since late Oct 2026 Cloudflare in front of lichess.org answers requests from
 * Vercel's datacenter IPs with a "Just a moment..." JS challenge (403), even
 * with an API token, so our serverless proxy can't reach it. The user's own
 * device on a residential/mobile connection normally isn't challenged.
 *
 * Fallback: the `/api/lichess/latest` proxy, in case the direct call fails
 * (e.g. CORS/network block or a challenge on the user's network). If both
 * fail, the thrown error carries both reasons so the toast is diagnosable.
 *
 * Note: anonymous requests only get games < 10 days old (or 2200+ average),
 * which is fine for incremental sync via `since`.
 */

const LICHESS_PARAMS = {
  max: '50',
  clocks: 'false',
  moves: 'false',
  opening: 'true',
} as const;

export class LichessUserNotFoundError extends Error {
  constructor(username: string) {
    super(`Lichess user "${username}" not found`);
    this.name = 'LichessUserNotFoundError';
  }
}

function sortByTimestamp(games: unknown[]): unknown[] {
  return games
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
}

function summariseBody(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

async function fetchDirect(username: string, since?: number): Promise<unknown[]> {
  const params = new URLSearchParams(LICHESS_PARAMS);
  if (since !== undefined) params.set('since', String(since));
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`;

  // Accept is a CORS-safelisted header, so this is a simple request (no preflight).
  const res = await fetch(url, {
    headers: { Accept: 'application/x-ndjson' },
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 404) throw new LichessUserNotFoundError(username);
  if (!res.ok) {
    const detail = summariseBody(await res.text().catch(() => ''));
    throw new Error(`status ${res.status}${detail ? `: ${detail}` : ''}`);
  }

  const lines = (await res.text())
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const games: unknown[] = [];
  for (const line of lines) {
    try {
      games.push(JSON.parse(line));
    } catch {
      throw new Error('received malformed data');
    }
  }
  return sortByTimestamp(games);
}

async function fetchViaProxy(username: string, since?: number): Promise<unknown[]> {
  const params = new URLSearchParams({ username });
  if (since !== undefined) params.set('since', String(since));
  const res = await fetch(`/api/lichess/latest?${params}`);
  if (res.status === 404) throw new LichessUserNotFoundError(username);
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    let message = errorText;
    try {
      message = (JSON.parse(errorText) as { message?: string }).message ?? errorText;
    } catch {
      // not JSON; use raw text
    }
    throw new Error(`status ${res.status}${message ? `: ${message}` : ''}`);
  }
  const payload = (await res.json()) as { games?: unknown };
  return Array.isArray(payload.games) ? payload.games : [];
}

/**
 * @param since  Unix-ms lower bound (inclusive, as Lichess treats it).
 * @returns games sorted oldest → newest.
 */
export async function fetchLichessGames(username: string, since?: number): Promise<unknown[]> {
  let directError: unknown;
  try {
    return await fetchDirect(username, since);
  } catch (err) {
    if (err instanceof LichessUserNotFoundError) throw err;
    directError = err;
    console.warn('[Lichess] Direct fetch failed, falling back to proxy:', err);
  }

  try {
    return await fetchViaProxy(username, since);
  } catch (proxyError) {
    if (proxyError instanceof LichessUserNotFoundError) throw proxyError;
    const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
    throw new Error(
      `Could not reach Lichess. Direct: ${msg(directError)}. Proxy: ${msg(proxyError)}`,
    );
  }
}
