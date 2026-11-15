import { LichessUnauthorizedError } from './lichess-puzzles';

/**
 * The user's Lichess puzzle history, used to skip puzzles they've already played
 * when fixed-level batches are fetched anonymously.
 *
 * Lichess streams /api/puzzle/activity at 20 entries per second (lila
 * PuzzleActivity: MaxPerSecond(20)) and allows one stream at a time, so a long
 * history takes minutes. It must never block starting practice: the history is
 * streamed in the background, cached on this device, and later visits only fetch
 * entries newer than the cache (plus resume an interrupted first download).
 */

const CACHE_KEY = 'lichess-played-puzzles';
/** Most recent puzzles to remember. 3000 entries is ~2.5 min to stream once. */
export const PLAYED_CAP = 3000;

export interface PlayedCache {
  username: string;
  ids: string[];
  /** Newest / oldest activity timestamps seen (ms), for resuming. */
  newest: number | null;
  oldest: number | null;
  /** True once the whole history (up to the cap) has been downloaded. */
  complete: boolean;
}

function emptyCache(username: string): PlayedCache {
  return { username, ids: [], newest: null, oldest: null, complete: false };
}

const finiteOrNull = (v: unknown) => (Number.isFinite(v) ? (v as number) : null);

/** Cached history for this user; anything malformed or for another user is ignored. */
export function loadPlayedCache(username: string): PlayedCache {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Partial<PlayedCache>;
    if (!raw || raw.username !== username || !Array.isArray(raw.ids)) return emptyCache(username);
    return {
      username,
      ids: raw.ids.filter((id): id is string => typeof id === 'string'),
      newest: finiteOrNull(raw.newest),
      oldest: finiteOrNull(raw.oldest),
      complete: raw.complete === true,
    };
  } catch {
    return emptyCache(username);
  }
}

function saveCache(cache: PlayedCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    // Only costs a slower history download next visit.
    console.warn('[Focus] Could not cache Lichess puzzle history', error);
  }
}

export function clearPlayedCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Read an ndjson response line by line as it arrives. */
async function streamNdjson(response: Response, onLines: (objects: unknown[]) => void) {
  const parseLines = (lines: string[]) => {
    const objects: unknown[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        objects.push(JSON.parse(line));
      } catch {
        // A torn line at the end of an aborted stream; skip it.
      }
    }
    if (objects.length > 0) onLines(objects);
  };

  if (!response.body) {
    parseLines((await response.text()).split('\n'));
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    parseLines(lines);
  }
  parseLines([buffer + decoder.decode()]);
}

interface SyncOptions {
  token: string;
  username: string;
  signal: AbortSignal;
  /** Called with each new chunk of played ids as they stream in. */
  onIds: (ids: string[]) => void;
  fetchImpl?: typeof fetch;
}

/**
 * Bring the cached history up to date: first anything played since the cache's
 * newest entry, then (if the first download never finished) older entries up to
 * PLAYED_CAP. Progress is saved as it streams, so an abort loses nothing.
 */
export async function syncPlayedPuzzles({
  token,
  username,
  signal,
  onIds,
  fetchImpl = fetch,
}: SyncOptions): Promise<PlayedCache> {
  const cache = loadPlayedCache(username);
  const known = new Set(cache.ids);
  if (known.size > 0) onIds([...cache.ids]);

  // Lichess streams newest first. Entries newer than the cache go in front of it
  // (in arrival order); a backfill of older entries goes after it.
  const stream = async (params: URLSearchParams, placement: 'newer' | 'older') => {
    let insertAt = 0;
    const response = await fetchImpl(`https://lichess.org/api/puzzle/activity?${params}`, {
      headers: { Accept: 'application/x-ndjson', Authorization: `Bearer ${token}` },
      signal,
    });
    if (response.status === 401) throw new LichessUnauthorizedError();
    if (!response.ok) {
      throw new Error(`Lichess puzzle history request failed (status ${response.status})`);
    }
    let received = 0;
    await streamNdjson(response, (entries) => {
      const fresh: string[] = [];
      for (const entry of entries) {
        const e = entry as { date?: unknown; puzzle?: { id?: unknown } };
        const id = e.puzzle?.id;
        if (typeof id !== 'string') continue;
        received++;
        const date = finiteOrNull(e.date);
        if (date !== null) {
          cache.newest = cache.newest === null ? date : Math.max(cache.newest, date);
          cache.oldest = cache.oldest === null ? date : Math.min(cache.oldest, date);
        }
        if (!known.has(id)) {
          known.add(id);
          fresh.push(id);
        }
      }
      if (fresh.length > 0) {
        if (placement === 'newer') {
          cache.ids.splice(insertAt, 0, ...fresh);
          insertAt += fresh.length;
        } else {
          cache.ids.push(...fresh);
        }
        // Keep the most recent entries.
        cache.ids = cache.ids.slice(0, PLAYED_CAP);
        onIds(fresh);
      }
      saveCache(cache);
    });
    return received;
  };

  // 1. Anything played since the last sync (usually a handful of entries).
  if (cache.newest !== null) {
    await stream(new URLSearchParams({ since: String(cache.newest + 1) }), 'newer');
  }

  // 2. First download, or resume one that was interrupted.
  if (!cache.complete) {
    const wanted = PLAYED_CAP - cache.ids.length;
    if (wanted > 0) {
      const params = new URLSearchParams({ max: String(wanted) });
      if (cache.oldest !== null) params.set('before', String(cache.oldest));
      const received = await stream(params, 'older');
      // Fewer than asked for means we reached the start of their history.
      cache.complete = received < wanted || cache.ids.length >= PLAYED_CAP;
    } else {
      cache.complete = true;
    }
    saveCache(cache);
  }
  return cache;
}
