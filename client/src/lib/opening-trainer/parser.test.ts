import { describe, expect, it } from 'vitest';
import { parseOpeningRepertoirePgn } from './parser';
import type { OpeningRepertoire } from './types';

function childSans(repertoire: OpeningRepertoire, nodeId: string): string[] {
  return repertoire.nodes[nodeId].children.map((id) => repertoire.nodes[id].san);
}

describe('opening repertoire PGN parser', () => {
  it('preserves a single game with nested variations', () => {
    const { repertoire, errors } = parseOpeningRepertoirePgn(
      '[Event "Caro-Kann Advance"]\n\n1. e4 c6 (1... e5 2. Nf3) 2. d4 d5 (2... e6 3. Nc3) 3. e5',
      'white',
    );

    expect(errors).toHaveLength(0);
    expect(repertoire.name).toBe('Caro-Kann Advance');
    expect(childSans(repertoire, 'root')).toEqual(['e4']);

    const e4 = repertoire.nodes.root.children[0];
    expect(childSans(repertoire, e4)).toEqual(['c6', 'e5']);

    const d4 = repertoire.nodes[e4].children
      .map((id) => repertoire.nodes[id])
      .find((node) => node.san === 'c6')?.children[0];
    expect(d4 ? childSans(repertoire, d4) : []).toEqual(['d5', 'e6']);
  });

  it('ignores comments, NAGs, and annotation suffixes', () => {
    const { repertoire } = parseOpeningRepertoirePgn(
      '1. e4! {best by test} c5 $1 2. Nf3!? d6 *',
      'white',
    );

    const e4 = repertoire.nodes.root.children[0];
    const c5 = repertoire.nodes[e4].children[0];
    const nf3 = repertoire.nodes[c5].children[0];

    expect(repertoire.nodes[e4].san).toBe('e4');
    expect(repertoire.nodes[nf3].san).toBe('Nf3');
  });

  it('skips an illegal variation but keeps the rest of the repertoire', () => {
    const { repertoire, errors } = parseOpeningRepertoirePgn(
      '1. e4 e5 (1... c5 2. Qq9) 2. Nf3 Nc6',
      'white',
    );

    // The mainline survives in full.
    const e4 = repertoire.nodes.root.children[0];
    expect(childSans(repertoire, e4)).toEqual(['e5', 'c5']);
    const e5 = repertoire.nodes[e4].children[0];
    expect(childSans(repertoire, e5)).toEqual(['Nf3']);

    // The bad variation contributes its legal prefix (c5) then is abandoned.
    const c5 = repertoire.nodes[e4].children[1];
    expect(childSans(repertoire, c5)).toEqual([]);

    expect(errors).toHaveLength(1);
    expect(errors[0].token).toBe('Qq9');
    expect(errors[0].moveNumber).toBe(2);
    expect(errors[0].color).toBe('white');
    expect(errors[0].message).toContain('illegal move 2. Qq9');
  });

  it('recovers the mainline when an illegal move interrupts it', () => {
    const { repertoire, errors } = parseOpeningRepertoirePgn('1. e4 e5 2. Bz4 Nf6', 'white');

    const e4 = repertoire.nodes.root.children[0];
    const e5 = repertoire.nodes[e4].children[0];
    // Parsing stops at the illegal move; nothing after it is added.
    expect(childSans(repertoire, e5)).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].token).toBe('Bz4');
    expect(errors[0].line).toBe('1. e4 e5');
  });

  it('throws only when no legal moves can be parsed at all', () => {
    expect(() => parseOpeningRepertoirePgn('1. z9 q8', 'white')).toThrow(/illegal move/i);
  });

  it('keeps transposed paths independent when generating branches', () => {
    const { repertoire } = parseOpeningRepertoirePgn(
      '1. Nf3 d5 2. d4 (2. c4 e6 3. d4) Nf6',
      'white',
    );

    const d5 = Object.values(repertoire.nodes).find((node) => node.san === 'd5');
    expect(d5).toBeTruthy();
    expect(d5 ? childSans(repertoire, d5.id) : []).toEqual(['d4', 'c4']);
  });
});
