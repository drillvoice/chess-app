import { Chess, type PieceSymbol, type Square as ChessSquare } from 'chess.js';
import type { PieceView } from '@/lib/otb/chess';
import type { PromotionPiece, Square } from '@/lib/otb/types';
import type {
  OpeningMoveNode,
  OpeningMoveStats,
  OpeningRepertoire,
  OpeningTrainerSide,
  OpeningTrainingState,
} from './types';

export interface TrainerMoveResult {
  state: OpeningTrainingState;
  applied: boolean;
  correct: boolean;
  promotionRequired: boolean;
  message?: string;
}

function sideToTurn(side: OpeningTrainerSide): 'w' | 'b' {
  return side === 'white' ? 'w' : 'b';
}

function chessFromFen(fen: string): Chess {
  return new Chess(fen);
}

function getTurn(fen: string): 'w' | 'b' {
  return chessFromFen(fen).turn();
}

function getChildren(repertoire: OpeningRepertoire, nodeId: string): OpeningMoveNode[] {
  const node = repertoire.nodes[nodeId];
  return node ? node.children.map((id) => repertoire.nodes[id]).filter(Boolean) : [];
}

function statFor(repertoire: OpeningRepertoire, moveId: string): OpeningMoveStats {
  return repertoire.stats[moveId] ?? { attempts: 0, misses: 0, streak: 0 };
}

export function moveWeight(
  repertoire: OpeningRepertoire,
  moveId: string,
  now = new Date(),
): number {
  const stat = statFor(repertoire, moveId);
  const staleDays = stat.lastSeenAt
    ? Math.max(0, (now.getTime() - new Date(stat.lastSeenAt).getTime()) / 86_400_000)
    : 7;
  return 1 + stat.misses * 4 + Math.max(0, 3 - stat.streak) + Math.min(3, staleDays / 7);
}

export function chooseWeightedMove(
  repertoire: OpeningRepertoire,
  moves: OpeningMoveNode[],
  rng: () => number = Math.random,
): OpeningMoveNode | null {
  if (moves.length === 0) {
    return null;
  }
  const weights = moves.map((move) => moveWeight(repertoire, move.id));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = rng() * total;
  for (let index = 0; index < moves.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) {
      return moves[index];
    }
  }
  return moves[moves.length - 1];
}

function hasSamePrefix(path: string[], prefix: string[]): boolean {
  return prefix.every((moveId, index) => path[index] === moveId);
}

function chooseMoveForLine(
  state: OpeningTrainingState,
  moves: OpeningMoveNode[],
  rng: () => number = Math.random,
): OpeningMoveNode | null {
  if (moves.length <= 1 || state.lastCompletedLineMoveIds.length === 0) {
    return chooseWeightedMove(state.repertoire, moves, rng);
  }

  if (!hasSamePrefix(state.lastCompletedLineMoveIds, state.currentLineMoveIds)) {
    return chooseWeightedMove(state.repertoire, moves, rng);
  }

  const previouslyChosenMoveId = state.lastCompletedLineMoveIds[state.currentLineMoveIds.length];
  const alternatives = moves.filter((move) => move.id !== previouslyChosenMoveId);
  return chooseWeightedMove(state.repertoire, alternatives.length > 0 ? alternatives : moves, rng);
}

function chooseExpectedUserMove(
  state: OpeningTrainingState,
  rng: () => number = Math.random,
): OpeningTrainingState {
  if (state.feedback === 'complete' || state.expectedMoveId) {
    return state;
  }
  if (getTurn(state.currentFen) !== sideToTurn(state.repertoire.side)) {
    return state;
  }
  const expected = chooseMoveForLine(
    state,
    getChildren(state.repertoire, state.currentNodeId),
    rng,
  );
  return expected ? { ...state, expectedMoveId: expected.id } : { ...state, feedback: 'complete' };
}

export function advanceOpponentMoves(
  state: OpeningTrainingState,
  rng: () => number = Math.random,
): OpeningTrainingState {
  let next = { ...state, expectedMoveId: null, feedback: 'idle' as const };

  while (getTurn(next.currentFen) !== sideToTurn(next.repertoire.side)) {
    const move = chooseMoveForLine(next, getChildren(next.repertoire, next.currentNodeId), rng);
    if (!move) {
      return {
        ...next,
        feedback: 'complete',
        lastCompletedLineMoveIds: next.currentLineMoveIds,
      };
    }
    next = {
      ...next,
      currentNodeId: move.id,
      currentFen: move.fenAfter,
      incorrectAttempts: 0,
      expectedMoveId: null,
      currentLineMoveIds: [...next.currentLineMoveIds, move.id],
    };
  }

  if (getChildren(next.repertoire, next.currentNodeId).length === 0) {
    return { ...next, feedback: 'complete', lastCompletedLineMoveIds: next.currentLineMoveIds };
  }

  return chooseExpectedUserMove(next, rng);
}

