import { describe, expect, it } from 'vitest';
import { START_FEN } from './constants';
import { buildPgn, getPgnFilename } from './pgn';
import { applyMove } from './chess';
import type { OtbGame } from './types';

function createGame(overrides: Partial<OtbGame> = {}): OtbGame {
  const now = '2026-03-05T10:00:00.000Z';
  return {
    id: 'pgn-test',
    createdAt: now,
    updatedAt: now,
    playedAt: now,
    whiteName: 'Alice',
    blackName: 'Bob',
    playerColor: 'white',
    result: '*',
    moves: [],
    currentFen: START_FEN,
    status: 'active',
    linkedSessionId: null,
    ...overrides,
  };
}

describe('otb pgn', () => {
  it('creates PGN with standard headers and move text', () => {
    const first = applyMove(createGame(), 'e2', 'e4');
    const second = applyMove(first.game, 'e7', 'e5');
    const pgn = buildPgn(second.game);

    expect(pgn).toContain('[Event "OTB Game"]');
    expect(pgn).toContain('[Site "Pawn Star Chess Log"]');
    expect(pgn).toContain('[White "Alice"]');
    expect(pgn).toContain('[Black "Bob"]');
    expect(pgn).toContain('1. e4 e5');
    expect(pgn).toContain('*');
  });

  it('supports explicit result values', () => {
    const game = createGame({ result: '1/2-1/2' });
    const pgn = buildPgn(game);
    expect(pgn).toContain('[Result "1/2-1/2"]');
  });

  it('includes promotion notation in PGN', () => {
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
      game = applyMove(game, from as any, to as any).game;
    }

    game = applyMove(game, 'b7', 'a8', 'q').game;
    const pgn = buildPgn(game);
    expect(pgn).toContain('=Q');
  });

  it('builds download filename from metadata', () => {
    const filename = getPgnFilename(
      createGame({
        whiteName: 'Alice A',
        blackName: 'Bob B',
        playedAt: '2026-01-02T10:00:00.000Z',
      }),
    );
    expect(filename).toBe('otb-alice-a-vs-bob-b-2026-01-02.pgn');
  });
});
