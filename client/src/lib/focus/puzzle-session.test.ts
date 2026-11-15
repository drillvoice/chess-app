import { describe, expect, it } from 'vitest';
import { parseLichessPuzzle } from './lichess-puzzles';
import { MATE_IN_2_RAW } from './test-fixtures';
import {
  isCapture,
  playOpponentReply,
  revealSolution,
  solutionSan,
  solverColor,
  startPuzzle,
  submitMove,
} from './puzzle-session';

const puzzle = parseLichessPuzzle(MATE_IN_2_RAW);

describe('puzzle session', () => {
  it('solves the puzzle by following the line', () => {
    expect(solverColor(puzzle)).toBe('b');
    let { state, verdict } = submitMove(startPuzzle(puzzle), 'g5e3');
    expect(verdict).toBe('correct');
    state = playOpponentReply(state);
    expect(state.lastMove).toBe('b6e3');
    ({ state, verdict } = submitMove(state, 'g6g2'));
    expect(verdict).toBe('solved');
    expect(state.status).toBe('solved');
    expect(state.mistake).toBe(false);
  });

  it('flags a wrong move but lets the player retry', () => {
    const start = startPuzzle(puzzle);
    const wrong = submitMove(start, 'h7h8');
    expect(wrong.verdict).toBe('wrong');
    expect(wrong.state.fen).toBe(start.fen);
    expect(wrong.state.mistake).toBe(true);
    expect(submitMove(wrong.state, 'g5e3').verdict).toBe('correct');
  });

  it('treats illegal moves as no-ops', () => {
    const start = startPuzzle(puzzle);
    expect(submitMove(start, 'a1a2')).toEqual({ state: start, verdict: 'illegal' });
  });

  it('reveals the solution as a failure', () => {
    const revealed = revealSolution(startPuzzle(puzzle));
    expect(revealed.status).toBe('failed');
    expect(revealed.lastMove).toBe('g6g2');
    expect(solutionSan(puzzle)).toEqual(['Be3+', 'Bxe3', 'Qxg2#']);
  });
});

describe('isCapture', () => {
  it('tells captures from quiet moves', () => {
    // From the puzzle position: Be3+ is quiet, and after it Bxe3 captures.
    expect(isCapture(puzzle.fen, 'g5e3')).toBe(false);
    const { state } = submitMove(startPuzzle(puzzle), 'g5e3');
    expect(isCapture(state.fen, 'b6e3')).toBe(true);
  });
});
