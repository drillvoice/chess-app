import { useCallback } from 'react';
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
import { useBoardSelection } from '@/hooks/use-board-selection';
import { useLineManagement } from '@/hooks/use-line-management';
import { useOpeningImport } from '@/hooks/use-opening-import';
import { useOpeningRepertoires } from '@/hooks/use-opening-repertoires';
import { useOpeningTrainer } from '@/hooks/use-opening-trainer';
import OtbBoard from '@/components/otb/otb-board';
import PromotionPicker from '@/components/otb/promotion-picker';
import { describeLine, lineLabel } from '@/lib/opening-trainer/engine';
import type { OpeningRepertoire } from '@/lib/opening-trainer/types';
import type { BoardMessageTone } from '@/hooks/use-opening-trainer';

const BOARD_MESSAGE_TONES: Record<BoardMessageTone, string> = {
  positive: 'border-green-200 bg-green-50 text-green-800',
  negative: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-gray-200 bg-gray-50 text-gray-700',
};

function formatRelativeDue(iso: string | undefined): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const days = Math.ceil(ms / 86_400_000);
  if (days >= 1) return `${days}d`;
  return `${Math.max(1, Math.ceil(ms / 3_600_000))}h`;
}

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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.clearSelection, board.setIsBoardFlipped, trainer.startTraining],
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

  const handleSkipLine = useCallback(() => {
    if (!trainer.trainingState) return;
    const sourceRepertoire =
      trainer.trainingState.repertoire.id === activeRepertoire?.id
        ? trainer.trainingState.repertoire
        : activeRepertoire;
    if (!sourceRepertoire) return;
    lineManagement.setShowLine(false);
    handleStartTraining(sourceRepertoire, trainer.trainingState.currentLineMoveIds);
    toast({ title: 'Switched to a new line' });
  }, [trainer.trainingState, activeRepertoire, lineManagement, handleStartTraining, toast]);

  const handleUnstick = useCallback(() => {
    if (!trainer.trainingState) return;
    trainer.resync();
    board.clearSelection();
  }, [trainer, board]);

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
  const { trainingState, boardMessage, pieceMap, statusText, isLineComplete, isNothingDue, remainingDueMoves } = trainer;
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
            onSquareTap={board.handleSquareTap}
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
                            handleStartTraining(repertoire);
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
                              handleStartTraining(repertoire);
                            }}
                          >
                            Train
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => lineManagement.setManagingRepertoireId(repertoire.id)}
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
              onClick={() => importHook.setIsImportPgnOpen((open) => !open)}
              aria-expanded={importHook.isImportPgnOpen}
            >
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-gray-600" />
                <h3 className="text-base font-semibold text-gray-800">Import PGN</h3>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${importHook.isImportPgnOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {importHook.isImportPgnOpen && (
              <CardContent className="space-y-3 px-4 pb-4 pt-0">
                {repertoires.length > 0 && (
                  <div>
                    <Label htmlFor="importTarget">Import as</Label>
                    <select
                      id="importTarget"
                      className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      value={importHook.mergeTargetId}
                      onChange={(event) => importHook.setMergeTargetId(event.target.value)}
                    >
                      <option value="">New repertoire</option>
                      {repertoires.map((repertoire) => (
                        <option key={repertoire.id} value={repertoire.id}>
                          Merge into {repertoire.name} ({repertoire.side})
                        </option>
                      ))}
                    </select>
                    {importHook.mergeTarget && (
                      <p className="mt-1 text-xs text-gray-500">
                        New lines are added to "{importHook.mergeTarget.name}"; existing lines keep
                        their training progress.
                      </p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label htmlFor="repertoireName">Name</Label>
                    <Input
                      id="repertoireName"
                      value={importHook.mergeTarget ? importHook.mergeTarget.name : importHook.importName}
                      onChange={(event) => importHook.setImportName(event.target.value)}
                      placeholder="Caro-Kann repertoire"
                      disabled={Boolean(importHook.mergeTarget)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="trainingSide">Your side</Label>
                    <select
                      id="trainingSide"
                      className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                      value={importHook.mergeTarget ? importHook.mergeTarget.side : importHook.importSide}
                      disabled={Boolean(importHook.mergeTarget)}
                      onChange={(event) =>
                        importHook.setImportSide(event.target.value === 'black' ? 'black' : 'white')
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
                      onChange={(event) => void importHook.handleFileImport(event.target.files?.[0])}
                    />
                  </div>
                </div>
                <Textarea
                  aria-label="PGN text"
                  value={importHook.pgnText}
                  onChange={(event) => importHook.setPgnText(event.target.value)}
                  placeholder="Paste a single PGN game with variations..."
                  className="min-h-36"
                />
                <Button
                  type="button"
                  onClick={() => void importHook.handleImport()}
                  disabled={!importHook.pgnText.trim()}
                >
                  {importHook.mergeTarget ? 'Merge into Repertoire' : 'Import Repertoire'}
                </Button>

                {importHook.importWarnings.length > 0 && (
                  <div
                    role="alert"
                    className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                  >
                    <p className="font-medium">
                      Imported with {importHook.importWarnings.length} skipped{' '}
                      {importHook.importWarnings.length === 1 ? 'line' : 'lines'}. Fix these moves
                      in your PGN and re-import to include them:
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {importHook.importWarnings.map((warning, index) => (
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
        onOpenChange={(open) => !open && lineManagement.setManagingRepertoireId(null)}
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
                      onCheckedChange={(checked) =>
                        void lineManagement.handleToggleLine(line.leafId, !checked)
                      }
                      aria-label={line.paused ? 'Activate line' : 'Pause line'}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void lineManagement.handleDeleteLine(
                          line.leafId,
                          line.name ?? line.moves,
                        )
                      }
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
        onSelect={board.handlePromotionChoice}
        onCancel={board.cancelPendingPromotion}
      />
    </div>
  );
}
