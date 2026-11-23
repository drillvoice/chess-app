import { describe, expect, it } from 'vitest';
import { formatScore, parseInfoLine, uciLineToSan } from './uci';

describe('parseInfoLine', () => {
  it('parses a cp line and keeps White’s view when White is to move', () => {
    const line = parseInfoLine(
      'info depth 12 seldepth 18 multipv 2 score cp 35 nodes 1000 nps 5000 time 200 pv e2e4 e7e5 g1f3',
      true,
    );
    expect(line).toEqual({
      multipv: 2,
      depth: 12,
      cp: 35,
      mate: null,
      pv: ['e2e4', 'e7e5', 'g1f3'],
    });
  });

  it('flips the score to White’s view when Black is to move', () => {
    expect(parseInfoLine('info depth 5 score cp 120 pv e7e5', false)?.cp).toBe(-120);
    expect(parseInfoLine('info depth 5 score mate 2 pv d8h4', false)?.mate).toBe(-2);
    expect(parseInfoLine('info depth 5 score mate -3 pv e7e5', false)?.mate).toBe(3);
  });

  it('ignores lines without a usable score and PV', () => {
    expect(parseInfoLine('info depth 3 currmove e2e4 currmovenumber 1', true)).toBeNull();
    expect(parseInfoLine('info string NNUE evaluation using nn.nnue', true)).toBeNull();
    expect(parseInfoLine('info depth 9 score cp 20 lowerbound pv e2e4', true)).toBeNull();
    expect(parseInfoLine('bestmove e2e4 ponder e7e5', true)).toBeNull();
  });
});

describe('formatScore', () => {
  it('formats pawns and mates like Lichess', () => {
    expect(formatScore({ cp: 125, mate: null })).toBe('+1.3');
    expect(formatScore({ cp: -40, mate: null })).toBe('−0.4');
    expect(formatScore({ cp: 0, mate: null })).toBe('0.0');
    expect(formatScore({ cp: null, mate: 3 })).toBe('#3');
    expect(formatScore({ cp: null, mate: -2 })).toBe('#−2');
  });
});

describe('uciLineToSan', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('labels move numbers', () => {
    expect(uciLineToSan(start, ['e2e4', 'e7e5', 'g1f3'])).toEqual([
      { uci: 'e2e4', san: 'e4', label: '1.' },
      { uci: 'e7e5', san: 'e5', label: null },
      { uci: 'g1f3', san: 'Nf3', label: '2.' },
    ]);
  });

  it('labels a line that starts with Black', () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(uciLineToSan(afterE4, ['e7e5'])[0].label).toBe('1…');
  });

  it('stops at the first illegal move instead of throwing', () => {
    expect(uciLineToSan(start, ['e2e4', 'e2e4'])).toHaveLength(1);
    expect(uciLineToSan('not a fen', ['e2e4'])).toEqual([]);
  });
});
