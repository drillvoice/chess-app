export type OtbResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export type OtbGameStatus = 'active' | 'finished';

type FileChar = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
type RankChar = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
export type Square = `${FileChar}${RankChar}`;

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface OtbMove {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
  san: string;
  fenAfter: string;
  ply: number;
}

export interface OtbGame {
  id: string;
  createdAt: string;
  updatedAt: string;
  playedAt: string;
  whiteName: string;
  blackName: string;
  playerColor: 'white' | 'black' | null;
  result: OtbResult;
  moves: OtbMove[];
  currentFen: string;
  status: OtbGameStatus;
  linkedSessionId: number | null;
}
