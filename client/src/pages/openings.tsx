import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import OtbBoard from '@/components/otb/otb-board';
import PromotionPicker from '@/components/otb/promotion-picker';
import {
  deleteOpeningRepertoire,
  getOpeningRepertoires,
  saveOpeningRepertoire,
} from '@/lib/firebase/repertoires';
import {
  applyTrainerMove,
  deleteLine,
  describeLine,
  enumerateLines,
  expectedMoveSan,
  findInvalidNodeFens,
  getLegalDestinationsFromFen,
  getPieceMapFromFen,
  isLineDisabled,
  lineLabel,
  moveNeedsPromotionFromFen,
  resyncTrainingState,
  setLineDisabled,
  startOpeningTraining,
  summarizeRepertoire,
} from '@/lib/opening-trainer/engine';
import { mergeRepertoire } from '@/lib/opening-trainer/merge';
import { parseOpeningRepertoirePgn, type OpeningParseError } from '@/lib/opening-trainer/parser';
import type {
  OpeningRepertoire,
  OpeningTrainerSide,
  OpeningTrainingState,
  RepertoireReviewSummary,
} from '@/lib/opening-trainer/types';
import type { PromotionPiece, Square } from '@/lib/otb/types';

interface PendingPromotion {
  from: Square;
  to: Square;
}

function sortRepertoires(repertoires: OpeningRepertoire[]): OpeningRepertoire[] {
  return [...repertoires].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

// Small pause between the user's move and the trainer's reply so the change on
// the board is easy to follow.
const TRAINER_REPLY_DELAY_MS = 300;

type BoardMessageTone = 'positive' | 'negative' | 'info';

interface BoardMessage {
  text: string;
  tone: BoardMessageTone;
}

const BOARD_MESSAGE_TONES: Record<BoardMessageTone, string> = {
  positive: 'border-green-200 bg-green-50 text-green-800',
  negative: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-gray-200 bg-gray-50 text-gray-700',
};

function repertoireMoveCount(repertoire: OpeningRepertoire): number {
  return Math.max(0, Object.keys(repertoire.nodes).length - 1);
}

function formatRelativeDue(iso: string | undefined): string {
  if (!iso) {
    return '';
  }
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) {
    return 'now';
  }
  const days = Math.ceil(ms / 86_400_000);
  if (days >= 1) {
    return `${days}d`;
  }
  return `${Math.max(1, Math.ceil(ms / 3_600_000))}h`;
}

