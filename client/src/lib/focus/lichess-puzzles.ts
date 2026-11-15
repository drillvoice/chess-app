import { Chess } from 'chess.js';
import type { FocusDifficulty } from './themes';

export interface FocusPuzzle {
  id: string;
  rating: number | null;
  themes: string[];
  /** Position the player has to solve (opponent's last move already played). */
  fen: string;
  /** UCI move that led to `fen`, for highlighting. */
  lastMove: string | null;
  /** Full solution in UCI: player move, opponent reply, player move, ... */
  solution: string[];
  gameId: string | null;
}

const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** Play a UCI move on a chess.js board, returning the SAN or null if illegal. */
export function playUci(chess: Chess, uci: string): string | null {
  if (!UCI_PATTERN.test(uci)) return null;
  try {
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4] : undefined,
    });
    return move ? move.san : null;
  } catch {
    return null;
  }
}

/**
 * Turn one entry of the Lichess puzzle API response into a FocusPuzzle.
 * The batch endpoint gives the game PGN (ending with the opponent's move that
 * sets up the puzzle) rather than a FEN, so the position is rebuilt by replaying
 * it. Throws with context if the payload is malformed or the solution is illegal.
 */
export function parseLichessPuzzle(raw: unknown): FocusPuzzle {
  const record = raw as {
    game?: { id?: unknown; pgn?: unknown };
    puzzle?: {
      id?: unknown;
      rating?: unknown;
      themes?: unknown;
      solution?: unknown;
      fen?: unknown;
      lastMove?: unknown;
    };
  } | null;
  const puzzle = record?.puzzle;
  const id = typeof puzzle?.id === 'string' ? puzzle.id : null;
  if (!id) throw new Error('Lichess puzzle is missing an id');

  const solution = Array.isArray(puzzle?.solution)
    ? puzzle.solution.filter((m): m is string => typeof m === 'string')
    : [];
  if (solution.length === 0) throw new Error(`Lichess puzzle ${id} has no solution`);

  const chess = new Chess();
  let lastMove: string | null = typeof puzzle?.lastMove === 'string' ? puzzle.lastMove : null;
  if (typeof puzzle?.fen === 'string' && puzzle.fen.trim()) {
    try {
      chess.load(puzzle.fen);
    } catch (error) {
      throw new Error(
        `Lichess puzzle ${id} has an invalid FEN: ${error instanceof Error ? error.message : error}`,
      );
    }
  } else {
    const pgn = typeof record?.game?.pgn === 'string' ? record.game.pgn : '';
    const sans = pgn.split(/\s+/).filter(Boolean);
    if (sans.length === 0) throw new Error(`Lichess puzzle ${id} has neither FEN nor PGN`);
    for (const san of sans) {
      let move;
      try {
        move = chess.move(san);
      } catch {
        move = null;
      }
      if (!move) throw new Error(`Lichess puzzle ${id}: could not replay PGN move "${san}"`);
      lastMove = `${move.from}${move.to}${move.promotion ?? ''}`;
    }
  }

  const fen = chess.fen();
  for (const uci of solution) {
    if (!playUci(chess, uci)) {
      throw new Error(`Lichess puzzle ${id}: solution move "${uci}" is illegal`);
    }
  }

  const rating = Number(puzzle?.rating);
  return {
    id,
    rating: Number.isFinite(rating) ? rating : null,
    themes: Array.isArray(puzzle?.themes)
      ? puzzle.themes.filter((t): t is string => typeof t === 'string')
      : [],
    fen,
    lastMove,
    solution,
    gameId: typeof record?.game?.id === 'string' ? record.game.id : null,
  };
}

export class LichessUnauthorizedError extends Error {
  constructor() {
    super('Your Lichess connection has expired or was revoked. Please reconnect.');
    this.name = 'LichessUnauthorizedError';
  }
}

interface LichessRequestOptions {
  /** Lichess OAuth token; when set, only unseen puzzles are served. */
  token?: string | null;
  fetchImpl?: typeof fetch;
}

