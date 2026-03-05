import { describe, expect, it } from 'vitest';
import { START_FEN } from './constants';
import { applyMove, getLegalDestinations, moveNeedsPromotion, undoLastMove } from './chess';
import type { OtbGame } from './types';

function createGame(): OtbGame {
  const now = new Date().toISOString();
  return {
    id: 'test',
    createdAt: now,
    updatedAt: now,
    playedAt: now,
    whiteName: '',
    blackName: '',
    playerColor: null,
    result: '*',
    moves: [],
    currentFen: START_FEN,
    status: 'active',
    linkedSessionId: null,
  };
}

describe('otb chess utils', () => {
  it('applies legal moves and stores SAN/FEN', () => {
    const base = createGame();
    const result = applyMove(base, 'e2', 'e4');

    expect(result.applied).toBe(true);
    expect(result.game.moves).toHaveLength(1);
    expect(result.game.moves[0].san).toBe('e4');
    expect(result.game.currentFen).not.toBe(START_FEN);
  });

  it('rejects illegal moves', () => {
    const base = createGame();
    const result = applyMove(base, 'e2', 'e5');

    expect(result.applied).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.game.moves).toHaveLength(0);
  });

  it('returns legal destination squares', () => {
    const legal = getLegalDestinations(createGame(), 'e2');
    expect(legal).toContain('e3');
    expect(legal).toContain('e4');
  });

  it('requires promotion piece for promotion moves', () => {
    let game = createGame();
    const sequence: Array<[string, string]> = [
      ['a2', 'a4'],
      ['h7', 'h5'],
      ['a4', 'a5'],
      ['h5', 'h4'],
      ['a5', 'a6'],
      ['h4', 'h3'],
      ['a6', 'b7'],
      ['h3', 'g2'],
    ];

    for (const [from, to] of sequence) {
      const next = applyMove(game, from as any, to as any);
      expect(next.applied).toBe(true);
      game = next.game;
    }

    expect(moveNeedsPromotion(game, 'b7', 'a8')).toBe(true);
    const withoutPiece = applyMove(game, 'b7', 'a8');
    expect(withoutPiece.promotionRequired).toBe(true);

    const withQueen = applyMove(game, 'b7', 'a8', 'q');
    expect(withQueen.applied).toBe(true);
    expect(withQueen.game.moves[withQueen.game.moves.length - 1].san).toContain('=');
  });

  it('undo restores previous position and move list', () => {
    const once = applyMove(createGame(), 'e2', 'e4').game;
    const twice = applyMove(once, 'e7', 'e5').game;
    const undone = undoLastMove(twice);

    expect(undone.moves).toHaveLength(1);
    expect(undone.currentFen).toBe(once.currentFen);
  });

  it('marks game as finished when checkmate is reached', () => {
    let game = createGame();
    const sequence: Array<[any, any]> = [
      ['e2', 'e4'],
      ['e7', 'e5'],
      ['d1', 'h5'],
      ['b8', 'c6'],
      ['f1', 'c4'],
      ['g8', 'f6'],
      ['h5', 'f7'],
    ];

    for (const [from, to] of sequence) {
      const next = applyMove(game, from, to);
      expect(next.applied).toBe(true);
      game = next.game;
    }

    expect(game.status).toBe('finished');
  });
});