export default function OpeningsPage() {
  const { toast } = useToast();
  const [repertoires, setRepertoires] = useState<OpeningRepertoire[]>([]);
  const [activeRepertoireId, setActiveRepertoireId] = useState<string | null>(null);
  const [trainingState, setTrainingState] = useState<OpeningTrainingState | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  // Mirror of the current selection, written synchronously so a second tap that
  // lands before React commits the selecting tap's render still sees it. Without
  // this, a fast piece-then-target tap reads a stale `selectedSquare === null`
  // closure and silently drops the move (the reported first-move bug).
  const selectionRef = useRef<{ square: Square; targets: Square[] } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [isBoardFlipped, setIsBoardFlipped] = useState(false);
  const [importName, setImportName] = useState('');
  const [importSide, setImportSide] = useState<OpeningTrainerSide>('white');
  // '' = create a new repertoire; otherwise the id of the repertoire to merge into.
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [pgnText, setPgnText] = useState('');
  const [importWarnings, setImportWarnings] = useState<OpeningParseError[]>([]);
  const [isImportPgnOpen, setIsImportPgnOpen] = useState(false);
  const [boardMessage, setBoardMessage] = useState<BoardMessage | null>(null);
  // Board-only override: after a correct move we briefly show the user's move
  // before revealing the trainer's reply. `trainingState` is kept canonical
  // (already advanced through the reply) the whole time; this FEN only affects
  // what the board renders, and it never blocks input — so a tap-ahead during the
  // pause is applied against canonical state instead of being silently dropped.
  const [previewFen, setPreviewFen] = useState<string | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingMoveRef = useRef(false);
  // Id of the repertoire whose lines are being managed in the edit dialog.
  const [managingRepertoireId, setManagingRepertoireId] = useState<string | null>(null);
  const [showLine, setShowLine] = useState(false);

  const activeRepertoire = useMemo(
    () => repertoires.find((repertoire) => repertoire.id === activeRepertoireId) ?? null,
    [activeRepertoireId, repertoires],
  );

  const mergeTarget = useMemo(
    () => repertoires.find((repertoire) => repertoire.id === mergeTargetId) ?? null,
    [mergeTargetId, repertoires],
  );

  const managingRepertoire = useMemo(
    () => repertoires.find((repertoire) => repertoire.id === managingRepertoireId) ?? null,
    [managingRepertoireId, repertoires],
  );

  // Every line of the repertoire being managed, with its display text, leaf id and
  // paused state. `name` is the authored line label from the PGN (if any); `moves`
  // is the SAN move list. Recomputed whenever the repertoire changes so edits show
  // at once.
  const managedLines = useMemo(() => {
    if (!managingRepertoire) {
      return [];
    }
    return enumerateLines(managingRepertoire).map((line) => ({
      leafId: line[line.length - 1],
      name: lineLabel(managingRepertoire, line),
      moves: describeLine(managingRepertoire, line),
      paused: isLineDisabled(managingRepertoire, line),
    }));
  }, [managingRepertoire]);

  const currentLineCandidates = useMemo(() => {
    if (!trainingState) return [];
    const prefix = [
      ...trainingState.currentLineMoveIds,
      ...(trainingState.expectedMoveId ? [trainingState.expectedMoveId] : []),
    ];
    return enumerateLines(trainingState.repertoire).filter((line) =>
      prefix.every((id, i) => line[i] === id),
    );
  }, [trainingState]);

  useEffect(() => {
    const load = async () => {
      const stored = await getOpeningRepertoires();
      setRepertoires(stored);
      setActiveRepertoireId(stored[0]?.id ?? null);
    };
    void load();
  }, []);

  // Single entry point for every selection mutation so the ref can never drift
  // from the rendered state. Pass null to deselect.
  const applySelection = useCallback((next: { square: Square; targets: Square[] } | null) => {
    selectionRef.current = next;
    setSelectedSquare(next?.square ?? null);
    setLegalTargets(next?.targets ?? []);
  }, []);

  const clearSelection = useCallback(() => applySelection(null), [applySelection]);

  // Clear the board preview immediately and cancel its pending timer.
  const cancelPreview = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setPreviewFen(null);
  }, []);

  // Show `fen` on the board for the reply delay, then fall back to canonical
  // `trainingState`. Any new move or interaction supersedes it via cancelPreview.
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

  // Clear any pending preview timer if the page unmounts mid-pause.
  useEffect(() => () => cancelPreview(), [cancelPreview]);

  const persistRepertoire = useCallback(async (repertoire: OpeningRepertoire) => {
    const saved = await saveOpeningRepertoire(repertoire);
    setRepertoires((previous) =>
      sortRepertoires([saved, ...previous.filter((item) => item.id !== saved.id)]),
    );
    setActiveRepertoireId(saved.id);
    return saved;
  }, []);

  const startTraining = useCallback(
    (repertoire: OpeningRepertoire, avoidLine: string[] = []) => {
      // Diagnostic: a node with an unparseable FEN makes the trainer throw
      // mid-line (which surfaces as a silently dropped move). Surface any such
      // nodes so a bad import is obvious; healthy data logs nothing.
      const badNodes = findInvalidNodeFens(repertoire);
      if (badNodes.length > 0) {
        console.warn(
          `[openings] "${repertoire.name}" has ${badNodes.length} node(s) with invalid FENs — re-import recommended`,
          badNodes,
        );
      }
      applyingMoveRef.current = false;
      // Reset the ref directly as well as via clearSelection so a fresh drill can
      // never inherit a stale selection, independent of clearSelection's impl.
      selectionRef.current = null;
      setTrainingState(startOpeningTraining(repertoire, avoidLine));
      setIsBoardFlipped(repertoire.side === 'black');
      setBoardMessage(null);
      cancelPreview();
      clearSelection();
    },
    [cancelPreview, clearSelection],
  );

  // Chessable-style review counts. Recomputed whenever a drilled move re-saves a
  // repertoire, so the badges and banner stay in step with what's actually due.
  const reviewSummaries = useMemo(() => {
    const summaries = new Map<string, RepertoireReviewSummary>();
    for (const repertoire of repertoires) {
      summaries.set(repertoire.id, summarizeRepertoire(repertoire));
    }
    return summaries;
  }, [repertoires]);

  const totalDueMoves = useMemo(
    () =>
      repertoires.reduce(
        (sum, repertoire) => sum + (reviewSummaries.get(repertoire.id)?.dueMoves ?? 0),
        0,
      ),
    [repertoires, reviewSummaries],
  );

  const startReview = useCallback(() => {
    const target = repertoires
      .map((repertoire) => ({
        repertoire,
        due: reviewSummaries.get(repertoire.id)?.dueLines ?? 0,
      }))
      .filter((entry) => entry.due > 0)
      .sort((a, b) => b.due - a.due)[0]?.repertoire;
    if (target) {
      setActiveRepertoireId(target.id);
      startTraining(target);
    }
  }, [repertoires, reviewSummaries, startTraining]);

  const handleImport = async () => {
    try {
      // When merging, the target owns the side; parse with it so move colours line up.
      const side = mergeTarget ? mergeTarget.side : importSide;
      const { repertoire, errors } = parseOpeningRepertoirePgn(pgnText, side, importName);

      let saved: OpeningRepertoire;
      let mergeSummary: { addedMoves: number; matchedMoves: number } | null = null;
      if (mergeTarget) {
        const merged = mergeRepertoire(mergeTarget, repertoire);
        saved = await persistRepertoire(merged.repertoire);
        mergeSummary = { addedMoves: merged.addedMoves, matchedMoves: merged.matchedMoves };
      } else {
        saved = await persistRepertoire(repertoire);
      }

      startTraining(saved);
      setImportName('');
      setPgnText('');
      setMergeTargetId('');
      setImportWarnings(errors);
      if (errors.length > 0) {
        const skipped = `${errors.length} line${errors.length === 1 ? '' : 's'}`;
        toast({
          title: 'Imported with warnings',
          description: `${repertoireMoveCount(saved)} moves ready; skipped ${skipped} with errors — see details below.`,
          variant: 'destructive',
        });
      } else if (mergeSummary) {
        const added = `${mergeSummary.addedMoves} new move${mergeSummary.addedMoves === 1 ? '' : 's'}`;
        toast({
          title: 'Repertoire updated',
          description: `Added ${added}; ${mergeSummary.matchedMoves} already in "${saved.name}".`,
        });
      } else {
        toast({
          title: 'Repertoire imported',
          description: `${repertoireMoveCount(saved)} moves are ready for training.`,
        });
      }
    } catch (error) {
      setImportWarnings([]);
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Unable to import that PGN.',
        variant: 'destructive',
      });
    }
  };

  const handleFileImport = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setPgnText(await file.text());
    if (!importName.trim()) {
      setImportName(file.name.replace(/\.pgn$/i, ''));
    }
  };

  const handleSkipLine = () => {
    if (!trainingState) return;
    const sourceRepertoire =
      trainingState.repertoire.id === activeRepertoire?.id
        ? trainingState.repertoire
        : activeRepertoire;
    if (!sourceRepertoire) return;
    setShowLine(false);
    startTraining(sourceRepertoire, trainingState.currentLineMoveIds);
    toast({ title: 'Switched to a new line' });
  };

  // Manual escape hatch for a stuck board (a tap that won't register). Clears all
  // transient interaction state and resyncs to a fresh state object at the SAME
  // position, re-deriving the expected move WITHOUT touching any stats — so it
  // never changes a line's review interval. Mirrors what making a move does to
  // unstick the UI, minus the spaced-repetition side effects.
  const handleUnstick = () => {
    if (!trainingState) return;
    applyingMoveRef.current = false;
    cancelPreview();
    clearSelection();
    setBoardMessage(null);
    setTrainingState((state) => (state ? resyncTrainingState(state) : state));
  };

  const handleStart = () => {
    setShowLine(false);
    const currentTrainingState = trainingState;
    const sourceRepertoire =
      currentTrainingState && currentTrainingState.repertoire.id === activeRepertoire?.id
        ? currentTrainingState.repertoire
        : activeRepertoire;
    if (sourceRepertoire) {
      startTraining(
        sourceRepertoire,
        currentTrainingState?.feedback === 'complete'
          ? currentTrainingState.lastCompletedLineMoveIds
          : [],
      );
    }
  };

  const handleDelete = async (id: string) => {
    const target = repertoires.find((repertoire) => repertoire.id === id);
    if (!target || !window.confirm(`Delete "${target.name}"?`)) {
      return;
    }

    await deleteOpeningRepertoire(id);
    const remaining = repertoires.filter((repertoire) => repertoire.id !== id);
    setRepertoires(remaining);
    setActiveRepertoireId(remaining[0]?.id ?? null);
    setTrainingState(null);
    clearSelection();
  };

  // After a line edit, persist and — if the edited repertoire is mid-drill —
  // restart it from the saved copy so training can't keep walking a now-paused or
  // deleted branch.
  const persistLineEdit = useCallback(
    async (updated: OpeningRepertoire) => {
      const saved = await persistRepertoire(updated);
      if (trainingState?.repertoire.id === saved.id) {
        startTraining(saved);
      }
      return saved;
    },
    [persistRepertoire, startTraining, trainingState],
  );

  const handleToggleLine = async (leafId: string, nextPaused: boolean) => {
    if (!managingRepertoire) {
      return;
    }
    await persistLineEdit(setLineDisabled(managingRepertoire, leafId, nextPaused));
  };

  const handleDeleteLine = async (leafId: string, label: string) => {
    if (!managingRepertoire || !window.confirm(`Delete the line "${label}"?`)) {
      return;
    }
    await persistLineEdit(deleteLine(managingRepertoire, leafId));
  };

  // Synchronous: state is always committed canonical and any "show your move"
  // pause is a non-blocking board preview, so there is no window where input is
  // frozen. applyingMoveRef stays purely as a same-tick re-entrancy guard.
  const applyMove = (from: Square, to: Square, promotion?: PromotionPiece) => {
    if (!trainingState || applyingMoveRef.current) {
      return;
    }
    applyingMoveRef.current = true;
    // A new move supersedes any reply preview still on screen.
    cancelPreview();

    // persistTarget is set to whichever repertoire needs saving once a move is
    // applied (null for the promotion-pending path where nothing has been applied
    // yet). It is read in the finally block so the ref is always released even if
    // applyTrainerMove throws before the inner try block is entered.
    let persistTarget: OpeningRepertoire | null = null;
    try {
      const result = applyTrainerMove(trainingState, from, to, promotion);
      clearSelection();

      if (result.promotionRequired) {
        // Nothing was applied yet; wait for the promotion choice.
        setPendingPromotion({ from, to });
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

      // Correct move. Commit the canonical (post-reply) state immediately so the
      // board is never validated against a stale position, then briefly show the
      // user's move on top via a non-blocking preview before the reply appears.
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
      // A throw here (e.g. chess.js choking on a position) would otherwise be
      // swallowed silently: the board wouldn't change and the selection would
      // stay on screen, so the move just "doesn't register" until you make some
      // other move. Instead, self-heal — clear the selection, resync to a clean
      // state object (which forces a re-render and re-derives the expected move
      // WITHOUT touching any stats/intervals), and tell the user to retry. The
      // throwing move never reached updateMoveStats, so SRS is untouched.
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
  };

  const handleSquareTap = (square: Square) => {
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

    // Read the selection from the ref, not React state: a rapid second tap can
    // fire before the selecting tap's render commits, so the state closure may
    // still be stale while the ref is already up to date.
    const selection = selectionRef.current;

    if (!selection) {
      if (!tappedPiece || tappedPiece.color !== activeColor) {
        return;
      }
      const destinations = getLegalDestinationsFromFen(trainingState.currentFen, square);
      if (destinations.length === 0) {
        return;
      }
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

    applyMove(selection.square, square);
  };

  const handlePromotionChoice = (piece: PromotionPiece) => {
    if (!pendingPromotion) {
      return;
    }
    applyMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  };

  // Render the brief reply preview when present, otherwise the canonical board.
  const pieceMap = useMemo(
    () => (trainingState ? getPieceMapFromFen(previewFen ?? trainingState.currentFen) : {}),
    [previewFen, trainingState],
  );

  const statusText = useMemo(() => {
    if (!trainingState) {
      return 'Import or select a repertoire to start.';
    }
    if (trainingState.feedback === 'complete') {
      return 'Line complete. Ready for the next branch.';
    }
    if (trainingState.feedback === 'revealed') {
      return `Replay: ${expectedMoveSan(trainingState) ?? 'the revealed move'}`;
    }
    if (trainingState.feedback === 'incorrect') {
      return 'Try again.';
    }
    return `${trainingState.repertoire.side === 'white' ? 'White' : 'Black'} to train.`;
  }, [trainingState]);

  const isLineComplete = trainingState?.feedback === 'complete';
  // True when training started but the engine found nothing due — currentLineMoveIds
  // stays empty because no move was ever made.
  const isNothingDue =
    trainingState?.feedback === 'complete' && trainingState.currentLineMoveIds.length === 0;
  const remainingDueMoves = useMemo(
    () => (trainingState ? summarizeRepertoire(trainingState.repertoire).dueMoves : 0),
    [trainingState],
  );

  return (
    <div className="page-stack">
      <div className="py-3 text-center md:py-4">
        <h2 className="mb-2 text-2xl font-bold text-gray-800 md:text-3xl">
          Opening Repertoire Trainer
        </h2>
      </div>

      {totalDueMoves > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 p-3">
          <p className="text-sm font-medium text-blue-900">
            {totalDueMoves} move{totalDueMoves === 1 ? '' : 's'} due for review
          </p>
          <Button type="button" size="sm" onClick={startReview}>
            Review due
          </Button>
        </div>
      )}

      <div className="tablet-grid items-start">
        <div className="tablet-main order-2 space-y-4 md:order-1 md:space-y-6">
          {isNothingDue ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-gray-300 bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-gray-500" />
                <div>
                  <p className="text-base font-semibold text-gray-800">All caught up!</p>
                  <p className="text-sm text-gray-600">
                    {activeRepertoireId && reviewSummaries.get(activeRepertoireId)?.nextDueAt
                      ? `Next review in ${formatRelativeDue(reviewSummaries.get(activeRepertoireId)!.nextDueAt)}.`
                      : 'No lines scheduled yet — keep drilling to build your intervals.'}
                  </p>
                </div>
              </div>
            </div>
          ) : isLineComplete ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-green-300 bg-green-50 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-green-600" />
                <div>
                  <p className="text-base font-semibold text-green-900">Line complete!</p>
                  <p className="text-sm text-green-700">
                    {remainingDueMoves > 0
                      ? `${remainingDueMoves} move${remainingDueMoves === 1 ? '' : 's'} still due.`
                      : 'All moves reviewed for now.'}
                  </p>
                </div>
              </div>
              <Button type="button" onClick={handleStart} disabled={!activeRepertoire}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Next Line
              </Button>
            </div>
          ) : (
            <div
              className={`rounded-md border p-3 text-sm font-medium ${boardMessage ? BOARD_MESSAGE_TONES[boardMessage.tone] : 'invisible border-transparent'}`}
            >
              {boardMessage?.text ?? ' '}
            </div>
          )}

          <OtbBoard
            pieceMap={pieceMap}
            selectedSquare={selectedSquare}
            legalTargets={legalTargets}
            isFlipped={isBoardFlipped}
            isTableMode={false}
            onSquareTap={handleSquareTap}
          />

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{statusText}</p>
                  {trainingState && (
                    <p className="text-xs text-gray-500">
                      Position{' '}
                      {trainingState.repertoire.nodes[trainingState.currentNodeId]?.ply ?? 0} • View{' '}
                      {isBoardFlipped ? 'Black' : 'White'}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsBoardFlipped((value) => !value)}
                  >
                    Flip Board
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleStart}
                    disabled={!activeRepertoire}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {isLineComplete && !isNothingDue ? 'Next Line' : 'Reset Drill'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (trainingState) {
                        setTrainingState({ ...trainingState, feedback: 'revealed' });
                      }
                    }}
                    disabled={!trainingState || trainingState.feedback === 'complete'}
                  >
                    Reveal
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowLine((v) => !v)}
                    disabled={!trainingState}
                  >
                    {showLine ? 'Hide Line' : 'Show Line'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSkipLine}
                    disabled={!trainingState || !activeRepertoire}
                  >
                    Skip Line
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUnstick}
                    disabled={!trainingState || trainingState.feedback === 'complete'}
                    title="If a move won't register, tap this to unstick the board (doesn't affect your review schedule)"
                  >
                    Unstick
                  </Button>
                </div>
              </div>
              {showLine && trainingState && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs">
                  {currentLineCandidates.length === 0 ? (
                    <p className="text-gray-500">No matching line found.</p>
                  ) : (
                    <div className="space-y-2">
                      {currentLineCandidates.map((line, i) => {
                        const label = lineLabel(trainingState.repertoire, line);
                        return (
                          <div key={i}>
                            {label && <p className="font-medium text-gray-700">{label}</p>}
                            <p className="font-mono text-gray-600">
                              {describeLine(trainingState.repertoire, line)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="tablet-side order-1 space-y-4 md:order-2 md:space-y-6">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-gray-600" />
                <h3 className="text-base font-semibold text-gray-800">Repertoires</h3>
              </div>
              {repertoires.length === 0 ? (
                <p className="text-sm text-gray-500">No repertoires imported yet.</p>
              ) : (
                <div className="space-y-2">
                  {repertoires.map((repertoire) => {
                    const summary = reviewSummaries.get(repertoire.id);
                    return (
                      <div key={repertoire.id} className="rounded-md border border-gray-200 p-3">
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => {
                            setActiveRepertoireId(repertoire.id);
                            startTraining(repertoire);
                          }}
                        >
                          <span className="block text-sm font-medium text-gray-800">
                            {repertoire.name}
                          </span>
                          <span className="text-xs text-gray-500">
                            {repertoire.side === 'white' ? 'White' : 'Black'} •{' '}
                            {summary?.totalLines ?? 0} line
                            {(summary?.totalLines ?? 0) === 1 ? '' : 's'}
                            {' • '}
                            {summary && summary.dueMoves > 0 ? (
                              <span className="font-medium text-blue-700">
                                {summary.dueMoves} move{summary.dueMoves === 1 ? '' : 's'} due
                              </span>
                            ) : (
                              <span className="text-green-700">
                                All reviewed
                                {summary?.nextDueAt
                                  ? ` · next in ${formatRelativeDue(summary.nextDueAt)}`
                                  : ''}
                              </span>
                            )}
                          </span>
                        </button>
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={activeRepertoireId === repertoire.id ? 'default' : 'outline'}
                            onClick={() => {
                              setActiveRepertoireId(repertoire.id);
                              startTraining(repertoire);
                            }}
                          >
                            Train
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setManagingRepertoireId(repertoire.id)}
                            aria-label={`Edit lines in ${repertoire.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleDelete(repertoire.id)}
                            aria-label={`Delete ${repertoire.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 p-4"
              onClick={() => setIsImportPgnOpen((open) => !open)}
              aria-expanded={isImportPgnOpen}
            >
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-gray-600" />
                <h3 className="text-base font-semibold text-gray-800">Import PGN</h3>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isImportPgnOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isImportPgnOpen && (
              <CardContent className="space-y-3 px-4 pb-4 pt-0">
                {repertoires.length > 0 && (
                  <div>
                    <Label htmlFor="importTarget">Import as</Label>
                    <select
                      id="importTarget"
                      className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      value={mergeTargetId}
                      onChange={(event) => setMergeTargetId(event.target.value)}
                    >
                      <option value="">New repertoire</option>
                      {repertoires.map((repertoire) => (
                        <option key={repertoire.id} value={repertoire.id}>
                          Merge into {repertoire.name} ({repertoire.side})
                        </option>
                      ))}
                    </select>
                    {mergeTarget && (
                      <p className="mt-1 text-xs text-gray-500">
                        New lines are added to "{mergeTarget.name}"; existing lines keep their
                        training progress.
                      </p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label htmlFor="repertoireName">Name</Label>
                    <Input
                      id="repertoireName"
                      value={mergeTarget ? mergeTarget.name : importName}
                      onChange={(event) => setImportName(event.target.value)}
                      placeholder="Caro-Kann repertoire"
                      disabled={Boolean(mergeTarget)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="trainingSide">Your side</Label>
                    <select
                      id="trainingSide"
                      className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                      value={mergeTarget ? mergeTarget.side : importSide}
                      disabled={Boolean(mergeTarget)}
                      onChange={(event) =>
                        setImportSide(event.target.value === 'black' ? 'black' : 'white')
                      }
                    >
                      <option value="white">White</option>
                      <option value="black">Black</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="pgnFile">PGN file</Label>
                    <Input
                      id="pgnFile"
                      type="file"
                      accept=".pgn,application/x-chess-pgn,text/plain"
                      onChange={(event) => void handleFileImport(event.target.files?.[0])}
                    />
                  </div>
                </div>
                <Textarea
                  aria-label="PGN text"
                  value={pgnText}
                  onChange={(event) => setPgnText(event.target.value)}
                  placeholder="Paste a single PGN game with variations..."
                  className="min-h-36"
                />
                <Button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={!pgnText.trim()}
                >
                  {mergeTarget ? 'Merge into Repertoire' : 'Import Repertoire'}
                </Button>

                {importWarnings.length > 0 && (
                  <div
                    role="alert"
                    className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                  >
                    <p className="font-medium">
                      Imported with {importWarnings.length} skipped{' '}
                      {importWarnings.length === 1 ? 'line' : 'lines'}. Fix these moves in your PGN
                      and re-import to include them:
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {importWarnings.map((warning, index) => (
                        <li key={index}>{warning.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      <Dialog
        open={Boolean(managingRepertoire)}
        onOpenChange={(open) => !open && setManagingRepertoireId(null)}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit lines{managingRepertoire ? ` — ${managingRepertoire.name}` : ''}
            </DialogTitle>
            <DialogDescription>
              Pause a line to keep it but stop training it, or delete it to remove it for good.
            </DialogDescription>
          </DialogHeader>
          {managedLines.length === 0 ? (
            <p className="text-sm text-gray-500">This repertoire has no lines.</p>
          ) : (
            <ul className="space-y-2">
              {managedLines.map((line) => (
                <li
                  key={line.leafId}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-200 p-3"
                >
                  <div className="min-w-0">
                    {line.name ? (
                      <>
                        <p
                          className={`break-words text-sm font-medium ${line.paused ? 'text-gray-400' : 'text-gray-800'}`}
                        >
                          {line.name}
                        </p>
                        <p
                          className={`mt-0.5 break-words font-mono text-xs ${line.paused ? 'text-gray-400' : 'text-gray-500'}`}
                        >
                          {line.moves}
                        </p>
                      </>
                    ) : (
                      <p
                        className={`break-words font-mono text-sm ${line.paused ? 'text-gray-400' : 'text-gray-800'}`}
                      >
                        {line.moves}
                      </p>
                    )}
                    {line.paused && (
                      <Badge variant="outline" className="mt-1 text-amber-700">
                        Paused
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Switch
                      checked={!line.paused}
                      onCheckedChange={(checked) => void handleToggleLine(line.leafId, !checked)}
                      aria-label={line.paused ? 'Activate line' : 'Pause line'}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleDeleteLine(line.leafId, line.name ?? line.moves)}
                      aria-label={`Delete line ${line.name ?? line.moves}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <PromotionPicker
        open={Boolean(pendingPromotion)}
        onSelect={handlePromotionChoice}
        onCancel={() => setPendingPromotion(null)}
      />
    </div>
  );
}
