import { describe, expect, it } from 'vitest';
import { CAMPAIGN, findNode, THEME_CEILING } from './chapters';
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
    const covered = new Set([...last.nodes.flatMap((n) => n.themes), ...last.retiredThemes]);
    const expected = FOCUS_THEMES.map((t) => t.key).filter((k) => k !== 'equality');
    expect(Array.from(covered).sort()).toEqual(expected.sort());
  });

  it('revisits earlier themes and ends each chapter with the phase nodes', () => {
    const [first, second] = CAMPAIGN;
    const firstThemes = first.nodes.filter((n) => n.kind === 'trial').map((n) => n.themes[0]);
    const secondThemes = second.nodes.map((n) => n.themes[0]);
    // Every Beginner theme comes back in chapter 2 unless it was retired there.
    expect([...secondThemes, ...second.retiredThemes]).toEqual(expect.arrayContaining(firstThemes));
    for (const chapter of CAMPAIGN) {
      expect(chapter.nodes.slice(-3).map((n) => n.themes[0])).toEqual([
        'opening',
        'middlegame',
        'endgame',
      ]);
      expect(chapter.boss.themes).not.toContain('opening');
    }
  });

  it('stops revisiting a theme after its ceiling chapter', () => {
    const chapterIds = CAMPAIGN.map((c) => c.id);
    const firstSeen = (theme: string) =>
      CAMPAIGN.findIndex((c) => c.nodes.some((n) => n.themes[0] === theme));
    for (const [theme, ceiling] of Object.entries(THEME_CEILING)) {
      const ceilingIndex = chapterIds.indexOf(ceiling!);
      expect(ceilingIndex).toBeGreaterThanOrEqual(0);
      // Introduced at or before its ceiling, or it would never be played at all.
      expect(firstSeen(theme)).toBeGreaterThanOrEqual(0);
      expect(firstSeen(theme)).toBeLessThanOrEqual(ceilingIndex);
      CAMPAIGN.forEach((chapter, i) => {
        const played = chapter.nodes.some((n) => n.themes[0] === theme);
        expect(played).toBe(i >= firstSeen(theme) && i <= ceilingIndex);
        expect(chapter.boss.themes.includes(theme)).toBe(played);
        expect(chapter.retiredThemes.includes(theme)).toBe(i > ceilingIndex);
      });
    }
  });

  it('finds nodes by id', () => {
    expect(findNode('beginner:fork')?.node.title).toBe('Fork');
    expect(findNode('beginner:boss')?.node.kind).toBe('boss');
    expect(findNode('nope:fork')).toBeNull();
  });
});
