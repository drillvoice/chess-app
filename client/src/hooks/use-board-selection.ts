import { useCallback, useRef, useState } from 'react';
import {
  getLegalDestinationsFromFen,
  getPieceMapFromFen,
  moveNeedsPromotionFromFen,
} from '@/lib/opening-trainer/engine';
import type { OpeningTrainingState } from '@/lib/opening-trainer/types';
import type { PromotionPiece, Square } from '@/lib/otb/types';

interface PendingPromotion {
  from: Square;
  to: Square;
}

interface UseBoardSelectionOptions {
  trainingState: OpeningTrainingState | null;
  applyMove: (
    from: Square,
    to: Square,
    promotion: PromotionPiece | undefined,
    clearSelection: () => void,
  ) => void;
  cancelPreview: () => void;
  applyingMoveRef: React.MutableRefObject<boolean>;
}

export interface UseBoardSelectionResult {
  selectedSquare: Square | null;
  legalTargets: Square[];
  pendingPromotion: PendingPromotion | null;
  isBoardFlipped: boolean;
  setIsBoardFlipped: React.Dispatch<React.SetStateAction<boolean>>;
  clearSelection: () => void;
  handleSquareTap: (square: Square) => void;
  handlePromotionChoice: (piece: PromotionPiece) => void;
  cancelPendingPromotion: () => void;
}

export function useBoardSelection({
  trainingState,
  applyMove,
  cancelPreview,
  applyingMoveRef,
}: UseBoardSelectionOptions): UseBoardSelectionResult {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  // Mirror of selection state written synchronously so a second tap that lands
  // before React commits the first tap's render still sees the current selection.
  // Without this, a fast piece-then-target tap reads a stale `selectedSquare === null`
  // closure and silently drops the move (the reported first-move bug).
  const selectionRef = useRef<{ square: Square; targets: Square[] } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [isBoardFlipped, setIsBoardFlipped] = useState(false);

  // Single entry point for all selection mutations — keeps ref and state in sync.
  const applySelection = useCallback((next: { square: Square; targets: Square[] } | null) => {
    selectionRef.current = next;
    setSelectedSquare(next?.square ?? null);
    setLegalTargets(next?.targets ?? []);
  }, []);

  const clearSelection = useCallback(() => applySelection(null), [applySelection]);

  const handleSquareTap = useCallback(
    (square: Square) => {
      if (
        !trainingState ||
        pendingPromotion ||
        applyingMoveRef.current ||
        trainingState.feedback === 'complete'
      ) {
        return;
      }

      // Any interaction dismisses the reply preview so selection and rendering
      // both resolve to canonical state before the tap is processed.
      cancelPreview();

      const pieceMap = getPieceMapFromFen(trainingState.currentFen);
      const tappedPiece = pieceMap[square];
      const activeColor = trainingState.currentFen.split(' ')[1] as 'w' | 'b';

      // Read from the ref, not React state: a rapid second tap can fire before
      // the selecting tap's render commits, so the state closure may be stale
      // while the ref is already up to date.
      const selection = selectionRef.current;

      if (!selection) {
        if (!tappedPiece || tappedPiece.color !== activeColor) return;
        const destinations = getLegalDestinationsFromFen(trainingState.currentFen, square);
        if (destinations.length === 0) return;
        applySelection({ square, targets: destinations });
        return;
      }

      if (square === selection.square) {
        clearSelection();
        return;
      }

      if (!selection.targets.includes(square)) {
        if (tappedPiece && tappedPiece.color === activeColor) {
          const destinations = getLegalDestinationsFromFen(trainingState.currentFen, square);
          applySelection(destinations.length ? { square, targets: destinations } : null);
        } else {
          clearSelection();
        }
        return;
      }

      if (moveNeedsPromotionFromFen(trainingState.currentFen, selection.square, square)) {
        setPendingPromotion({ from: selection.square, to: square });
        return;
      }

      applyMove(selection.square, square, undefined, clearSelection);
    },
    [
      trainingState,
      pendingPromotion,
      applyingMoveRef,
      cancelPreview,
      applySelection,
      clearSelection,
      applyMove,
    ],
  );

  const handlePromotionChoice = useCallback(
    (piece: PromotionPiece) => {
      if (!pendingPromotion) return;
      applyMove(pendingPromotion.from, pendingPromotion.to, piece, clearSelection);
      setPendingPromotion(null);
    },
    [pendingPromotion, applyMove, clearSelection],
  );

  return {
    selectedSquare,
    legalTargets,
    pendingPromotion,
    isBoardFlipped,
    setIsBoardFlipped,
    clearSelection,
    handleSquareTap,
    handlePromotionChoice,
    cancelPendingPromotion: () => setPendingPromotion(null),
  };
}
