import { describe, expect, it } from 'vitest';
import { parseLichessPuzzle } from '@/lib/focus/lichess-puzzles';
import { MATE_IN_2_RAW } from '@/lib/focus/test-fixtures';
import { mistakeLine } from './missed-puzzle';

const puzzle = parseLichessPuzzle(MATE_IN_2_RAW);

describe('mistakeLine', () => {
  it('ends with the wrong move after the correct moves before it', () => {
    expect(mistakeLine({ puzzle, ply: 2, wrongMove: 'g6g5', reason: 'wrong' })).toEqual([
      'g5e3',
      'b6e3',
      'g6g5',
    ]);
  });

  it('stops at the miss point for a skip', () => {
    expect(mistakeLine({ puzzle, ply: 0, wrongMove: null, reason: 'skipped' })).toEqual([]);
  });
});
