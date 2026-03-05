import { nanoid } from 'nanoid';
import { withStores } from './transaction';
import {
  DEFAULT_BLACK_NAME,
  DEFAULT_PLAYER_COLOR,
  DEFAULT_RESULT,
  DEFAULT_WHITE_NAME,
  START_FEN,
} from '../otb/constants';
import type { OtbGame } from '../otb/types';

const OTB_GAMES = 'otb_games';

function toIsoDateString(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeGame(input: Partial<OtbGame>): OtbGame {
  const now = new Date().toISOString();
  const moves = Array.isArray(input.moves)
    ? input.moves.filter((move) => move?.from && move?.to && move?.san && move?.fenAfter)
    : [];

  return {
    id: input.id || nanoid(),
    createdAt: toIsoDateString(input.createdAt),
    updatedAt: toIsoDateString(input.updatedAt || now),
    playedAt: toIsoDateString(input.playedAt || now),
    whiteName: typeof input.whiteName === 'string' ? input.whiteName : DEFAULT_WHITE_NAME,
    blackName: typeof input.blackName === 'string' ? input.blackName : DEFAULT_BLACK_NAME,
    playerColor:
      input.playerColor === 'white' || input.playerColor === 'black'
        ? input.playerColor
        : DEFAULT_PLAYER_COLOR,
    result: input.result || DEFAULT_RESULT,
    moves,
    currentFen: typeof input.currentFen === 'string' ? input.currentFen : START_FEN,
    status: input.status === 'finished' ? 'finished' : 'active',
    linkedSessionId: typeof input.linkedSessionId === 'number' ? input.linkedSessionId : null,
  };
}

function sortByUpdatedDesc(games: OtbGame[]): OtbGame[] {
  return games.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getOtbGames(): Promise<OtbGame[]> {
  return withStores([OTB_GAMES] as const, 'readonly', async ({ otb_games }) => {
    try {
      const all = await otb_games.getAll();
      const normalized = all.map((game) => normalizeGame(game)).filter(Boolean);
      return sortByUpdatedDesc(normalized);
    } catch {
      return [];
    }
  });
}

export async function getOtbGame(id: string): Promise<OtbGame | null> {
  return withStores([OTB_GAMES] as const, 'readonly', async ({ otb_games }) => {
    const stored = await otb_games.get(id);
    return stored ? normalizeGame(stored) : null;
  });
}

export async function createOtbGame(partial: Partial<OtbGame> = {}): Promise<OtbGame> {
  return withStores([OTB_GAMES] as const, 'readwrite', async ({ otb_games }) => {
    const now = new Date().toISOString();
    const newGame = normalizeGame({
      ...partial,
      id: partial.id || nanoid(),
      createdAt: partial.createdAt || now,
      updatedAt: now,
      playedAt: partial.playedAt || now,
      result: partial.result || DEFAULT_RESULT,
      currentFen: partial.currentFen || START_FEN,
      moves: partial.moves || [],
      status: partial.status || 'active',
      linkedSessionId: partial.linkedSessionId ?? null,
    });

    await otb_games.put(newGame);
    return newGame;
  });
}

export async function saveOtbGame(game: OtbGame): Promise<OtbGame> {
  return withStores([OTB_GAMES] as const, 'readwrite', async ({ otb_games }) => {
    const normalized = normalizeGame({
      ...game,
      updatedAt: new Date().toISOString(),
    });
    await otb_games.put(normalized);
    return normalized;
  });
}

export async function deleteOtbGame(id: string): Promise<void> {
  await withStores([OTB_GAMES] as const, 'readwrite', async ({ otb_games }) => {
    await otb_games.delete(id);
  });
}

export async function resetOtbGame(id: string): Promise<OtbGame | null> {
  return withStores([OTB_GAMES] as const, 'readwrite', async ({ otb_games }) => {
    const existing = await otb_games.get(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updated = normalizeGame({
      ...existing,
      moves: [],
      currentFen: START_FEN,
      result: DEFAULT_RESULT,
      status: 'active',
      linkedSessionId: null,
      updatedAt: now,
    });

    await otb_games.put(updated);
    return updated;
  });
}
