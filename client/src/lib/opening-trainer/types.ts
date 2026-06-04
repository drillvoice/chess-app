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
  // Human-readable line name from the PGN comment that follows this move (e.g. a
  // `{ ... }` annotation after the first move of a sideline). Absent when none.
  label?: string;
}

export interface OpeningMoveStats {
  attempts: number;
  misses: number;
  streak: number;
  lastSeenAt?: string;
  // SRS scheduling (all optional for backward compat with pre-SRS repertoires,
  // which are then treated as new / due).
  easeFactor?: number; // default 2.5
  intervalDays?: number; // current interval in days
  repetitions?: number; // consecutive successful SRS reviews
  dueAt?: string; // ISO; absent => new / never scheduled
  disabled?: boolean; // line-level pause flag, set on the line's LEAF node; absent => active
}

export interface RepertoireReviewSummary {
  totalLines: number;
  dueLines: number; // due now or new (line count; used for engine gating)
  dueMoves: number; // unique due user-move nodes — stable counter for display
  newLines: number; // never reviewed
  learnedLines: number;
  nextDueAt?: string; // earliest future due across non-due lines
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
  currentLineMoveIds: string[];
  lastCompletedLineMoveIds: string[];
}
