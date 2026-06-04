import { Chess, type PieceSymbol, type Square as ChessSquare } from 'chess.js';
import type { PieceView } from '@/lib/otb/chess';
import type { PromotionPiece, Square } from '@/lib/otb/types';
import type {
  OpeningMoveNode,
  OpeningMoveStats,
  OpeningRepertoire,
  OpeningTrainerSide,
  OpeningTrainingState,
  RepertoireReviewSummary,
} from './types';
import { gradeMove, isMoveDue } from './scheduler';

export { isMoveDue } from './scheduler';


export interface TrainerMoveResult {
  state: OpeningTrainingState;
  applied: boolean;
  correct: boolean;
  promotionRequired: boolean;
  message?: string;
  // FEN immediately after the user's move, before the trainer plays its reply.
  // Lets the UI show the user's move briefly before animating the response.
  userMoveFen?: string;
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

// A node is a "user move" — i.e. one the trainee must recall and therefore an SRS
// card — when the side to move in the position before it is the trained side.
function isUserMove(repertoire: OpeningRepertoire, node: OpeningMoveNode | undefined): boolean {
  return Boolean(node) && getTurn(node!.fenBefore) === sideToTurn(repertoire.side);
}

// True if the subtree rooted at `nodeId` contains any due/new user-move card.
// `memo` is filled across siblings within a single selection so each subtree is
// walked once.
function subtreeHasDueUserMove(
  repertoire: OpeningRepertoire,
  nodeId: string,
  now: Date,
  memo: Map<string, boolean>,
): boolean {
  const cached = memo.get(nodeId);
  if (cached !== undefined) {
    return cached;
  }
  const node = repertoire.nodes[nodeId];
  if (!node) {
    memo.set(nodeId, false);
    return false;
  }
  let due = isUserMove(repertoire, node) && isMoveDue(repertoire.stats[nodeId], now);
  for (const childId of node.children) {
    // Traverse every child (no short-circuit) so the memo is fully populated.
    if (subtreeHasDueUserMove(repertoire, childId, now, memo)) {
      due = true;
    }
  }
  memo.set(nodeId, due);
  return due;
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

// A line is paused when its leaf node (the last id on a root-to-leaf path) carries
// the `disabled` flag. Identifying lines by leaf id is unambiguous because every
// node has exactly one parent.
export function isLineDisabled(repertoire: OpeningRepertoire, line: string[]): boolean {
  const leafId = line[line.length - 1];
  return leafId ? repertoire.stats[leafId]?.disabled === true : false;
}

// True if the subtree rooted at `nodeId` contains at least one active (not paused)
// leaf. A leaf is active unless its stats carry `disabled`. `memo` is filled across
// siblings within a single selection so each subtree is walked once.
function subtreeHasActiveLeaf(
  repertoire: OpeningRepertoire,
  nodeId: string,
  memo: Map<string, boolean>,
): boolean {
  const cached = memo.get(nodeId);
  if (cached !== undefined) {
    return cached;
  }
  const node = repertoire.nodes[nodeId];
  if (!node) {
    memo.set(nodeId, false);
    return false;
  }
  let active: boolean;
  if (node.children.length === 0) {
    active = repertoire.stats[nodeId]?.disabled !== true;
  } else {
    active = false;
    for (const childId of node.children) {
      // Traverse every child (no short-circuit) so the memo is fully populated.
      if (subtreeHasActiveLeaf(repertoire, childId, memo)) {
        active = true;
      }
    }
  }
  memo.set(nodeId, active);
  return active;
}

export function chooseWeightedMove(
  repertoire: OpeningRepertoire,
  moves: OpeningMoveNode[],
  rng: () => number = Math.random,
  now: Date = new Date(),
): OpeningMoveNode | null {
  // Never walk into a branch whose every leaf is paused; if all branches are
  // paused, return null so the drill ends gracefully.
  const activeMemo = new Map<string, boolean>();
  const candidates = moves.filter((move) => subtreeHasActiveLeaf(repertoire, move.id, activeMemo));
  if (candidates.length === 0) {
    return null;
  }
  moves = candidates;
  const baseWeights = moves.map((move) => moveWeight(repertoire, move.id, now));
  const memo = new Map<string, boolean>();
  const dueFlags = moves.map((move) => subtreeHasDueUserMove(repertoire, move.id, now, memo));
  // Hard-filter to due branches only when any exist; fall back to all branches
  // when nothing is due (so free-drill still works if the caller bypasses the UI gate).
  const anyDue = dueFlags.some(Boolean);
  const filteredMoves = anyDue ? moves.filter((_, i) => dueFlags[i]) : moves;
  const filteredWeights = anyDue ? baseWeights.filter((_, i) => dueFlags[i]) : baseWeights;
  if (filteredMoves.length === 0) {
    return null;
  }
  const total = filteredWeights.reduce((sum, weight) => sum + weight, 0);
  let cursor = rng() * total;
  for (let index = 0; index < filteredMoves.length; index += 1) {
    cursor -= filteredWeights[index];
    if (cursor <= 0) {
      return filteredMoves[index];
    }
  }
  return filteredMoves[filteredMoves.length - 1];
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
  srsPass?: boolean,
): OpeningRepertoire {
  const current = statFor(repertoire, moveId);
  const now = new Date();
  // Spread `current` first to preserve SRS fields on counter-only updates (the
  // wrong-move path records a miss but defers SRS scheduling to the eventual
  // correct play, graded as a lapse).
  let updated: OpeningMoveStats = {
    ...current,
    attempts: current.attempts + 1,
    misses: current.misses + (correct ? 0 : 1),
    streak: correct ? current.streak + 1 : 0,
    lastSeenAt: now.toISOString(),
  };
  if (srsPass !== undefined) {
    updated = gradeMove(updated, srsPass, now);
  }

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

  // A clean recall (no wrong attempts this drill) is an SRS pass; a correct move
  // played after a miss or reveal grades as a lapse so the line resurfaces soon.
  const repertoire = updateMoveStats(
    prepared.repertoire,
    matchingMove.id,
    true,
    prepared.incorrectAttempts === 0,
  );
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

  return {
    state: nextState,
    applied: true,
    correct: true,
    promotionRequired: false,
    userMoveFen: matchingMove.fenAfter,
  };
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

/**
 * Every root-to-leaf line as an array of move node ids (the placeholder root is
 * excluded). Used to report review progress at the line level.
 */
export function enumerateLines(repertoire: OpeningRepertoire): string[][] {
  const lines: string[][] = [];
  const walk = (nodeId: string, path: string[]) => {
    const node = repertoire.nodes[nodeId];
    if (!node) {
      return;
    }
    const nextPath = nodeId === repertoire.rootNodeId ? path : [...path, nodeId];
    if (node.children.length === 0) {
      if (nextPath.length > 0) {
        lines.push(nextPath);
      }
      return;
    }
    for (const childId of node.children) {
      walk(childId, nextPath);
    }
  };
  walk(repertoire.rootNodeId, []);
  return lines;
}

/**
 * Chessable-style review counts: how many lines are due (or new) vs learned, and
 * when the next not-yet-due line comes up. A line is due if any of its user-move
 * cards is due; new if none of its user moves has ever been scheduled.
 */
export function summarizeRepertoire(
  repertoire: OpeningRepertoire,
  now: Date = new Date(),
): RepertoireReviewSummary {
  let totalLines = 0;
  let dueLines = 0;
  let newLines = 0;
  let learnedLines = 0;
  let nextDueAt: string | undefined;
  // Unique user-move node IDs that are currently due. Using a Set avoids
  // counting shared nodes (e.g. an early move shared by many lines) multiple
  // times, which is what caused the displayed count to jump by large amounts
  // when a single shared node got scheduled.
  const dueMoveIds = new Set<string>();

  for (const line of enumerateLines(repertoire)) {
    if (isLineDisabled(repertoire, line)) {
      continue;
    }
    const userMoveIds = line.filter((id) => isUserMove(repertoire, repertoire.nodes[id]));
    if (userMoveIds.length === 0) {
      continue;
    }
    totalLines += 1;
    const stats = userMoveIds.map((id) => repertoire.stats[id]);
    const due = stats.some((stat) => isMoveDue(stat, now));
    if (due) {
      dueLines += 1;
      for (const id of userMoveIds) {
        if (isMoveDue(repertoire.stats[id], now)) {
          dueMoveIds.add(id);
        }
      }
      if (stats.every((stat) => !stat?.dueAt)) {
        newLines += 1;
      }
      continue;
    }
    learnedLines += 1;
    for (const stat of stats) {
      if (stat?.dueAt && (!nextDueAt || stat.dueAt < nextDueAt)) {
        nextDueAt = stat.dueAt;
      }
    }
  }

  return { totalLines, dueLines, dueMoves: dueMoveIds.size, newLines, learnedLines, nextDueAt };
}

/**
 * Pause or re-activate a single line, identified by its leaf node id. The flag
 * lives on the leaf's stats entry (created if absent) so it rides cloud sync with
 * the rest of `stats`. Returns a new repertoire; the input is never mutated.
 */
export function setLineDisabled(
  repertoire: OpeningRepertoire,
  leafId: string,
  disabled: boolean,
): OpeningRepertoire {
  const current = statFor(repertoire, leafId);
  return {
    ...repertoire,
    updatedAt: new Date().toISOString(),
    stats: {
      ...repertoire.stats,
      [leafId]: { ...current, disabled },
    },
  };
}

/**
 * Permanently remove the line ending at `leafId`. Walks from the leaf up toward
 * the root, pruning each node from its parent's children and dropping its
 * nodes/stats entries, and stops at the first ancestor that still has other
 * children (a branch point) so shared moves survive. Returns a new repertoire;
 * the input is never mutated.
 */
export function deleteLine(repertoire: OpeningRepertoire, leafId: string): OpeningRepertoire {
  const nodes: Record<string, OpeningMoveNode> = {};
  for (const [id, node] of Object.entries(repertoire.nodes)) {
    nodes[id] = { ...node, children: [...node.children] };
  }
  const stats = { ...repertoire.stats };

  let nodeId: string | null = leafId;
  while (nodeId && nodeId !== repertoire.rootNodeId && nodes[nodeId]) {
    const parentId: string | null = nodes[nodeId].parentId;
    const parent = parentId ? nodes[parentId] : undefined;
    delete nodes[nodeId];
    delete stats[nodeId];
    if (!parent) {
      break;
    }
    parent.children = parent.children.filter((id) => id !== nodeId);
    if (parent.children.length > 0) {
      break; // branch point: shared moves continue on other lines
    }
    nodeId = parentId;
  }

  return { ...repertoire, updatedAt: new Date().toISOString(), nodes, stats };
}

/**
 * Render a line as SAN with move numbers (e.g. "1.e4 e5 2.Nf3 Nc6 3.Bc4") for the
 * line-management list. `line` is the array of move node ids from `enumerateLines`.
 */
export function describeLine(repertoire: OpeningRepertoire, line: string[]): string {
  const parts: string[] = [];
  for (const id of line) {
    const node = repertoire.nodes[id];
    if (!node) {
      continue;
    }
    // ply 1 => move 1 white, ply 2 => move 1 black, etc.
    if (node.ply % 2 === 1) {
      parts.push(`${Math.ceil(node.ply / 2)}.${node.san}`);
    } else {
      parts.push(node.san);
    }
  }
  return parts.join(' ');
}

/**
 * The human-readable name for a line, taken from the deepest (most specific)
 * labelled move along it. Labels come from `{...}` comments in the imported PGN
 * (see the parser). Returns undefined when no move on the line is labelled.
 */
export function lineLabel(repertoire: OpeningRepertoire, line: string[]): string | undefined {
  for (let i = line.length - 1; i >= 0; i -= 1) {
    const label = repertoire.nodes[line[i]]?.label;
    if (label) {
      return label;
    }
  }
  return undefined;
}
