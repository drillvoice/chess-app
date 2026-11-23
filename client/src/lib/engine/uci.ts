import { Chess } from 'chess.js';
import { playUci } from '@/lib/focus/lichess-puzzles';

/** One principal variation reported by the engine. Scores are from White's point of view. */
export interface EngineLine {
  /** 1 = best line. */
  multipv: number;
  depth: number;
  /** Centipawns (White's view); null when the score is a mate. */
  cp: number | null;
  /** Moves to mate (positive: White mates; negative: Black mates); null when not a mate. */
  mate: number | null;
  /** Principal variation in UCI. */
  pv: string[];
}

/**
 * Parse a UCI `info` line into an EngineLine. Returns null for lines without a
 * score and PV (currmove updates, `info string`, bound-only partial lines).
 * UCI scores are from the side to move, so they are flipped to White's view.
 */
export function parseInfoLine(line: string, whiteToMove: boolean): EngineLine | null {
  if (!line.startsWith('info ')) return null;
  const tokens = line.trim().split(/\s+/);
  let depth: number | null = null;
  let multipv = 1;
  let cp: number | null = null;
  let mate: number | null = null;
  let bound = false;
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === 'depth') depth = Number(tokens[++i]);
    else if (token === 'multipv') multipv = Number(tokens[++i]);
    else if (token === 'score') {
      const kind = tokens[++i];
      const value = Number(tokens[++i]);
      if (kind === 'cp') cp = value;
      else if (kind === 'mate') mate = value;
      if (tokens[i + 1] === 'lowerbound' || tokens[i + 1] === 'upperbound') {
        bound = true;
        i++;
      }
    } else if (token === 'pv') {
      pv = tokens.slice(i + 1);
      break;
    } else if (token === 'string') {
      return null;
    }
  }

  if (bound || pv.length === 0 || depth === null || !Number.isFinite(depth)) return null;
  if (!Number.isFinite(multipv) || multipv < 1) return null;
  if (cp !== null && !Number.isFinite(cp)) cp = null;
  if (mate !== null && !Number.isFinite(mate)) mate = null;
  if (cp === null && mate === null) return null;

  const sign = whiteToMove ? 1 : -1;
  return {
    multipv,
    depth,
    cp: cp === null ? null : cp * sign,
    mate: mate === null ? null : mate * sign,
    pv,
  };
}

/** "+1.25", "−0.40", "#3", "#−2" — White's point of view, like Lichess. */
export function formatScore(line: Pick<EngineLine, 'cp' | 'mate'>): string {
  if (line.mate !== null) {
    return line.mate >= 0 ? `#${line.mate}` : `#−${Math.abs(line.mate)}`;
  }
  const pawns = (line.cp ?? 0) / 100;
  if (pawns === 0) return '0.0';
  return pawns > 0 ? `+${pawns.toFixed(1)}` : `−${Math.abs(pawns).toFixed(1)}`;
}

export interface SanMove {
  uci: string;
  san: string;
  /** Move number shown before it ("12." for White, "12…" for Black), or null mid-pair. */
  label: string | null;
}

/**
 * Convert a UCI line from `fen` into SAN with move-number labels. Stops at the
 * first illegal move (a stale PV from a previous position), so a race between
 * positions can never throw.
 */
export function uciLineToSan(fen: string, moves: string[], limit = moves.length): SanMove[] {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }
  const out: SanMove[] = [];
  for (const uci of moves.slice(0, limit)) {
    const white = chess.turn() === 'w';
    const number = chess.moveNumber();
    const san = playUci(chess, uci);
    if (!san) break;
    const label = white ? `${number}.` : out.length === 0 ? `${number}…` : null;
    out.push({ uci, san, label });
  }
  return out;
}
