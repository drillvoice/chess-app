import type { OtbGame, OtbResult } from './types';

export const DEFAULT_EVENT_NAME = 'OTB Game';
export const DEFAULT_SITE_NAME = 'Pawn Star Chess Log';
export const DEFAULT_ROUND = '-';

export const DEFAULT_WHITE_NAME = '';
export const DEFAULT_BLACK_NAME = '';
export const DEFAULT_PLAYER_COLOR: OtbGame['playerColor'] = null;
export const DEFAULT_RESULT: OtbResult = '*';

// Literal rather than `new Chess().fen()` so chess.js stays out of the startup bundle.
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
