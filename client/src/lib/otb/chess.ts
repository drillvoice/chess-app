import { Chess, type PieceSymbol, type Square as ChessSquare } from 'chess.js';
import type { OtbGame, OtbGameStatus, PromotionPiece, Square } from './types';

export interface MoveApplicationResult {
  game: OtbGame;
  applied: boolean;
  promotionRequired: boolean;
  error?: string;
}

export interface PieceView {
  color: 'w' | 'b';
  type: PieceSymbol;
}

function toChess(game: OtbGame): Chess {
  const chess = new Chess();
  for (const move of game.moves) {
    const applied = chess.move({
      from: move.from as ChessSquare,
      to: move.to as ChessSquare,
      promotion: move.promotion as PieceSymbol | undefined,
    });
    if (!applied) {
      throw new Error(`Failed to rebuild OTB game ${game.id} at ply ${move.ply}`);
    }
  }
  return chess;
}

function getStatus(chess: Chess): OtbGameStatus {
  return chess.isGameOver() ? 'finished' : 'active';
}

export function getActiveColor(game: OtbGame): 'w' | 'b' {
  return toChess(game).turn();
}

export function getPieceMap(game: OtbGame): Record<string, PieceView> {
  const chess = toChess(game);
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

export function getLegalDestinations(game: OtbGame, from: Square): Square[] {
  try {
    const chess = toChess(game);
    return chess
      .moves({ square: from as ChessSquare, verbose: true })
      .map((move) => move.to as Square);
  } catch {
    return [];
  }
}

export function moveNeedsPromotion(game: OtbGame, from: Square, to: Square): boolean {
  const chess = toChess(game);
  const candidates = chess
    .moves({ square: from as ChessSquare, verbose: true })
    .filter((move) => move.to === to);
  return candidates.some((move) => Boolean(move.promotion));
}

export function applyMove(
  game: OtbGame,
  from: Square,
  to: Square,
  promotion?: PromotionPiece,
): MoveApplicationResult {
  try {
    const chess = toChess(game);
    const legalMoves = chess.moves({ square: from as ChessSquare, verbose: true });
    if (legalMoves.length === 0) {
      return {
        game,
        applied: false,
        promotionRequired: false,
        error: 'No legal moves from square',
      };
    }

    const candidates = legalMoves.filter((move) => move.to === to);
    if (candidates.length === 0) {
      return { game, applied: false, promotionRequired: false, error: 'Illegal move' };
    }

    const needsPromotion = candidates.some((move) => Boolean(move.promotion));
    if (needsPromotion && !promotion) {
      return { game, applied: false, promotionRequired: true };
    }

    if (
      promotion &&
      !candidates.some((move) => move.promotion === (promotion as PieceSymbol | undefined))
    ) {
      return { game, applied: false, promotionRequired: true, error: 'Invalid promotion piece' };
    }

    const appliedMove = chess.move({
      from: from as ChessSquare,
      to: to as ChessSquare,
      promotion: promotion as PieceSymbol | undefined,
    });
    if (!appliedMove) {
      return { game, applied: false, promotionRequired: false, error: 'Illegal move' };
    }

    const now = new Date().toISOString();
    const updatedGame: OtbGame = {
      ...game,
      moves: [
        ...game.moves,
        {
          from,
          to,
          promotion: appliedMove.promotion as PromotionPiece | undefined,
          san: appliedMove.san,
          fenAfter: chess.fen(),
          ply: game.moves.length + 1,
        },
      ],
      currentFen: chess.fen(),
      updatedAt: now,
      status: getStatus(chess),
    };

    return { game: updatedGame, applied: true, promotionRequired: false };
  } catch (error) {
    return {
      game,
      applied: false,
      promotionRequired: false,
      error: error instanceof Error ? error.message : 'Failed to apply move',
    };
  }
}

export function undoLastMove(game: OtbGame): OtbGame {
  if (game.moves.length === 0) {
    return game;
  }

  const nextMoves = game.moves.slice(0, -1);
  const chess = new Chess();
  for (const move of nextMoves) {
    chess.move({
      from: move.from as ChessSquare,
      to: move.to as ChessSquare,
      promotion: move.promotion as PieceSymbol | undefined,
    });
  }

  return {
    ...game,
    moves: nextMoves,
    currentFen: chess.fen(),
    updatedAt: new Date().toISOString(),
    status: getStatus(chess),
  };
}
