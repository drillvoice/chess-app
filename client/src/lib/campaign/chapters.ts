import { getLevel, getThemeLabel } from '../focus/themes';

/**
 * The campaign: five chapters, one per fixed Lichess rating band. Each chapter
 * revisits every theme introduced so far at its new band, introduces a few new
 * ones, finishes with the broad phase themes (Opening / Middlegame / Endgame)
 * as a stepping stone, and ends with a mixed-theme boss.
 *
 * `title`, `intro` and the boss's `name` / `intro` are plain descriptions for
 * now; they are the hooks a story can be written into later without touching
 * node ids (which progress is keyed on, so they must never change).
 */

export type NodeKind = 'trial' | 'phase' | 'boss';

export interface CampaignNode {
  /** Stable id, `${chapterId}:${theme}` or `${chapterId}:boss`. Progress is keyed on it. */
  id: string;
  chapterId: string;
  kind: NodeKind;
  /** Lichess themes the puzzles are drawn from (several for a boss). */
  themes: string[];
  title: string;
}

export interface CampaignChapter {
  id: string;
  number: number;
  title: string;
  intro: string;
  /** A fixed level key from FOCUS_LEVELS; campaign trials never use relative levels. */
  levelKey: string;
  /** Regular and phase nodes in unlock order; the boss is separate. */
  nodes: CampaignNode[];
  /**
   * Earlier themes that are *not* revisited here because Lichess has too few
   * puzzles for them at this band (see THEME_GAPS). They may return in a later
   * chapter if Lichess has enough there.
   */
  skippedThemes: string[];
  boss: CampaignNode & { name: string; intro: string };
}

interface ChapterSpec {
  id: string;
  title: string;
  intro: string;
  levelKey: string;
  /** Themes first met in this chapter, in the order they unlock. */
  newThemes: string[];
  bossName: string;
  bossIntro: string;
}

/**
 * Chapters (by id) whose rating band Lichess can't genuinely serve for a theme.
 * Lichess falls back to neighbouring difficulty buckets when a theme runs thin,
 * so asking for e.g. back-rank mates at "harder" quietly returns ~1600 puzzles
 * under an "Advanced (~1800)" label. A theme is not revisited (nor mixed into
 * the boss) in a chapter listed here. Gaps needn't be contiguous: a theme can
 * be thin at one band and plentiful at the next, and then it simply skips one.
 *
 * Measured against the live API (Nov 2026) with anonymous 50-puzzle batches: a
 * band counts as served when the median rating is within ~125 of the band's
 * label (Easy 975, Intermediate 1275, Advanced 1675, Expert 1925), averaged
 * over several batches for borderline themes. Re-measure before changing; a
 * skipped node simply stops appearing, so old attempts on it are harmless.
 */
export const THEME_GAPS: Partial<Record<string, string[]>> = {
  // FILLED_BY_PROBE
};

/** Broad themes played just before each boss. */
const PHASE_THEMES = ['opening', 'middlegame', 'endgame'];

const SPECS: ChapterSpec[] = [
  {
    id: 'beginner',
    title: 'Beginner',
    intro: 'The building blocks: loose pieces, simple mates and the classic double attacks.',
    levelKey: 'fixed-easiest',
    newThemes: [
      'hangingPiece',
      'mateIn1',
      'fork',
      'pin',
      'backRankMate',
      'skewer',
      'discoveredAttack',
      'promotion',
      'mateIn2',
    ],
    bossName: 'Beginner boss',
    bossIntro: 'A mix of every Beginner theme. You won’t be told which one each puzzle is.',
  },
  {
    id: 'easy',
    title: 'Easy',
    intro: 'Everything from Beginner a step harder, plus trapped pieces and removing defenders.',
    levelKey: 'fixed-easier',
    newThemes: [
      'trappedPiece',
      'capturingDefender',
      'doubleCheck',
      'advancedPawn',
      'smotheredMate',
      'pawnEndgame',
    ],
    bossName: 'Easy boss',
    bossIntro: 'A mix of every theme so far, at the Easy band.',
  },
  {
    id: 'intermediate',
    title: 'Intermediate',
    intro: 'Forcing pieces where you want them, sacrifices and longer mating attacks.',
    levelKey: 'fixed-normal',
    newThemes: [
      'deflection',
      'attraction',
      'sacrifice',
      'kingsideAttack',
      'mateIn3',
      'rookEndgame',
    ],
    bossName: 'Intermediate boss',
    bossIntro: 'A mix of every theme so far, at the Intermediate band.',
  },
  {
    id: 'advanced',
    title: 'Advanced',
    intro: 'Line-clearing and line-blocking ideas, x-rays, and finding the defence.',
    levelKey: 'fixed-harder',
    newThemes: ['clearance', 'interference', 'xRayAttack', 'defensiveMove'],
    bossName: 'Advanced boss',
    bossIntro: 'A mix of every theme so far, at the Advanced band.',
  },
  {
    id: 'expert',
    title: 'Expert',
    intro: 'The subtle ones: in-between moves, quiet moves and zugzwang.',
    levelKey: 'fixed-hardest',
    newThemes: ['intermezzo', 'quietMove', 'zugzwang'],
    bossName: 'Expert boss',
    bossIntro: 'A mix of every theme in the campaign, at the Expert band.',
  },
];

function buildChapters(): CampaignChapter[] {
  const seen: string[] = [];
  return SPECS.map((spec, i) => {
    const served = (theme: string) => !THEME_GAPS[theme]?.includes(spec.id);
    const revisits = seen.filter(served);
    const skippedThemes = seen.filter((theme) => !served(theme));
    seen.push(...spec.newThemes);
    // Revisits first as a warm-up at the new band, then the new themes, then phases.
    const ordered = [...revisits, ...spec.newThemes];
    const node = (theme: string, kind: NodeKind): CampaignNode => ({
      id: `${spec.id}:${theme}`,
      chapterId: spec.id,
      kind,
      themes: [theme],
      title: getThemeLabel(theme),
    });
    return {
      id: spec.id,
      number: i + 1,
      title: spec.title,
      intro: spec.intro,
      levelKey: spec.levelKey,
      nodes: [
        ...ordered.map((theme) => node(theme, 'trial')),
        ...PHASE_THEMES.map((theme) => node(theme, 'phase')),
      ],
      skippedThemes,
      boss: {
        id: `${spec.id}:boss`,
        chapterId: spec.id,
        kind: 'boss',
        // The boss mixes the chapter's motif and mate themes; phases are too broad to add much.
        themes: [...ordered],
        title: spec.bossName,
        name: spec.bossName,
        intro: spec.bossIntro,
      },
    };
  });
}

export const CAMPAIGN: CampaignChapter[] = buildChapters();

export function chapterLevel(chapter: CampaignChapter) {
  return getLevel(chapter.levelKey);
}

export function findNode(nodeId: string): { chapter: CampaignChapter; node: CampaignNode } | null {
  for (const chapter of CAMPAIGN) {
    if (chapter.boss.id === nodeId) return { chapter, node: chapter.boss };
    const node = chapter.nodes.find((n) => n.id === nodeId);
    if (node) return { chapter, node };
  }
  return null;
}
