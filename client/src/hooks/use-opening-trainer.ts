import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyTrainerMove,
  expectedMoveSan,
  findInvalidNodeFens,
  getPieceMapFromFen,
  resyncTrainingState,
  startOpeningTraining,
  summarizeRepertoire,
} from '@/lib/opening-trainer/engine';
import type { OpeningRepertoire, OpeningTrainingState } from '@/lib/opening-trainer/types';
import type { PieceView } from '@/lib/otb/chess';
import type { PromotionPiece, Square } from '@/lib/otb/types';

// Small pause between the user's move and the trainer's reply so the change on
// the board is easy to follow.
const TRAINER_REPLY_DELAY_MS = 300;

export type BoardMessageTone = 'positive' | 'negative' | 'info';

export interface BoardMessage {
  text: string;
  tone: BoardMessageTone;
}

interface UseOpeningTrainerOptions {
  persistRepertoire: (repertoire: OpeningRepertoire) => Promise<OpeningRepertoire>;
}

export interface UseOpeningTrainerResult {
  trainingState: OpeningTrainingState | null;
  boardMessage: BoardMessage | null;
  previewFen: string | null;
  /** Re-entrancy guard — read by useBoardSelection to block concurrent moves. */
  applyingMoveRef: React.MutableRefObject<boolean>;
  pieceMap: Record<string, PieceView>;
  statusText: string;
  isLineComplete: boolean;
  isNothingDue: boolean;
  remainingDueMoves: number;
  /** Cancel any pending reply-preview timer and clear the preview FEN. */
  cancelPreview: () => void;
  /**
   * Start a new training drill. Does NOT reset board selection — callers are
   * responsible for calling clearSelection() on useBoardSelection before or
   * after to keep the ref + state in sync.
   */
  startTraining: (repertoire: OpeningRepertoire, avoidLine?: string[]) => void;
  /**
   * Apply a move against the current training state. Accepts a clearSelection
   * callback so the board layer can deselect without a circular dep between hooks.
   */
  applyMove: (
    from: Square,
    to: Square,
    promotion: PromotionPiece | undefined,
    clearSelection: () => void,
  ) => void;
  /** Resync to a clean state object at the same position, without touching SRS stats. */
  resync: () => void;
  /** Set feedback to 'revealed' to show the expected move. */
  reveal: () => void;
  /** Clear all training state (e.g. after deleting the active repertoire). */
  clearTraining: () => void;
}