export function startOpeningTraining(
  repertoire: OpeningRepertoire,
  lastCompletedLineMoveIds: string[] = [],
  rng: () => number = Math.random,
): OpeningTrainingState {
  return advanceOpponentMoves(
    {
      repertoire,
      currentNodeId: repertoire.rootNodeId,
      currentFen: repertoire.nodes[repertoire.rootNodeId].fenAfter,
      expectedMoveId: null,
      incorrectAttempts: 0,
      feedback: 'idle',
      currentLineMoveIds: [],
      lastCompletedLineMoveIds,
    },
    rng,
  );
}

function updateMoveStats(
  repertoire: OpeningRepertoire,
  moveId: string,
  correct: boolean,
): OpeningRepertoire {
  const current = statFor(repertoire, moveId);
  const updated: OpeningMoveStats = {
    attempts: current.attempts + 1,
    misses: current.misses + (correct ? 0 : 1),
    streak: correct ? current.streak + 1 : 0,
    lastSeenAt: new Date().toISOString(),
  };

  return {
    ...repertoire,
    updatedAt: new Date().toISOString(),
    stats: {
      ...repertoire.stats,
      [moveId]: updated,
    },
  };
}

export function applyTrainerMove(
  state: OpeningTrainingState,
  from: Square,
  to: Square,
  promotion?: PromotionPiece,
  rng: () => number = Math.random,
): TrainerMoveResult {
  const prepared = chooseExpectedUserMove(state, rng);
  const expectedMove = prepared.expectedMoveId
    ? prepared.repertoire.nodes[prepared.expectedMoveId]
    : null;
  if (!expectedMove) {
    return {
      state: {
        ...prepared,
        feedback: 'complete',
        lastCompletedLineMoveIds: prepared.currentLineMoveIds,
      },
      applied: false,
      correct: false,
      promotionRequired: false,
    };
  }

  const chess = chessFromFen(prepared.currentFen);
  const candidates = chess
    .moves({ square: from as ChessSquare, verbose: true })
    .filter((move) => move.to === to);
  if (candidates.length === 0) {
    return markIncorrect(prepared, expectedMove.id);
  }

  const needsPromotion = candidates.some((move) => Boolean(move.promotion));
  if (needsPromotion && !promotion) {
    return { state: prepared, applied: false, correct: false, promotionRequired: true };
  }

  const appliedMove = chess.move({
    from: from as ChessSquare,
    to: to as ChessSquare,
    promotion: promotion as PieceSymbol | undefined,
  });
  if (!appliedMove) {
    return markIncorrect(prepared, expectedMove.id);
  }

  const playedUci = `${appliedMove.from}${appliedMove.to}${appliedMove.promotion ?? ''}`;
  const matchingMove = expectedMove.uci === playedUci ? expectedMove : null;

  if (!matchingMove) {
    return markIncorrect(prepared, expectedMove.id);
  }

  const repertoire = updateMoveStats(prepared.repertoire, matchingMove.id, true);
  const nextState = advanceOpponentMoves(
    {
      ...prepared,
      repertoire,
      currentNodeId: matchingMove.id,
      currentFen: matchingMove.fenAfter,
      expectedMoveId: null,
      incorrectAttempts: 0,
      feedback: 'idle',
      currentLineMoveIds: [...prepared.currentLineMoveIds, matchingMove.id],
    },
    rng,
  );

  return { state: nextState, applied: true, correct: true, promotionRequired: false };
}

function markIncorrect(state: OpeningTrainingState, expectedMoveId: string): TrainerMoveResult {
  const repertoire = updateMoveStats(state.repertoire, expectedMoveId, false);
  const attempts = state.incorrectAttempts + 1;
  return {
    state: {
      ...state,
      repertoire,
      incorrectAttempts: attempts,
      feedback: attempts >= 2 ? 'revealed' : 'incorrect',
      expectedMoveId,
    },
    applied: false,
    correct: false,
    promotionRequired: false,
    message:
      attempts >= 2 ? `Correct move: ${state.repertoire.nodes[expectedMoveId].san}` : 'Try again',
  };
}

export function getPieceMapFromFen(fen: string): Record<string, PieceView> {
  const chess = chessFromFen(fen);
  const map: Record<string, PieceView> = {};
  for (const file of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const) {
    for (const rank of ['1', '2', '3', '4', '5', '6', '7', '8'] as const) {
      const square = `${file}${rank}` as ChessSquare;
      const piece = chess.get(square);
      if (piece) {
        map[square] = { color: piece.color, type: piece.type };
      }
    }
  }
  return map;
}

export function getLegalDestinationsFromFen(fen: string, from: Square): Square[] {
  try {
    return chessFromFen(fen)
      .moves({ square: from as ChessSquare, verbose: true })
      .map((move) => move.to as Square);
  } catch {
    return [];
  }
}

export function moveNeedsPromotionFromFen(fen: string, from: Square, to: Square): boolean {
  return chessFromFen(fen)
    .moves({ square: from as ChessSquare, verbose: true })
    .filter((move) => move.to === to)
    .some((move) => Boolean(move.promotion));
}

export function expectedMoveSan(state: OpeningTrainingState): string | null {
  return state.expectedMoveId ? (state.repertoire.nodes[state.expectedMoveId]?.san ?? null) : null;
}
