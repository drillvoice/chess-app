import { nanoid } from 'nanoid';
import type { OpeningMoveNode, OpeningRepertoire } from './types';

export interface RepertoireMergeResult {
  /** A merged copy of `target` — inputs are never mutated. */
  repertoire: OpeningRepertoire;
  /** Brand-new move nodes grafted in from `incoming`. */
  addedMoves: number;
  /** Incoming move nodes whose path already existed in `target`. */
  matchedMoves: number;
}

/**
 * Merge the moves of `incoming` into `target`, keeping `target`'s identity
 * (id/name/side/createdAt) and all of its training stats.
 *
 * A move's identity within a repertoire is its path of `uci` moves from the
 * root, not its (random) node id — so we walk both trees in parallel and match
 * children by `uci`. Matched nodes are left untouched (their stats are
 * preserved); unmatched incoming subtrees are grafted under the corresponding
 * target node with fresh ids and no stats, so the scheduler treats them as new
 * cards. Lines only present in `target` are kept (additive merge).
 */
export function mergeRepertoire(
  target: OpeningRepertoire,
  incoming: OpeningRepertoire,
): RepertoireMergeResult {
  // Deep-clone so the function stays pure (callers hold these in React state).
  const nodes: Record<string, OpeningMoveNode> = {};
  for (const [id, node] of Object.entries(target.nodes)) {
    nodes[id] = { ...node, children: [...node.children] };
  }
  const stats = structuredClone(target.stats);

  let addedMoves = 0;
  let matchedMoves = 0;

  /** Graft an incoming subtree under `targetParentId`, returning the new node count. */
  const graftSubtree = (incomingId: string, targetParentId: string): void => {
    const source = incoming.nodes[incomingId];
    if (!source) {
      return;
    }
    const parent = nodes[targetParentId];
    const id = nanoid();
    nodes[id] = {
      id,
      parentId: targetParentId,
      fenBefore: source.fenBefore,
      fenAfter: source.fenAfter,
      san: source.san,
      uci: source.uci,
      from: source.from,
      to: source.to,
      promotion: source.promotion,
      ply: parent.ply + 1,
      children: [],
      label: source.label,
    };
    parent.children.push(id);
    addedMoves += 1;
    for (const childId of source.children) {
      graftSubtree(childId, id);
    }
  };

  /** Walk children of a matched pair, recursing on matches and grafting the rest. */
  const mergeChildren = (incomingId: string, targetId: string): void => {
    const incomingNode = incoming.nodes[incomingId];
    const targetNode = nodes[targetId];
    if (!incomingNode || !targetNode) {
      return;
    }
    for (const incomingChildId of incomingNode.children) {
      const incomingChild = incoming.nodes[incomingChildId];
      if (!incomingChild) {
        continue;
      }
      const matchId = targetNode.children.find(
        (childId) => nodes[childId]?.uci === incomingChild.uci,
      );
      if (matchId) {
        matchedMoves += 1;
        // Back-fill a line label from the incoming PGN onto the existing move so
        // re-importing a labelled PGN names lines that were imported unlabelled.
        if (incomingChild.label) {
          nodes[matchId].label = incomingChild.label;
        }
        mergeChildren(incomingChildId, matchId);
      } else {
        graftSubtree(incomingChildId, targetId);
      }
    }
  };

  mergeChildren(incoming.rootNodeId, target.rootNodeId);

  return {
    repertoire: {
      ...target,
      nodes,
      stats,
      updatedAt: new Date().toISOString(),
    },
    addedMoves,
    matchedMoves,
  };
}
