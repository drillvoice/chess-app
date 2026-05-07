import { Chess, type Move } from 'chess.js';
import { nanoid } from 'nanoid';
import { START_FEN } from '@/lib/otb/constants';
import type { OpeningMoveNode, OpeningRepertoire, OpeningTrainerSide } from './types';

const ROOT_NODE_ID = 'root';
const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

interface ParseContext {
  tokens: string[];
  index: number;
  nodes: Record<string, OpeningMoveNode>;
}

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

function tokenizePgn(pgn: string): string[] {
  const withoutHeaders = pgn
    .replace(/^\s*\[[^\n]*\]\s*$/gm, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n\r]*/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(?:\.\.)?/g, ' ')
    .replace(/[()]/g, (value) => ` ${value} `);

  return withoutHeaders
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !RESULT_TOKENS.has(token));
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

function parseLine(context: ParseContext, chess: Chess, parentId: string): void {
  let currentChess = cloneChess(chess);
  let currentParentId = parentId;
  let lastMoveStart: LastMoveStart | null = null;

  while (context.index < context.tokens.length) {
    const token = context.tokens[context.index++];

    if (token === ')') {
      return;
    }

    if (token === '(') {
      if (!lastMoveStart) {
        throw new Error('PGN variation appears before a move');
      }
      parseLine(context, cloneChess(lastMoveStart.chess), lastMoveStart.parentId);
      continue;
    }

    const san = cleanSan(token);
    const before = cloneChess(currentChess);
    const beforeFen = before.fen();
    let move: Move | null = null;
    try {
      move = currentChess.move(san);
    } catch {
      move = null;
    }
    if (!move) {
      throw new Error(`Illegal PGN move "${token}" after ${beforeFen}`);
    }

    const previousParentId = currentParentId;
    currentParentId = addMoveNode(context, previousParentId, beforeFen, currentChess.fen(), move);
    lastMoveStart = { chess: before, parentId: previousParentId };
  }
}

function defaultName(headers: Record<string, string>): string {
  return headers.Event && headers.Event !== '?' ? headers.Event : 'Imported repertoire';
}

export function parseOpeningRepertoirePgn(
  pgn: string,
  side: OpeningTrainerSide,
  name?: string,
): OpeningRepertoire {
  const tokens = tokenizePgn(pgn);
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
  };

  try {
    parseLine(context, new Chess(), ROOT_NODE_ID);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Unable to parse PGN');
  }

  return {
    id: nanoid(),
    name: name?.trim() || defaultName(headers),
    side,
    createdAt: now,
    updatedAt: now,
    rootNodeId: ROOT_NODE_ID,
    nodes: context.nodes,
    stats: {},
  };
}
