import { Chess, type Move } from 'chess.js';
import { nanoid } from 'nanoid';
import { START_FEN } from '@/lib/otb/constants';
import type { OpeningMoveNode, OpeningRepertoire, OpeningTrainerSide } from './types';

const ROOT_NODE_ID = 'root';
const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

export interface OpeningParseError {
  /** Human-readable summary with enough detail to locate and fix the move. */
  message: string;
  /** The offending token as it appeared in the PGN, when applicable. */
  token?: string;
  /** Full-move number of the offending move (1-based). */
  moveNumber?: number;
  /** Side to move when the error occurred. */
  color?: OpeningTrainerSide;
  /** Sequence of legal moves leading up to the error, for context. */
  line?: string;
}

export interface OpeningImportResult {
  repertoire: OpeningRepertoire;
  /** Lines that were skipped because of an illegal/unparseable move. */
  errors: OpeningParseError[];
}

interface ParseContext {
  tokens: string[];
  index: number;
  nodes: Record<string, OpeningMoveNode>;
  errors: OpeningParseError[];
  /** Comment bodies, referenced by sentinel tokens emitted during tokenization. */
  comments: string[];
}

// Sentinel prefix marking a captured `{...}` comment in the token stream. The
// control character cannot appear in a PGN move, so it never collides with real
// tokens, and (having no `.`) it survives the move-number/NAG strip regexes.
const COMMENT_SENTINEL = '\u0001';

interface LastMoveStart {
  chess: Chess;
  parentId: string;
}

function cloneChess(chess: Chess): Chess {
  return new Chess(chess.fen());
}

function parseHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerPattern = /^\s*\[([A-Za-z0-9_]+)\s+"((?:\\"|[^"])*)"\]\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = headerPattern.exec(pgn))) {
    headers[match[1]] = match[2].replace(/\\"/g, '"');
  }
  return headers;
}

interface TokenizeResult {
  tokens: string[];
  comments: string[];
}

function tokenizePgn(pgn: string): TokenizeResult {
  const comments: string[] = [];
  const withoutHeaders = pgn
    .replace(/^\s*\[[^\n]*\]\s*$/gm, ' ')
    // Capture `{...}` comments as sentinel tokens so they survive tokenization
    // and can be attached to the preceding move as its line label.
    .replace(/\{([^}]*)\}/g, (_match, body: string) => {
      const index = comments.push(body.trim()) - 1;
      return ` ${COMMENT_SENTINEL}${index} `;
    })
    .replace(/;[^\n\r]*/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(?:\.\.)?/g, ' ')
    .replace(/[()]/g, (value) => ` ${value} `);

  const tokens = withoutHeaders
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !RESULT_TOKENS.has(token));

  return { tokens, comments };
}

/** Decode a comment sentinel token to its body, or null if it isn't one. */
function commentFromToken(context: ParseContext, token: string): string | null {
  if (!token.startsWith(COMMENT_SENTINEL)) {
    return null;
  }
  const index = Number(token.slice(COMMENT_SENTINEL.length));
  return context.comments[index] ?? '';
}

function cleanSan(token: string): string {
  return token.replace(/[!?]+$/g, '');
}

function toUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

function addMoveNode(
  context: ParseContext,
  parentId: string,
  fenBefore: string,
  fenAfter: string,
  move: Move,
): string {
  const parent = context.nodes[parentId];
  const uci = toUci(move);
  const existingId = parent.children.find((childId) => context.nodes[childId]?.uci === uci);
  if (existingId) {
    return existingId;
  }

  const id = nanoid();
  context.nodes[id] = {
    id,
    parentId,
    fenBefore,
    fenAfter,
    san: move.san,
    uci,
    from: move.from as OpeningMoveNode['from'],
    to: move.to as OpeningMoveNode['to'],
    promotion: move.promotion as OpeningMoveNode['promotion'],
    ply: parent.ply + 1,
    children: [],
  };
  parent.children.push(id);
  return id;
}

function formatSanList(sans: string[]): string {
  let out = '';
  for (let index = 0; index < sans.length; index += 1) {
    if (index % 2 === 0) {
      out += `${index / 2 + 1}. `;
    }
    out += `${sans[index]} `;
  }
  return out.trim();
}

function movePathTo(nodes: Record<string, OpeningMoveNode>, nodeId: string): string {
  const sans: string[] = [];
  let current: OpeningMoveNode | undefined = nodes[nodeId];
  while (current && current.parentId) {
    sans.unshift(current.san);
    current = nodes[current.parentId];
  }
  return formatSanList(sans);
}

