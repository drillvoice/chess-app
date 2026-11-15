import { Chess } from 'chess.js';
import { playUci, type FocusPuzzle } from './lichess-puzzles';

export type PuzzleStatus = 'playing' | 'solved' | 'failed';

export interface PuzzleState {
  puzzle: FocusPuzzle;
  /** Number of solution plies already on the board. */
  ply: number;
  fen: string;
  lastMove: string | null;
  status: PuzzleStatus;
  /** True once the player has made any wrong move (puzzle counts as missed). */
  mistake: boolean;
}

export type MoveVerdict = 'correct' | 'solved' | 'wrong' | 'illegal';

function boardAt(puzzle: FocusPuzzle, ply: number): Chess {
  const chess = new Chess(puzzle.fen);
  for (const uci of puzzle.solution.slice(0, ply)) {
    if (!playUci(chess, uci)) throw new Error(`Puzzle ${puzzle.id}: cannot replay "${uci}"`);
  }
  return chess;
}

export function startPuzzle(puzzle: FocusPuzzle): PuzzleState {
  return {
    puzzle,
    ply: 0,
    fen: puzzle.fen,
    lastMove: puzzle.lastMove,
    status: 'playing',
    mistake: false,
  };
}

/**
 * Rebuild a puzzle part-way through, e.g. when resuming a saved session. The
 * board is replayed from the solution rather than trusted from storage. A
 * puzzle saved on the opponent's turn (between the player's move and the
 * scripted reply) gets that reply played, so the board is never stuck.
 */
export function restorePuzzleState(
  puzzle: FocusPuzzle,
  ply: number,
  status: PuzzleStatus,
  mistake: boolean,
): PuzzleState {
  if (!Number.isInteger(ply) || ply < 0 || ply > puzzle.solution.length) {
    throw new Error(`Puzzle ${puzzle.id}: invalid saved ply ${ply}`);
  }
  if (status === 'failed') return revealSolution({ ...startPuzzle(puzzle), mistake: true });
  const chess = boardAt(puzzle, ply);
  const restored: PuzzleState = {
    puzzle,
    ply,
    fen: chess.fen(),
    lastMove: ply > 0 ? puzzle.solution[ply - 1] : puzzle.lastMove,
    status: status === 'solved' || ply >= puzzle.solution.length ? 'solved' : 'playing',
    mistake,
  };
  return playOpponentReply(restored);
}

/** Colour the player is solving for. */
export function solverColor(puzzle: FocusPuzzle): 'w' | 'b' {
  return new Chess(puzzle.fen).turn();
}

/**
 * Check the player's move against the solution. A wrong move leaves the board
 * unchanged so they can try again, but the puzzle is marked as missed. Like
 * Lichess, any move that delivers checkmate is accepted even if it differs from
 * the stored line.
 */
export function submitMove(
  state: PuzzleState,
  uci: string,
): { state: PuzzleState; verdict: MoveVerdict } {
  if (state.status !== 'playing') return { state, verdict: 'illegal' };
  const chess = boardAt(state.puzzle, state.ply);
  const expected = state.puzzle.solution[state.ply];
  if (!playUci(chess, uci)) return { state, verdict: 'illegal' };

  if (uci !== expected && !chess.isCheckmate()) {
    return { state: { ...state, mistake: true }, verdict: 'wrong' };
  }

  const nextPly = state.ply + 1;
  const done = chess.isCheckmate() || nextPly >= state.puzzle.solution.length;
  return {
    state: {
      ...state,
      ply: nextPly,
      fen: chess.fen(),
      lastMove: uci,
      status: done ? 'solved' : 'playing',
    },
    verdict: done ? 'solved' : 'correct',
  };
}

/** Play the opponent's scripted reply, if it is their turn. */
export function playOpponentReply(state: PuzzleState): PuzzleState {
  if (state.status !== 'playing' || state.ply % 2 === 0) return state;
  const reply = state.puzzle.solution[state.ply];
  if (!reply) return state;
  const chess = boardAt(state.puzzle, state.ply);
  if (!playUci(chess, reply)) throw new Error(`Puzzle ${state.puzzle.id}: bad reply "${reply}"`);
  return { ...state, ply: state.ply + 1, fen: chess.fen(), lastMove: reply };
}

/** Give up: play out the whole solution and mark the puzzle as failed. */
export function revealSolution(state: PuzzleState): PuzzleState {
  const { puzzle } = state;
  const chess = boardAt(puzzle, puzzle.solution.length);
  return {
    ...state,
    ply: puzzle.solution.length,
    fen: chess.fen(),
    lastMove: puzzle.solution[puzzle.solution.length - 1] ?? state.lastMove,
    status: 'failed',
    mistake: true,
  };
}

/** SAN of the full solution line, for display after the puzzle ends. */
export function solutionSan(puzzle: FocusPuzzle): string[] {
  const chess = new Chess(puzzle.fen);
  return puzzle.solution.map((uci) => playUci(chess, uci) ?? uci);
}

/** Whether a UCI move from this position captures (including en passant). */
export function isCapture(fen: string, uci: string): boolean {
  const san = playUci(new Chess(fen), uci);
  return san !== null && san.includes('x');
}
