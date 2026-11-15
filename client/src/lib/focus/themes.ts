/**
 * Lichess puzzle themes offered on the Focus page. `key` is the Lichess "angle"
 * accepted by /api/puzzle/batch/{angle}; see https://lichess.org/training/themes.
 */
export interface FocusTheme {
  key: string;
  label: string;
  group: 'Motifs' | 'Mates' | 'Phases' | 'Goals';
}

export const FOCUS_THEMES: FocusTheme[] = [
  { key: 'pin', label: 'Pin', group: 'Motifs' },
  { key: 'fork', label: 'Fork', group: 'Motifs' },
  { key: 'skewer', label: 'Skewer', group: 'Motifs' },
  { key: 'discoveredAttack', label: 'Discovered attack', group: 'Motifs' },
  { key: 'doubleCheck', label: 'Double check', group: 'Motifs' },
  { key: 'hangingPiece', label: 'Hanging piece', group: 'Motifs' },
  { key: 'trappedPiece', label: 'Trapped piece', group: 'Motifs' },
  { key: 'deflection', label: 'Deflection', group: 'Motifs' },
  { key: 'attraction', label: 'Attraction', group: 'Motifs' },
  { key: 'clearance', label: 'Clearance', group: 'Motifs' },
  { key: 'interference', label: 'Interference', group: 'Motifs' },
  { key: 'intermezzo', label: 'Intermezzo', group: 'Motifs' },
  { key: 'xRayAttack', label: 'X-ray attack', group: 'Motifs' },
  { key: 'zugzwang', label: 'Zugzwang', group: 'Motifs' },
  { key: 'quietMove', label: 'Quiet move', group: 'Motifs' },
  { key: 'sacrifice', label: 'Sacrifice', group: 'Motifs' },
  { key: 'capturingDefender', label: 'Capture the defender', group: 'Motifs' },
  { key: 'mateIn1', label: 'Mate in 1', group: 'Mates' },
  { key: 'mateIn2', label: 'Mate in 2', group: 'Mates' },
  { key: 'mateIn3', label: 'Mate in 3', group: 'Mates' },
  { key: 'backRankMate', label: 'Back-rank mate', group: 'Mates' },
  { key: 'smotheredMate', label: 'Smothered mate', group: 'Mates' },
  { key: 'kingsideAttack', label: 'Kingside attack', group: 'Mates' },
  { key: 'opening', label: 'Opening', group: 'Phases' },
  { key: 'middlegame', label: 'Middlegame', group: 'Phases' },
  { key: 'endgame', label: 'Endgame', group: 'Phases' },
  { key: 'rookEndgame', label: 'Rook endgame', group: 'Phases' },
  { key: 'pawnEndgame', label: 'Pawn endgame', group: 'Phases' },
  { key: 'advancedPawn', label: 'Advanced pawn', group: 'Goals' },
  { key: 'promotion', label: 'Promotion', group: 'Goals' },
  { key: 'defensiveMove', label: 'Defensive move', group: 'Goals' },
  { key: 'equality', label: 'Equality', group: 'Goals' },
];

export type FocusDifficulty = 'easiest' | 'easier' | 'normal' | 'harder' | 'hardest';

/**
 * Lichess pitches `difficulty` relative to the requester's puzzle rating (1500
 * when anonymous). "Fixed" levels are fetched anonymously so they land on an
 * absolute rating band whatever the user's own rating; the ranges below were
 * measured against the live API (Nov 2026). "Relative" levels are fetched with
 * the user's token and track their Lichess puzzle rating.
 */
export interface FocusLevel {
  key: string;
  label: string;
  difficulty: FocusDifficulty;
  relative: boolean;
}

export const FOCUS_LEVELS: FocusLevel[] = [
  { key: 'fixed-easiest', label: 'Beginner (~1000)', difficulty: 'easiest', relative: false },
  { key: 'fixed-easier', label: 'Easy (~1100)', difficulty: 'easier', relative: false },
  { key: 'fixed-normal', label: 'Intermediate (~1400)', difficulty: 'normal', relative: false },
  { key: 'fixed-harder', label: 'Advanced (~1800)', difficulty: 'harder', relative: false },
  { key: 'fixed-hardest', label: 'Expert (~2050)', difficulty: 'hardest', relative: false },
  { key: 'relative-easiest', label: 'My rating − 600', difficulty: 'easiest', relative: true },
  { key: 'relative-easier', label: 'My rating − 300', difficulty: 'easier', relative: true },
  { key: 'relative-normal', label: 'My rating', difficulty: 'normal', relative: true },
  { key: 'relative-harder', label: 'My rating + 300', difficulty: 'harder', relative: true },
  { key: 'relative-hardest', label: 'My rating + 600', difficulty: 'hardest', relative: true },
];

export const DEFAULT_LEVEL_KEY = 'fixed-normal';

export function getLevel(key: string | null | undefined): FocusLevel {
  return (
    FOCUS_LEVELS.find((level) => level.key === key) ??
    FOCUS_LEVELS.find((level) => level.key === DEFAULT_LEVEL_KEY)!
  );
}

export function getThemeLabel(key: string): string {
  return FOCUS_THEMES.find((theme) => theme.key === key)?.label ?? key;
}
