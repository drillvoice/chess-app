import { Chess, type PieceSymbol, type Square as ChessSquare } from 'chess.js';
import { DEFAULT_EVENT_NAME, DEFAULT_ROUND, DEFAULT_SITE_NAME } from './constants';
import type { OtbGame } from './types';

function formatPgnDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(
      now.getDate(),
    ).padStart(2, '0')}`;
  }

  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function sanitizeFileValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildPgn(game: OtbGame): string {
  const chess = new Chess();
  for (const move of game.moves) {
    const applied = chess.move({
      from: move.from as ChessSquare,
      to: move.to as ChessSquare,
      promotion: move.promotion as PieceSymbol | undefined,
    });
    if (!applied) {
      throw new Error(`Invalid move sequence at ply ${move.ply}`);
    }
  }

  chess.header('Event', DEFAULT_EVENT_NAME);
  chess.header('Site', DEFAULT_SITE_NAME);
  chess.header('Date', formatPgnDate(game.playedAt));
  chess.header('Round', DEFAULT_ROUND);
  chess.header('White', game.whiteName.trim() || 'White');
  chess.header('Black', game.blackName.trim() || 'Black');
  chess.header('Result', game.result);

  return chess.pgn({ maxWidth: 80, newline: '\n' });
}

export function getPgnFilename(game: OtbGame): string {
  const white = sanitizeFileValue(game.whiteName) || 'white';
  const black = sanitizeFileValue(game.blackName) || 'black';
  const date = formatPgnDate(game.playedAt).replace(/\./g, '-');
  return `otb-${white}-vs-${black}-${date}.pgn`;
}
