import { describe, expect, it, vi } from 'vitest';
import { fetchTrialPuzzles } from './trial-puzzles';
import { CAMPAIGN } from './chapters';
import { MATE_IN_2_RAW } from '../focus/test-fixtures';

function puzzleWithId(id: string) {
  const raw = structuredClone(MATE_IN_2_RAW);
  raw.puzzle.id = id;
  return raw;
}

function fakeFetch(handler: (url: URL) => { status?: number; ids?: string[] }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const { status = 200, ids = [] } = handler(url);
    return new Response(JSON.stringify({ puzzles: ids.map(puzzleWithId) }), { status });
  }) as unknown as typeof fetch;
}

describe('fetchTrialPuzzles', () => {
  it('fetches one theme anonymously for a regular node and skips excluded ids', async () => {
    const fetchImpl = fakeFetch(() => ({ ids: ['p1', 'p2', 'p3'] }));
    const node = CAMPAIGN[0].nodes[0];
    const puzzles = await fetchTrialPuzzles(node, 'easiest', 3, {
      exclude: new Set(['p2']),
      fetchImpl,
    });
    expect(puzzles.map((p) => p.id)).toEqual(['p1', 'p3']);
    const url = new URL(String((fetchImpl as any).mock.calls[0][0]));
    expect(url.pathname).toBe(`/api/puzzle/batch/${node.themes[0]}`);
    expect(url.searchParams.get('difficulty')).toBe('easiest');
    const init = (fetchImpl as any).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('mixes several themes for a boss and tolerates one failing batch', async () => {
    let call = 0;
    const fetchImpl = fakeFetch((url) => {
      call += 1;
      if (call === 1) return { status: 500 };
      const theme = url.pathname.split('/').pop();
      return { ids: [`${theme}-1`, `${theme}-2`] };
    });
    const boss = CAMPAIGN[0].boss;
    const puzzles = await fetchTrialPuzzles(boss, 'easiest', 24, { exclude: new Set(), fetchImpl });
    expect((fetchImpl as any).mock.calls).toHaveLength(4);
    const themes = new Set(puzzles.map((p) => p.id.split('-')[0]));
    expect(themes.size).toBe(3);
    for (const theme of Array.from(themes)) expect(boss.themes).toContain(theme);
  });

  it('throws when every batch fails', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 429 }));
    await expect(
      fetchTrialPuzzles(CAMPAIGN[0].nodes[0], 'easiest', 5, { exclude: new Set(), fetchImpl }),
    ).rejects.toThrow(/429/);
  });
});
