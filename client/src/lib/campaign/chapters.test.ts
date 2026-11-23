import { describe, expect, it } from 'vitest';
import { CAMPAIGN, findNode, THEME_GAPS } from './chapters';
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
    const covered = new Set([...last.nodes.flatMap((n) => n.themes), ...last.skippedThemes]);
    const expected = FOCUS_THEMES.map((t) => t.key).filter((k) => k !== 'equality');
    expect(Array.from(covered).sort()).toEqual(expected.sort());
  });

  it('revisits earlier themes and ends each chapter with the phase nodes', () => {
    const [first, second] = CAMPAIGN;
    const firstThemes = first.nodes.filter((n) => n.kind === 'trial').map((n) => n.themes[0]);
    const secondThemes = second.nodes.map((n) => n.themes[0]);
    // Every Beginner theme comes back in chapter 2 unless it was skipped there.
    expect([...secondThemes, ...second.skippedThemes]).toEqual(expect.arrayContaining(firstThemes));
    for (const chapter of CAMPAIGN) {
      expect(chapter.nodes.slice(-3).map((n) => n.themes[0])).toEqual([
        'opening',
        'middlegame',
        'endgame',
      ]);
      expect(chapter.boss.themes).not.toContain('opening');
    }
  });

  it('skips a theme only at the bands Lichess can’t serve', () => {
    const chapterIds = CAMPAIGN.map((c) => c.id);
    for (const [theme, gaps] of Object.entries(THEME_GAPS)) {
      for (const id of gaps!) expect(chapterIds).toContain(id);
      const firstSeen = CAMPAIGN.findIndex((c) => c.nodes.some((n) => n.themes[0] === theme));
      // A gap at the chapter that introduces a theme would hide it there entirely.
      expect(firstSeen).toBeGreaterThanOrEqual(0);
      expect(gaps).not.toContain(chapterIds[firstSeen]);
      CAMPAIGN.forEach((chapter, i) => {
        const played = chapter.nodes.some((n) => n.themes[0] === theme);
        const gap = gaps!.includes(chapter.id);
        expect(played).toBe(i >= firstSeen && !gap);
        expect(chapter.boss.themes.includes(theme)).toBe(played);
        expect(chapter.skippedThemes.includes(theme)).toBe(i > firstSeen && gap);
      });
    }
  });

  it('finds nodes by id', () => {
    expect(findNode('beginner:fork')?.node.title).toBe('Fork');
    expect(findNode('beginner:boss')?.node.kind).toBe('boss');
    expect(findNode('nope:fork')).toBeNull();
  });
});
