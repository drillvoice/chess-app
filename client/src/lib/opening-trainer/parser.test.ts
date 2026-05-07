import { describe, expect, it } from 'vitest';
import { parseOpeningRepertoirePgn } from './parser';

function childSans(
  repertoire: ReturnType<typeof parseOpeningRepertoirePgn>,
  nodeId: string,
): string[] {
  return repertoire.nodes[nodeId].children.map((id) => repertoire.nodes[id].san);
}

describe('opening repertoire PGN parser', () => {
  it('preserves a single game with nested variations', () => {
    const repertoire = parseOpeningRepertoirePgn(
      '[Event "Caro-Kann Advance"]\n\n1. e4 c6 (1... e5 2. Nf3) 2. d4 d5 (2... e6 3. Nc3) 3. e5',
      'white',
    );

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
    const repertoire = parseOpeningRepertoirePgn(
      '1. e4! {best by test} c5 $1 2. Nf3!? d6 *',
      'white',
    );

    const e4 = repertoire.nodes.root.children[0];
    const c5 = repertoire.nodes[e4].children[0];
    const nf3 = repertoire.nodes[c5].children[0];

    expect(repertoire.nodes[e4].san).toBe('e4');
    expect(repertoire.nodes[nf3].san).toBe('Nf3');
  });

  it('rejects illegal branch moves with useful context', () => {
    expect(() => parseOpeningRepertoirePgn('1. e4 e5 (1... e5 2. e5)', 'white')).toThrow(
      /Illegal PGN move "e5"/,
    );
  });

  it('keeps transposed paths independent when generating branches', () => {
    const repertoire = parseOpeningRepertoirePgn('1. Nf3 d5 2. d4 (2. c4 e6 3. d4) Nf6', 'white');

    const d5 = Object.values(repertoire.nodes).find((node) => node.san === 'd5');
    expect(d5).toBeTruthy();
    expect(d5 ? childSans(repertoire, d5.id) : []).toEqual(['d4', 'c4']);
  });
});
