import { describe, expect, it } from 'vitest';
import { mergeRepertoire } from './merge';
import { parseOpeningRepertoirePgn } from './parser';
import type { OpeningMoveStats, OpeningRepertoire } from './types';

function parse(pgn: string): OpeningRepertoire {
  return parseOpeningRepertoirePgn(pgn, 'white').repertoire;
}

function nodeBySan(repertoire: OpeningRepertoire, parentId: string, san: string): string {
  const id = repertoire.nodes[parentId].children.find(
    (childId) => repertoire.nodes[childId].san === san,
  );
  if (!id) {
    throw new Error(`No child ${san} under ${parentId}`);
  }
  return id;
}

function childSans(repertoire: OpeningRepertoire, nodeId: string): string[] {
  return repertoire.nodes[nodeId].children.map((id) => repertoire.nodes[id].san).sort();
}

const trainedStats: OpeningMoveStats = {
  attempts: 4,
  misses: 1,
  streak: 3,
  lastSeenAt: '2026-05-01T00:00:00.000Z',
  easeFactor: 2.4,
  intervalDays: 6,
  repetitions: 3,
  dueAt: '2026-06-10T00:00:00.000Z',
};

describe('mergeRepertoire', () => {
  it('re-importing the same PGN adds nothing and preserves stats and structure', () => {
    const target = parse('1. e4 c6 2. d4 d5');
    const c6 = nodeBySan(target, nodeBySan(target, 'root', 'e4'), 'c6');
    target.stats[c6] = { ...trainedStats };
    const nodeCountBefore = Object.keys(target.nodes).length;

    const result = mergeRepertoire(target, parse('1. e4 c6 2. d4 d5'));

    expect(result.addedMoves).toBe(0);
    expect(result.matchedMoves).toBe(4);
    expect(Object.keys(result.repertoire.nodes)).toHaveLength(nodeCountBefore);
    expect(result.repertoire.stats[c6]).toEqual(trainedStats);
  });

  it('grafts new lines and deeper moves while keeping the trained line intact', () => {
    const target = parse('1. e4 c6 2. d4 d5');
    const e4 = nodeBySan(target, 'root', 'e4');
    const c6 = nodeBySan(target, e4, 'c6');
    target.stats[c6] = { ...trainedStats };

    // Adds a sibling reply (1...e5 with 2. Nf3) and extends the c6 line one move deeper (3. e5).
    const result = mergeRepertoire(target, parse('1. e4 c6 (1... e5 2. Nf3) 2. d4 d5 3. e5'));

    expect(result.matchedMoves).toBe(4); // e4, c6, d4, d5
    expect(result.addedMoves).toBe(3); // e5(reply), Nf3, e5(advance)

    const mergedE4 = nodeBySan(result.repertoire, 'root', 'e4');
    expect(childSans(result.repertoire, mergedE4)).toEqual(['c6', 'e5']);

    // Trained node keeps its id and stats; new nodes have no stats.
    expect(result.repertoire.stats[c6]).toEqual(trainedStats);
    expect(Object.keys(result.repertoire.stats)).toEqual([c6]);
  });

  it('grafts a divergent branch as a sibling without touching the trained sibling', () => {
    const target = parse('1. e4 e5 2. Nf3 Nc6');
    const e4 = nodeBySan(target, 'root', 'e4');
    const e5 = nodeBySan(target, e4, 'e5');
    const nf3 = nodeBySan(target, e5, 'Nf3');
    const nc6 = nodeBySan(target, nf3, 'Nc6');
    target.stats[nc6] = { ...trainedStats };

    const result = mergeRepertoire(target, parse('1. e4 e5 2. Nf3 Nf6'));

    expect(result.addedMoves).toBe(1); // Nf6
    const mergedNf3 = nodeBySan(
      result.repertoire,
      nodeBySan(result.repertoire, nodeBySan(result.repertoire, 'root', 'e4'), 'e5'),
      'Nf3',
    );
    expect(childSans(result.repertoire, mergedNf3)).toEqual(['Nc6', 'Nf6']);
    expect(result.repertoire.stats[nc6]).toEqual(trainedStats);
  });

  it('back-fills labels onto matched lines and carries labels onto grafted lines', () => {
    // Target was imported without comments, so its moves have no labels.
    const target = parse('1. e4 e5 2. Nf3 Nc6');
    const e4 = nodeBySan(target, 'root', 'e4');
    const e5 = nodeBySan(target, e4, 'e5');
    expect(target.nodes[e5].label).toBeUndefined();

    // Re-import the same lines plus a new sideline, this time with comments.
    const result = mergeRepertoire(
      target,
      parse('1. e4 e5 { Open Game } 2. Nf3 Nc6 (2... Nf6 { Petrov Defense } 3. Nxe5)'),
    );

    // Matched move gets the label back-filled from the incoming PGN.
    const mergedE4 = nodeBySan(result.repertoire, 'root', 'e4');
    const mergedE5 = nodeBySan(result.repertoire, mergedE4, 'e5');
    expect(result.repertoire.nodes[mergedE5].label).toBe('Open Game');

    // Grafted sideline keeps the label from the incoming PGN.
    const nf6 = Object.values(result.repertoire.nodes).find((node) => node.san === 'Nf6');
    expect(nf6?.label).toBe('Petrov Defense');
  });

  it('does not mutate the target repertoire', () => {
    const target = parse('1. e4 c6');
    const before = structuredClone(target);

    mergeRepertoire(target, parse('1. e4 c6 2. d4'));

    expect(target).toEqual(before);
  });
});
