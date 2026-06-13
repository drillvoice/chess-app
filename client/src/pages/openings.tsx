import { useCallback } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useBoardSelection } from '@/hooks/use-board-selection';
import { useLineManagement } from '@/hooks/use-line-management';
import { useOpeningImport } from '@/hooks/use-opening-import';
import { useOpeningRepertoires } from '@/hooks/use-opening-repertoires';
import { useOpeningTrainer } from '@/hooks/use-opening-trainer';
import { useTrainingTimer } from '@/hooks/use-training-timer';
import OtbBoard from '@/components/otb/otb-board';
import PromotionPicker from '@/components/otb/promotion-picker';
import { RepertoireList } from '@/components/openings/repertoire-list';
import { ImportPgnPanel } from '@/components/openings/import-pgn-panel';
import { EditLinesDialog } from '@/components/openings/edit-lines-dialog';
import { formatRelativeDue } from '@/components/openings/format-relative-due';
import { describeLine, lineLabel, setLineDisabled } from '@/lib/opening-trainer/engine';
import type { OpeningRepertoire } from '@/lib/opening-trainer/types';
import type { Square } from '@/lib/otb/types';
import type { BoardMessageTone } from '@/hooks/use-opening-trainer';

const BOARD_MESSAGE_TONES: Record<BoardMessageTone, string> = {
  positive: 'border-green-200 bg-green-50 text-green-800',
  negative: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-gray-200 bg-gray-50 text-gray-700',
};

