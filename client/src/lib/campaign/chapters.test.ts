import { describe, expect, it } from 'vitest';
import { CAMPAIGN, findNode } from './chapters';
import { FOCUS_THEMES, getLevel } from '../focus/themes';

describe('CAMPAIGN', () => {
  const allNodes = CAMPAIGN.flatMap((c) => [...c.nodes, c.boss]);

  it('has unique node ids', () => {
    const ids = allNodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only uses themes and fixed levels the Focus page knows', () => {
    const known = new Set(FOCUS_THEMES.map((t) => t.key));
    for (const node of allNodes) for (const theme of node.themes) expect(known).toContain(theme);
    for (const chapter of CAMPAIGN) {
      expect(getLevel(chapter.levelKey).key).toBe(chapter.levelKey);
      expect(getLevel(chapter.levelKey).relative).toBe(false);
    }
  });

  it('covers every theme except equality by the final chapter', () => {
    const last = CAMPAIGN[CAMPAIGN.length - 1];
    const covered = new Set(last.nodes.flatMap((n) => n.themes));
    const expected = FOCUS_THEMES.map((t) => t.key).filter((k) => k !== 'equality');
    expect(Array.from(covered).sort()).toEqual(expected.sort());
  });

  it('revisits earlier themes and ends each chapter with the phase nodes', () => {
    const [first, second] = CAMPAIGN;
    const firstThemes = first.nodes.filter((n) => n.kind === 'trial').map((n) => n.themes[0]);
    const secondThemes = second.nodes.map((n) => n.themes[0]);
    for (const theme of firstThemes) expect(secondThemes).toContain(theme);
    for (const chapter of CAMPAIGN) {
      expect(chapter.nodes.slice(-3).map((n) => n.themes[0])).toEqual([
        'opening',
        'middlegame',
        'endgame',
      ]);
      expect(chapter.boss.themes).not.toContain('opening');
    }
  });

  it('finds nodes by id', () => {
    expect(findNode('beginner:fork')?.node.title).toBe('Fork');
    expect(findNode('beginner:boss')?.node.kind).toBe('boss');
    expect(findNode('nope:fork')).toBeNull();
  });
});