/**
 * Consume tokens until the current parenthesised variation is balanced, so that
 * parsing can resume with sibling variations or the remainder of the PGN after
 * an unrecoverable move. Assumes the opening '(' for this level (if any) was
 * already consumed by the caller.
 */
function skipRestOfVariation(context: ParseContext): void {
  let depth = 0;
  while (context.index < context.tokens.length) {
    const token = context.tokens[context.index++];
    if (token === '(') {
      depth += 1;
    } else if (token === ')') {
      if (depth === 0) {
        return;
      }
      depth -= 1;
    }
  }
}

function recordIllegalMove(context: ParseContext, parentId: string, token: string): void {
  const ply = context.nodes[parentId].ply + 1;
  const moveNumber = Math.ceil(ply / 2);
  const color: OpeningTrainerSide = ply % 2 === 1 ? 'white' : 'black';
  const moveLabel = `${moveNumber}${color === 'white' ? '.' : '...'} ${token}`;
  const line = movePathTo(context.nodes, parentId);
  const where = line ? ` after ${line}` : ' at the start of the game';
  context.errors.push({
    message: `Skipped a line — illegal move ${moveLabel}${where}.`,
    token,
    moveNumber,
    color,
    line: line || undefined,
  });
}

function parseLine(context: ParseContext, chess: Chess, parentId: string): void {
  let currentChess = cloneChess(chess);
  let currentParentId = parentId;
  let lastMoveStart: LastMoveStart | null = null;
  // Node id of the most recent move played at this level, so a following comment
  // can be attached to it as the line label.
  let lastMoveNodeId: string | null = null;

  while (context.index < context.tokens.length) {
    const token = context.tokens[context.index++];

    if (token === ')') {
      return;
    }

    const comment = commentFromToken(context, token);
    if (comment !== null) {
      // Label the move this comment follows. The first non-empty comment wins so
      // a sideline's name (placed right after its first move) is preserved.
      const node = lastMoveNodeId ? context.nodes[lastMoveNodeId] : undefined;
      if (node && comment && !node.label) {
        node.label = comment;
      }
      continue;
    }

    if (token === '(') {
      if (!lastMoveStart) {
        context.errors.push({
          message: 'Skipped a variation that appeared before any move was played.',
        });
        skipRestOfVariation(context);
        continue;
      }
      parseLine(context, cloneChess(lastMoveStart.chess), lastMoveStart.parentId);
      continue;
    }

    const san = cleanSan(token);
    const before = cloneChess(currentChess);
    let move: Move | null = null;
    try {
      move = currentChess.move(san);
    } catch {
      move = null;
    }
    if (!move) {
      // Recover: record the bad move, abandon the rest of this line (its later
      // positions are unknown), and let parsing continue with other branches.
      recordIllegalMove(context, currentParentId, token);
      skipRestOfVariation(context);
      return;
    }

    const previousParentId = currentParentId;
    currentParentId = addMoveNode(
      context,
      previousParentId,
      before.fen(),
      currentChess.fen(),
      move,
    );
    lastMoveStart = { chess: before, parentId: previousParentId };
    lastMoveNodeId = currentParentId;
  }
}

function defaultName(headers: Record<string, string>): string {
  return headers.Event && headers.Event !== '?' ? headers.Event : 'Imported repertoire';
}

export function parseOpeningRepertoirePgn(
  pgn: string,
  side: OpeningTrainerSide,
  name?: string,
): OpeningImportResult {
  const { tokens, comments } = tokenizePgn(pgn);
  if (tokens.length === 0) {
    throw new Error('PGN does not contain any moves');
  }

  const now = new Date().toISOString();
  const headers = parseHeaders(pgn);
  const root: OpeningMoveNode = {
    id: ROOT_NODE_ID,
    parentId: null,
    fenBefore: START_FEN,
    fenAfter: START_FEN,
    san: '',
    uci: '',
    from: 'a1',
    to: 'a1',
    ply: 0,
    children: [],
  };
  const context: ParseContext = {
    tokens,
    index: 0,
    nodes: { [ROOT_NODE_ID]: root },
    errors: [],
    comments,
  };

  parseLine(context, new Chess(), ROOT_NODE_ID);

  // The root node is always present; anything beyond it is a parsed move.
  if (Object.keys(context.nodes).length <= 1) {
    throw new Error(
      context.errors[0]?.message ?? 'PGN could not be parsed — no legal moves were found.',
    );
  }

  return {
    repertoire: {
      id: nanoid(),
      name: name?.trim() || defaultName(headers),
      side,
      createdAt: now,
      updatedAt: now,
      rootNodeId: ROOT_NODE_ID,
      nodes: context.nodes,
      stats: {},
    },
    errors: context.errors,
  };
}
