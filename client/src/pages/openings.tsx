import { useCallback, useEffect, useMemo, useState } from 'react';
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
  getLegalDestinationsFromFen,
  getPieceMapFromFen,
  isLineDisabled,
  lineLabel,
  moveNeedsPromotionFromFen,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const [isTrainerThinking, setIsTrainerThinking] = useState(false);
  // Id of the repertoire whose lines are being managed in the edit dialog.
  const [managingRepertoireId, setManagingRepertoireId] = useState<string | null>(null);

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

  useEffect(() => {
    const load = async () => {
      const stored = await getOpeningRepertoires();
      setRepertoires(stored);
      setActiveRepertoireId(stored[0]?.id ?? null);
    };
    void load();
  }, []);

  const clearSelection = () => {
    setSelectedSquare(null);
    setLegalTargets([]);
  };

  const persistRepertoire = useCallback(async (repertoire: OpeningRepertoire) => {
    const saved = await saveOpeningRepertoire(repertoire);
    setRepertoires((previous) =>
      sortRepertoires([saved, ...previous.filter((item) => item.id !== saved.id)]),
    );
    setActiveRepertoireId(saved.id);
    return saved;
  }, []);

  const startTraining = useCallback((repertoire: OpeningRepertoire, avoidLine: string[] = []) => {
    setTrainingState(startOpeningTraining(repertoire, avoidLine));
    setIsBoardFlipped(repertoire.side === 'black');
    setBoardMessage(null);
    setIsTrainerThinking(false);
    clearSelection();
  }, []);

  // Chessable-style review counts. Recomputed whenever a drilled move re-saves a
  // repertoire, so the badges and banner stay in step with what's actually due.
  const reviewSummaries = useMemo(() => {
    const summaries = new Map<string, RepertoireReviewSummary>();
    for (const repertoire of repertoires) {
      summaries.set(repertoire.id, summarizeRepertoire(repertoire));
    }
    return summaries;
  }, [repertoires]);

  const totalDueLines = useMemo(
    () =>
      repertoires.reduce(
        (sum, repertoire) => sum + (reviewSummaries.get(repertoire.id)?.dueLines ?? 0),
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

  const handleStart = () => {
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

  const applyMove = async (from: Square, to: Square, promotion?: PromotionPiece) => {
    if (!trainingState) {
      return;
    }

    const result = applyTrainerMove(trainingState, from, to, promotion);
    clearSelection();

    if (result.promotionRequired) {
      // Nothing was applied yet; wait for the promotion choice.
      setPendingPromotion({ from, to });
      return;
    }

    const saved = await persistRepertoire(result.state.repertoire);
    const nextState = { ...result.state, repertoire: saved };

    if (!result.correct) {
      setTrainingState(nextState);
      if (nextState.feedback === 'revealed') {
        setBoardMessage({
          text: `Revealed: ${expectedMoveSan(nextState) ?? 'the correct move'} — replay it on the board.`,
          tone: 'negative',
        });
      } else {
        setBoardMessage({ text: 'Not this branch — try again.', tone: 'negative' });
      }
      return;
    }

    // Correct move. Show the user's move first, then play the trainer's reply
    // after a short pause so the change is easy to follow.
    const hasTrainerReply = Boolean(
      result.userMoveFen && result.userMoveFen !== nextState.currentFen,
    );

    if (hasTrainerReply && result.userMoveFen) {
      setTrainingState({ ...nextState, currentFen: result.userMoveFen });
      setIsTrainerThinking(true);
      await sleep(TRAINER_REPLY_DELAY_MS);
      setIsTrainerThinking(false);
    }

    setTrainingState(nextState);

    if (nextState.feedback === 'complete') {
      setBoardMessage(null);
      return;
    }

    setBoardMessage({ text: 'Correct — your move to continue.', tone: 'positive' });
  };

  const handleSquareTap = async (square: Square) => {
    if (
      !trainingState ||
      pendingPromotion ||
      isTrainerThinking ||
      trainingState.feedback === 'complete'
    ) {
      return;
    }

    const pieceMap = getPieceMapFromFen(trainingState.currentFen);
    const tappedPiece = pieceMap[square];
    const activeColor = trainingState.currentFen.split(' ')[1] as 'w' | 'b';

    if (!selectedSquare) {
      if (!tappedPiece || tappedPiece.color !== activeColor) {
        return;
      }
      const destinations = getLegalDestinationsFromFen(trainingState.currentFen, square);
      if (destinations.length === 0) {
        return;
      }
      setSelectedSquare(square);
      setLegalTargets(destinations);
      return;
    }

    if (square === selectedSquare) {
      clearSelection();
      return;
    }

    if (!legalTargets.includes(square)) {
      if (tappedPiece && tappedPiece.color === activeColor) {
        const destinations = getLegalDestinationsFromFen(trainingState.currentFen, square);
        setSelectedSquare(destinations.length ? square : null);
        setLegalTargets(destinations);
      } else {
        clearSelection();
      }
      return;
    }

    if (moveNeedsPromotionFromFen(trainingState.currentFen, selectedSquare, square)) {
      setPendingPromotion({ from: selectedSquare, to: square });
      return;
    }

    await applyMove(selectedSquare, square);
  };

  const handlePromotionChoice = async (piece: PromotionPiece) => {
    if (!pendingPromotion) {
      return;
    }
    await applyMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  };

  const pieceMap = useMemo(
    () => (trainingState ? getPieceMapFromFen(trainingState.currentFen) : {}),
    [trainingState],
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
  const remainingDueLines = useMemo(
    () => (trainingState ? summarizeRepertoire(trainingState.repertoire).dueLines : 0),
    [trainingState],
  );

  return (
    <div className="page-stack">
      <div className="py-3 text-center md:py-4">
        <h2 className="mb-2 text-2xl font-bold text-gray-800 md:text-3xl">
          Opening Repertoire Trainer
        </h2>
      </div>

      {totalDueLines > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 p-3">
          <p className="text-sm font-medium text-blue-900">
            {totalDueLines} line{totalDueLines === 1 ? '' : 's'} due for review
          </p>
          <Button type="button" size="sm" onClick={startReview}>
            Review due
          </Button>
        </div>
      )}

      <div className="tablet-grid items-start">
        <div className="tablet-main order-2 space-y-4 md:order-1 md:space-y-6">
          {isLineComplete ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-green-300 bg-green-50 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-green-600" />
                <div>
                  <p className="text-base font-semibold text-green-900">Line complete!</p>
                  <p className="text-sm text-green-700">
                    {remainingDueLines > 0
                      ? `${remainingDueLines} line${remainingDueLines === 1 ? '' : 's'} still due.`
                      : 'All lines reviewed for now.'}
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
            onSquareTap={(square) => void handleSquareTap(square)}
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
                    {trainingState?.feedback === 'complete' ? 'Next Line' : 'Reset Drill'}
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
                </div>
              </div>
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
                            {summary && summary.dueLines > 0 ? (
                              <span className="font-medium text-blue-700">
                                {summary.dueLines} due
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
        onSelect={(piece) => void handlePromotionChoice(piece)}
        onCancel={() => setPendingPromotion(null)}
      />
    </div>
  );
}
