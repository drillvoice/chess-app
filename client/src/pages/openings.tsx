import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import OtbBoard from '@/components/otb/otb-board';
import PromotionPicker from '@/components/otb/promotion-picker';
import { offlineStorage } from '@/lib/offline-storage';
import {
  applyTrainerMove,
  expectedMoveSan,
  getLegalDestinationsFromFen,
  getPieceMapFromFen,
  moveNeedsPromotionFromFen,
  startOpeningTraining,
} from '@/lib/opening-trainer/engine';
import { parseOpeningRepertoirePgn } from '@/lib/opening-trainer/parser';
import type {
  OpeningRepertoire,
  OpeningTrainerSide,
  OpeningTrainingState,
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

function repertoireMoveCount(repertoire: OpeningRepertoire): number {
  return Math.max(0, Object.keys(repertoire.nodes).length - 1);
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
  const [pgnText, setPgnText] = useState('');

  const activeRepertoire = useMemo(
    () => repertoires.find((repertoire) => repertoire.id === activeRepertoireId) ?? null,
    [activeRepertoireId, repertoires],
  );

  useEffect(() => {
    const load = async () => {
      const stored = await offlineStorage.getOpeningRepertoires();
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
    const saved = await offlineStorage.saveOpeningRepertoire(repertoire);
    setRepertoires((previous) =>
      sortRepertoires([saved, ...previous.filter((item) => item.id !== saved.id)]),
    );
    setActiveRepertoireId(saved.id);
    return saved;
  }, []);

  const startTraining = useCallback((repertoire: OpeningRepertoire) => {
    setTrainingState(startOpeningTraining(repertoire));
    setIsBoardFlipped(repertoire.side === 'black');
    clearSelection();
  }, []);

  const handleImport = async () => {
    try {
      const repertoire = parseOpeningRepertoirePgn(pgnText, importSide, importName);
      const saved = await persistRepertoire(repertoire);
      startTraining(saved);
      setImportName('');
      setPgnText('');
      toast({
        title: 'Repertoire imported',
        description: `${repertoireMoveCount(saved)} moves are ready for training.`,
      });
    } catch (error) {
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
    if (activeRepertoire) {
      startTraining(activeRepertoire);
    }
  };

  const handleDelete = async (id: string) => {
    const target = repertoires.find((repertoire) => repertoire.id === id);
    if (!target || !window.confirm(`Delete "${target.name}"?`)) {
      return;
    }

    await offlineStorage.deleteOpeningRepertoire(id);
    const remaining = repertoires.filter((repertoire) => repertoire.id !== id);
    setRepertoires(remaining);
    setActiveRepertoireId(remaining[0]?.id ?? null);
    setTrainingState(null);
    clearSelection();
  };

  const applyMove = async (from: Square, to: Square, promotion?: PromotionPiece) => {
    if (!trainingState) {
      return;
    }

    const result = applyTrainerMove(trainingState, from, to, promotion);
    const saved = await persistRepertoire(result.state.repertoire);
    const nextState = { ...result.state, repertoire: saved };
    setTrainingState(nextState);
    clearSelection();

    if (result.promotionRequired) {
      setPendingPromotion({ from, to });
      return;
    }

    if (result.correct) {
      toast({ title: 'Correct', description: 'The trainer picked the next branch.' });
      return;
    }

    if (nextState.feedback === 'revealed') {
      toast({
        title: 'Move revealed',
        description: result.message || `Correct move: ${expectedMoveSan(nextState)}`,
        variant: 'destructive',
      });
      return;
    }

    if (nextState.feedback === 'complete') {
      toast({ title: 'Line complete', description: 'Start again to drill another branch.' });
      return;
    }

    toast({
      title: 'Try again',
      description: 'That move is in the wrong branch for this position.',
      variant: 'destructive',
    });
  };

  const handleSquareTap = async (square: Square) => {
    if (!trainingState || pendingPromotion || trainingState.feedback === 'complete') {
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
      return 'Line complete.';
    }
    if (trainingState.feedback === 'revealed') {
      return `Replay: ${expectedMoveSan(trainingState) ?? 'the revealed move'}`;
    }
    if (trainingState.feedback === 'incorrect') {
      return 'Try again.';
    }
    return `${trainingState.repertoire.side === 'white' ? 'White' : 'Black'} to train.`;
  }, [trainingState]);

  return (
    <div className="page-stack">
      <div className="py-3 text-center md:py-4">
        <h2 className="mb-2 text-2xl font-bold text-gray-800 md:text-3xl">
          Opening Repertoire Trainer
        </h2>
        <p className="text-sm text-gray-600">
          Drill branches from a PGN without seeing the line name during practice.
        </p>
      </div>

      <div className="tablet-grid items-start">
        <div className="tablet-main order-2 space-y-4 md:order-1 md:space-y-6">
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
                    Reset Drill
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

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-gray-600" />
                <h3 className="text-base font-semibold text-gray-800">Import PGN</h3>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <Label htmlFor="repertoireName">Name</Label>
                  <Input
                    id="repertoireName"
                    value={importName}
                    onChange={(event) => setImportName(event.target.value)}
                    placeholder="Caro-Kann repertoire"
                  />
                </div>
                <div>
                  <Label htmlFor="trainingSide">Your side</Label>
                  <select
                    id="trainingSide"
                    className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={importSide}
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
              <Button type="button" onClick={() => void handleImport()} disabled={!pgnText.trim()}>
                Import Repertoire
              </Button>
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
                  {repertoires.map((repertoire) => (
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
                          {repertoireMoveCount(repertoire)} moves
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
                          onClick={() => void handleDelete(repertoire.id)}
                          aria-label={`Delete ${repertoire.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <PromotionPicker
        open={Boolean(pendingPromotion)}
        onSelect={(piece) => void handlePromotionChoice(piece)}
        onCancel={() => setPendingPromotion(null)}
      />
    </div>
  );
}