export default function OpeningsPage() {
  const { toast } = useToast();

  // ── Repertoire list (load, save, delete) ─────────────────────────────────
  const {
    repertoires,
    activeRepertoireId,
    setActiveRepertoireId,
    activeRepertoire,
    reviewSummaries,
    totalDueMoves,
    persistRepertoire,
    deleteRepertoire,
  } = useOpeningRepertoires();

  // ── Training session state machine ───────────────────────────────────────
  const trainer = useOpeningTrainer({ persistRepertoire });

  // ── Background practice timer (auto-logs an "openings" study session) ──────
  // Invisible: it accumulates active time while a drill is in progress and
  // writes the minutes out when practice stops. markActive() is signalled from
  // the interaction points below.
  const timer = useTrainingTimer({ enabled: trainer.trainingState != null });

  // ── Board interaction (squares, flip, promotion) ──────────────────────────
  const board = useBoardSelection({
    trainingState: trainer.trainingState,
    applyMove: trainer.applyMove,
    cancelPreview: trainer.cancelPreview,
    applyingMoveRef: trainer.applyingMoveRef,
  });

  // ── Coordinator: start training and reset board together ──────────────────
  // Called whenever a new drill begins (repertoire select, import, skip line,
  // next line, review). Clears board selection synchronously before the trainer
  // resets applyingMoveRef so no tap-ahead can race against stale selection.
  const handleStartTraining = useCallback(
    (repertoire: OpeningRepertoire, avoidLine?: string[]) => {
      board.clearSelection();
      trainer.startTraining(repertoire, avoidLine ?? []);
      board.setIsBoardFlipped(repertoire.side === 'black');
      timer.markActive();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.clearSelection, board.setIsBoardFlipped, trainer.startTraining, timer.markActive],
  );

  // ── PGN import ───────────────────────────────────────────────────────────
  const importHook = useOpeningImport({
    repertoires,
    persistRepertoire,
    onImported: handleStartTraining,
  });

  // ── Line editing (pause / delete individual lines) ───────────────────────
  const onLineEdited = useCallback(
    (saved: OpeningRepertoire) => {
      // If the edited repertoire is currently being drilled, restart from the
      // saved copy so training can't walk a now-paused or deleted branch.
      if (trainer.trainingState?.repertoire.id === saved.id) {
        handleStartTraining(saved);
      }
    },
    [trainer.trainingState, handleStartTraining],
  );

  const lineManagement = useLineManagement({
    repertoires,
    persistRepertoire,
    trainingState: trainer.trainingState,
    onLineEdited,
  });

  // ── Page-level handlers ───────────────────────────────────────────────────

  const startReview = useCallback(() => {
    const target = repertoires
      .map((r) => ({ repertoire: r, due: reviewSummaries.get(r.id)?.dueLines ?? 0 }))
      .filter((e) => e.due > 0)
      .sort((a, b) => b.due - a.due)[0]?.repertoire;
    if (target) {
      setActiveRepertoireId(target.id);
      handleStartTraining(target);
    }
  }, [repertoires, reviewSummaries, setActiveRepertoireId, handleStartTraining]);

  const handlePauseLine = useCallback(async () => {
    if (!trainer.trainingState) return;
    const { repertoire } = trainer.trainingState;
    // Pause the line by its *leaf* (the unit pause/selection logic understands),
    // not the current mid-drill position. The button is only enabled once the
    // drill has narrowed to a single line, so there is exactly one candidate.
    const line = lineManagement.currentLineCandidates[0];
    const leafId = line?.[line.length - 1];
    if (!leafId) return;
    lineManagement.setShowLine(false);
    const updated = setLineDisabled(repertoire, leafId, true);
    const saved = await persistRepertoire(updated);
    onLineEdited(saved);
    toast({ title: 'Line paused' });
  }, [trainer.trainingState, lineManagement, persistRepertoire, onLineEdited, toast]);

  const handleStart = useCallback(() => {
    lineManagement.setShowLine(false);
    const currentTrainingState = trainer.trainingState;
    const sourceRepertoire =
      currentTrainingState && currentTrainingState.repertoire.id === activeRepertoire?.id
        ? currentTrainingState.repertoire
        : activeRepertoire;
    if (sourceRepertoire) {
      handleStartTraining(
        sourceRepertoire,
        currentTrainingState?.feedback === 'complete'
          ? currentTrainingState.lastCompletedLineMoveIds
          : [],
      );
    }
  }, [trainer.trainingState, activeRepertoire, lineManagement, handleStartTraining]);

  // Board taps are the highest-signal activity event (cover both selection and
  // moves), so keep the practice timer alive from here.
  const handleSquareTap = useCallback(
    (square: Square) => {
      timer.markActive();
      board.handleSquareTap(square);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timer.markActive, board.handleSquareTap],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const deleted = await deleteRepertoire(id);
      if (deleted) {
        trainer.clearTraining();
        board.clearSelection();
      }
    },
    [deleteRepertoire, trainer, board],
  );

  // ── Derived render values ─────────────────────────────────────────────────
  const {
    trainingState,
    boardMessage,
    pieceMap,
    statusText,
    isLineComplete,
    isNothingDue,
    remainingDueMoves,
  } = trainer;
  const { selectedSquare, legalTargets, isBoardFlipped, pendingPromotion } = board;
  const { managingRepertoire, managedLines, showLine, currentLineCandidates } = lineManagement;

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
              {boardMessage?.text ?? ' '}
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
                    onClick={() => board.setIsBoardFlipped((v) => !v)}
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
                    onClick={trainer.reveal}
                    disabled={!trainingState || trainingState.feedback === 'complete'}
                  >
                    Reveal
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => lineManagement.setShowLine((v) => !v)}
                    disabled={!trainingState}
                  >
                    {showLine ? 'Hide Line' : 'Show Line'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handlePauseLine()}
                    disabled={
                      !trainingState ||
                      trainingState.feedback === 'complete' ||
                      // Before any move there is nothing to pause.
                      trainingState.currentLineMoveIds.length === 0 ||
                      // Greyed out until the drill has narrowed to a single line
                      // (no further branching), so "pause" acts on one known leaf.
                      currentLineCandidates.length !== 1
                    }
                  >
                    Pause line
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
          <RepertoireList
            repertoires={repertoires}
            reviewSummaries={reviewSummaries}
            activeRepertoireId={activeRepertoireId}
            onTrain={(repertoire) => {
              setActiveRepertoireId(repertoire.id);
              handleStartTraining(repertoire);
            }}
            onEditLines={(repertoireId) => lineManagement.setManagingRepertoireId(repertoireId)}
            onDelete={(repertoireId) => void handleDelete(repertoireId)}
          />

          <ImportPgnPanel importHook={importHook} repertoires={repertoires} />
        </div>
      </div>

      <EditLinesDialog
        managingRepertoire={managingRepertoire}
        managedLines={managedLines}
        onClose={() => lineManagement.setManagingRepertoireId(null)}
        onToggleLine={(leafId, paused) => void lineManagement.handleToggleLine(leafId, paused)}
        onDeleteLine={(leafId, label) => void lineManagement.handleDeleteLine(leafId, label)}
      />

      <PromotionPicker
        open={Boolean(pendingPromotion)}
        onSelect={board.handlePromotionChoice}
        onCancel={board.cancelPendingPromotion}
      />
    </div>
  );
}
