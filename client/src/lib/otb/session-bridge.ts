import type { InsertTrainingSession } from '@shared/schema';
import type { OtbGame } from './types';

function resolveGameResult(game: OtbGame): 'win' | 'loss' | 'draw' {
  if (game.result === '1/2-1/2') {
    return 'draw';
  }

  if (!game.playerColor || game.result === '*') {
    throw new Error('Set player colour and final result before creating an activity session');
  }

  if (game.playerColor === 'white') {
    return game.result === '1-0' ? 'win' : 'loss';
  }

  return game.result === '0-1' ? 'win' : 'loss';
}

function toDate(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  return new Date();
}

function buildPayload(game: OtbGame): InsertTrainingSession {
  if (game.playerColor !== 'white' && game.playerColor !== 'black') {
    throw new Error('Set player colour and final result before creating an activity session');
  }

  const opponentUsername =
    game.playerColor === 'white' ? game.blackName.trim() : game.whiteName.trim();

  return {
    type: 'game',
    date: toDate(game.playedAt),
    gameResult: resolveGameResult(game),
    playerColor: game.playerColor,
    platform: 'otb',
    opponentUsername: opponentUsername || undefined,
    gameComments: `${game.moves.length} ply recorded on OTB board`,
  };
}

export async function upsertOtbSession(game: OtbGame): Promise<number> {
  const payload = buildPayload(game);
  const { createSession, updateSession } = await import('@/lib/firebase');

  if (game.linkedSessionId) {
    const updated = await updateSession(game.linkedSessionId, payload);
    if (updated?.id) {
      return updated.id;
    }
  }

  const created = await createSession(payload);
  return created.id;
}
