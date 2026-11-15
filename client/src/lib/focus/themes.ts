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

export const FOCUS_DIFFICULTIES = [
  { key: 'easiest', label: 'Easiest' },
  { key: 'easier', label: 'Easier' },
  { key: 'normal', label: 'Normal' },
  { key: 'harder', label: 'Harder' },
  { key: 'hardest', label: 'Hardest' },
] as const;

export type FocusDifficulty = (typeof FOCUS_DIFFICULTIES)[number]['key'];

export function getThemeLabel(key: string): string {
  return FOCUS_THEMES.find((theme) => theme.key === key)?.label ?? key;
}