export function useOpeningTrainer({
  persistRepertoire,
}: UseOpeningTrainerOptions): UseOpeningTrainerResult {
  const [trainingState, setTrainingState] = useState<OpeningTrainingState | null>(null);
  const [boardMessage, setBoardMessage] = useState<BoardMessage | null>(null);
  const [previewFen, setPreviewFen] = useState<string | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Synchronous re-entrancy guard: prevents a second tap from running applyMove
  // while a first is still in progress within the same tick.
  const applyingMoveRef = useRef(false);

  const cancelPreview = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setPreviewFen(null);
  }, []);

  // Show `fen` briefly (TRAINER_REPLY_DELAY_MS), then fall back to canonical
  // trainingState. Any new move supersedes it via cancelPreview.
  const startPreview = useCallback((fen: string) => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
    }
    setPreviewFen(fen);
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      setPreviewFen(null);
    }, TRAINER_REPLY_DELAY_MS);
  }, []);

  // Cancel any pending preview timer when the component unmounts.
  useEffect(() => () => cancelPreview(), [cancelPreview]);

  const startTraining = useCallback(
    (repertoire: OpeningRepertoire, avoidLine: string[] = []) => {
      // Surface any nodes with unparseable FENs so a bad import is obvious.
      const badNodes = findInvalidNodeFens(repertoire);
      if (badNodes.length > 0) {
        console.warn(
          `[openings] "${repertoire.name}" has ${badNodes.length} node(s) with invalid FENs — re-import recommended`,
          badNodes,
        );
      }
      applyingMoveRef.current = false;
      setTrainingState(startOpeningTraining(repertoire, avoidLine));
      setBoardMessage(null);
      cancelPreview();
      // Board flip and selection reset are the caller's responsibility so that
      // startTraining doesn't need to import board-selection concerns.
    },
    [cancelPreview],
  );

  const applyMove = useCallback(
    (
      from: Square,
      to: Square,
      promotion: PromotionPiece | undefined,
      clearSelection: () => void,
    ) => {
      if (!trainingState || applyingMoveRef.current) return;
      applyingMoveRef.current = true;

      // A new move supersedes any reply preview still on screen.
      cancelPreview();

      // persistTarget is set once a move is applied. Read in finally so the ref
      // is always released even if applyTrainerMove throws.
      let persistTarget: OpeningRepertoire | null = null;
      try {
        const result = applyTrainerMove(trainingState, from, to, promotion);
        clearSelection();

        if (result.promotionRequired) {
          // handleSquareTap in useBoardSelection already intercepts promotion
          // moves before calling applyMove; this branch is a defensive fallback.
          return;
        }

        if (!result.correct) {
          setTrainingState(result.state);
          if (result.state.feedback === 'revealed') {
            setBoardMessage({
              text: `Revealed: ${expectedMoveSan(result.state) ?? 'the correct move'} — replay it on the board.`,
              tone: 'negative',
            });
          } else {
            setBoardMessage({ text: 'Not this branch — try again.', tone: 'negative' });
          }
          persistTarget = result.state.repertoire;
          return;
        }

        // Correct move. Commit canonical (post-reply) state immediately so the
        // board is never validated against a stale position, then briefly show
        // the user's move via a non-blocking preview before the reply appears.
        persistTarget = result.state.repertoire;
        setTrainingState(result.state);

        const hasTrainerReply = Boolean(
          result.userMoveFen && result.userMoveFen !== result.state.currentFen,
        );
        if (hasTrainerReply && result.userMoveFen) {
          startPreview(result.userMoveFen);
        }

        if (result.state.feedback === 'complete') {
          setBoardMessage(null);
          return;
        }

        setBoardMessage({ text: 'Correct — your move to continue.', tone: 'positive' });
      } catch (err) {
        // A throw here (e.g. chess.js choking on a position) would otherwise
        // be swallowed silently, making the move "not register". Instead,
        // self-heal: clear selection, resync to a clean state (without touching
        // SRS stats/intervals), and surface a message to the user.
        const message = err instanceof Error ? err.message : String(err);
        console.error('[openings] move failed', {
          message,
          from,
          to,
          promotion,
          currentFen: trainingState.currentFen,
          currentNodeId: trainingState.currentNodeId,
          expectedMoveId: trainingState.expectedMoveId,
        });
        clearSelection();
        cancelPreview();
        setTrainingState((state) => (state ? resyncTrainingState(state) : state));
        setBoardMessage({
          text: `That move didn't register — tap it again. (${message})`,
          tone: 'negative',
        });
        persistTarget = null;
      } finally {
        applyingMoveRef.current = false;
        if (persistTarget) {
          void persistRepertoire(persistTarget).catch((err) =>
            console.error('[openings] persist failed', err),
          );
        }
      }
    },
    [trainingState, cancelPreview, startPreview, persistRepertoire],
  );

  // Manual escape hatch: resync to a clean state object at the same position,
  // re-deriving the expected move WITHOUT touching any stats or SRS intervals.
  const resync = useCallback(() => {
    applyingMoveRef.current = false;
    cancelPreview();
    setBoardMessage(null);
    setTrainingState((state) => (state ? resyncTrainingState(state) : state));
  }, [cancelPreview]);

  const reveal = useCallback(() => {
    setTrainingState((state) => (state ? { ...state, feedback: 'revealed' } : state));
  }, []);

  const clearTraining = useCallback(() => {
    setTrainingState(null);
    setBoardMessage(null);
    cancelPreview();
  }, [cancelPreview]);

  // Render the brief reply preview when present, otherwise the canonical board.
  const pieceMap = useMemo(
    () => (trainingState ? getPieceMapFromFen(previewFen ?? trainingState.currentFen) : {}),
    [previewFen, trainingState],
  );

  const statusText = useMemo(() => {
    if (!trainingState) return 'Import or select a repertoire to start.';
    if (trainingState.feedback === 'complete') return 'Line complete. Ready for the next branch.';
    if (trainingState.feedback === 'revealed')
      return `Replay: ${expectedMoveSan(trainingState) ?? 'the revealed move'}`;
    if (trainingState.feedback === 'incorrect') return 'Try again.';
    return `${trainingState.repertoire.side === 'white' ? 'White' : 'Black'} to train.`;
  }, [trainingState]);

  const isLineComplete = trainingState?.feedback === 'complete';
  // True when training started but the engine found nothing due — no move was ever made.
  const isNothingDue =
    trainingState?.feedback === 'complete' && trainingState.currentLineMoveIds.length === 0;
  const remainingDueMoves = useMemo(
    () => (trainingState ? summarizeRepertoire(trainingState.repertoire).dueMoves : 0),
    [trainingState],
  );

  return {
    trainingState,
    boardMessage,
    previewFen,
    applyingMoveRef,
    pieceMap,
    statusText,
    isLineComplete,
    isNothingDue,
    remainingDueMoves,
    cancelPreview,
    startTraining,
    applyMove,
    resync,
    reveal,
    clearTraining,
  };
}
