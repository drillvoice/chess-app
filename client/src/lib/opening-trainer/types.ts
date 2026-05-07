import type { PromotionPiece, Square } from '@/lib/otb/types';

export type OpeningTrainerSide = 'white' | 'black';

export interface OpeningMoveNode {
  id: string;
  parentId: string | null;
  fenBefore: string;
  fenAfter: string;
  san: string;
  uci: string;
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
  ply: number;
  children: string[];
}

export interface OpeningMoveStats {
  attempts: number;
  misses: number;
  streak: number;
  lastSeenAt?: string;
}

export interface OpeningRepertoire {
  id: string;
  name: string;
  side: OpeningTrainerSide;
  createdAt: string;
  updatedAt: string;
  rootNodeId: string;
  nodes: Record<string, OpeningMoveNode>;
  stats: Record<string, OpeningMoveStats>;
}

export interface OpeningTrainingState {
  repertoire: OpeningRepertoire;
  currentNodeId: string;
  currentFen: string;
  expectedMoveId: string | null;
  incorrectAttempts: number;
  feedback: 'idle' | 'incorrect' | 'revealed' | 'complete';
}