async function lichessRequest(
  url: string,
  init: RequestInit,
  { token, fetchImpl = fetch }: LichessRequestOptions,
): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(15000) });
  } catch (error) {
    throw new Error(
      `Could not reach Lichess: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (response.status === 401 && token) throw new LichessUnauthorizedError();
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
    throw new Error(
      `Lichess puzzle request failed (status ${response.status})${detail ? `: ${detail}` : ''}`,
    );
  }
  return response.json();
}

function parseBatch(body: unknown, theme: string): FocusPuzzle[] {
  const list = (body as { puzzles?: unknown } | null)?.puzzles;
  if (!Array.isArray(list)) throw new Error('Unexpected response from Lichess: no puzzle list');
  const puzzles: FocusPuzzle[] = [];
  for (const raw of list) {
    try {
      puzzles.push(parseLichessPuzzle(raw));
    } catch (error) {
      console.warn('[Focus] Skipping malformed Lichess puzzle:', error);
    }
  }
  if (puzzles.length === 0) {
    throw new Error(`Lichess returned no usable puzzles for theme "${theme}"`);
  }
  return puzzles;
}

const batchUrl = (theme: string) =>
  `https://lichess.org/api/puzzle/batch/${encodeURIComponent(theme)}`;

/**
 * Fetch a batch of themed puzzles straight from Lichess. The endpoint is public
 * and CORS-enabled; with a token, Lichess only serves puzzles the user hasn't
 * seen and pitches difficulty relative to their puzzle rating. Malformed
 * puzzles are skipped (with a warning) rather than failing the whole batch.
 */
export async function fetchFocusPuzzles(
  theme: string,
  difficulty: FocusDifficulty,
  count = 20,
  options: LichessRequestOptions = {},
): Promise<FocusPuzzle[]> {
  const params = new URLSearchParams({ nb: String(count), difficulty });
  const body = await lichessRequest(`${batchUrl(theme)}?${params}`, {}, options);
  return parseBatch(body, theme);
}

export interface PuzzleResult {
  id: string;
  win: boolean;
}

export interface SubmitResultsResponse {
  /** Rating change per submitted puzzle id (missing if Lichess didn't rate it). */
  ratingDiffs: Record<string, number>;
  /** User's Lichess puzzle rating after these results, if reported. */
  rating: number | null;
}

/**
 * Record results on the user's Lichess account. `rated` decides whether they
 * move the user's puzzle rating; either way the puzzles are marked as played.
 */
export async function submitPuzzleResults(
  theme: string,
  results: PuzzleResult[],
  token: string,
  rated: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResultsResponse> {
  const body = (await lichessRequest(
    `${batchUrl(theme)}?nb=0`,
    {
      method: 'POST',
      body: JSON.stringify({ solutions: results.map((r) => ({ ...r, rated })) }),
    },
    { token, fetchImpl },
  )) as { rounds?: unknown; glicko?: { rating?: unknown } } | null;

  const ratingDiffs: Record<string, number> = {};
  if (Array.isArray(body?.rounds)) {
    for (const round of body.rounds as Array<{ id?: unknown; ratingDiff?: unknown }>) {
      const diff = Number(round?.ratingDiff);
      if (typeof round?.id === 'string' && Number.isFinite(diff)) ratingDiffs[round.id] = diff;
    }
  }
  const rating = Number(body?.glicko?.rating);
  return { ratingDiffs, rating: Number.isFinite(rating) ? Math.round(rating) : null };
}

/**
 * IDs of puzzles the user has already played on Lichess, most recent first.
 * Used to filter fixed-level batches, which are fetched anonymously and so
 * don't get Lichess's own "unseen only" filtering.
 */
export async function fetchPlayedPuzzleIds(
  token: string,
  max = 5000,
  fetchImpl: typeof fetch = fetch,
): Promise<Set<string>> {
  let response: Response;
  try {
    response = await fetchImpl(`https://lichess.org/api/puzzle/activity?max=${max}`, {
      headers: { Accept: 'application/x-ndjson', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    throw new Error(
      `Could not reach Lichess: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (response.status === 401) throw new LichessUnauthorizedError();
  if (!response.ok) {
    throw new Error(`Lichess puzzle history request failed (status ${response.status})`);
  }
  const ids = new Set<string>();
  for (const line of (await response.text()).split('\n')) {
    if (!line.trim()) continue;
    try {
      const id = (JSON.parse(line) as { puzzle?: { id?: unknown } }).puzzle?.id;
      if (typeof id === 'string') ids.add(id);
    } catch {
      // A truncated final line is harmless; skip it.
    }
  }
  return ids;
}
