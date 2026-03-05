import { Chess } from 'chess.js';
import type { OtbGame, OtbResult } from './types';

export const DEFAULT_EVENT_NAME = 'OTB Game';
export const DEFAULT_SITE_NAME = 'Pawn Star Chess Log';
export const DEFAULT_ROUND = '-';

export const DEFAULT_WHITE_NAME = '';
export const DEFAULT_BLACK_NAME = '';
export const DEFAULT_PLAYER_COLOR: OtbGame['playerColor'] = null;
export const DEFAULT_RESULT: OtbResult = '*';

export const START_FEN = new Chess().fen();
