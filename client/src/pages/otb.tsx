import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import OtbBoard from '@/components/otb/otb-board';
import OtbMoveList from '@/components/otb/otb-move-list';
import OtbGameList from '@/components/otb/otb-game-list';
import PromotionPicker from '@/components/otb/promotion-picker';
import { offlineStorage } from '@/lib/offline-storage';
import {
  applyMove,
  getActiveColor,
  getLegalDestinations,
  getPieceMap,
  moveNeedsPromotion,
  undoLastMove,
} from '@/lib/otb/chess';
import { buildPgn, getPgnFilename } from '@/lib/otb/pgn';
import { upsertOtbSession } from '@/lib/otb/session-bridge';
import type { OtbGame, PromotionPiece, Square } from '@/lib/otb/types';

interface PendingPromotion {
  from: Square;
  to: Square;
}

function sortGames(games: OtbGame[]): OtbGame[] {
  return [...games].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function toInputDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return format(new Date(), 'yyyy-MM-dd');
  }
  return format(parsed, 'yyyy-MM-dd');
}

function fromInputDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date().toISOString();
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12, 0, 0);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export default function OtbPage() {
  const { toast } = useToast();
  const [games, setGames] = useState<OtbGame[]>([]);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [isBoardFlipped, setIsBoardFlipped] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const activeGame = useMemo(
    () => games.find((game) => game.id === activeGameId) ?? null,
    [games, activeGameId],
  );

  const persistGame = useCallback(async (nextGame: OtbGame) => {
    const saved = await offlineStorage.saveOtbGame(nextGame);
    setGames((previous) => sortGames([saved, ...previous.filter((game) => game.id !== saved.id)]));
    return saved;
  }, []);

  useEffect(() => {
    const load = async () => {
      const stored = await offlineStorage.getOtbGames();
      if (stored.length === 0) {
        const created = await offlineStorage.createOtbGame();
        setGames([created]);
        setActiveGameId(created.id);
        return;
      }

      setGames(stored);
      setActiveGameId(stored[0].id);
    };

    void load();
  }, []);

  const clearSelection = () => {
    setSelectedSquare(null);
    setLegalTargets([]);
  };

  const applySelectedMove = useCallback(
    async (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (!activeGame) {
        return;
      }

      const result = applyMove(activeGame, from, to, promotion);
      if (!result.applied) {
        if (result.promotionRequired) {
          setPendingPromotion({ from, to });
          return;
        }

        toast({
          title: 'Move rejected',
          description: result.error || 'That move is not legal in this position.',
          variant: 'destructive',
        });
        clearSelection();
        return;
      }

      const saved = await persistGame(result.game);
      if (saved.status === 'finished') {
        toast({
          title: 'Game over',
          description: 'Set the final result and sync it to Activity when ready.',
        });
      }
      clearSelection();
    },
    [activeGame, persistGame, toast],
  );

  const handleSquareTap = async (square: Square) => {
    if (!activeGame || pendingPromotion) {
      return;
    }

    const pieceMap = getPieceMap(activeGame);
    const activeColor = getActiveColor(activeGame);
    const tappedPiece = pieceMap[square];

    if (!selectedSquare) {
      if (!tappedPiece || tappedPiece.color !== activeColor) {
        return;
      }
      const destinations = getLegalDestinations(activeGame, square);
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
        const destinations = getLegalDestinations(activeGame, square);
        setSelectedSquare(destinations.length ? square : null);
        setLegalTargets(destinations);
      } else {
        clearSelection();
      }
      return;
    }

    if (moveNeedsPromotion(activeGame, selectedSquare, square)) {
      setPendingPromotion({ from: selectedSquare, to: square });
      return;
    }

    await applySelectedMove(selectedSquare, square);
  };

  const handlePromotionChoice = async (piece: PromotionPiece) => {
    if (!pendingPromotion) {
      return;
    }

    await applySelectedMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  };

  const handleUpdateGame = async (patch: Partial<OtbGame>) => {
    if (!activeGame) {
      return;
    }
    await persistGame({
      ...activeGame,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUndo = async () => {
    if (!activeGame || activeGame.moves.length === 0) {
      return;
    }

    const updated = undoLastMove(activeGame);
    await persistGame(updated);
    clearSelection();
  };

  const handleReset = async () => {
    if (!activeGame) {
      return;
    }
    const reset = await offlineStorage.resetOtbGame(activeGame.id);
    if (!reset) {
      return;
    }
    setGames((previous) => sortGames([reset, ...previous.filter((game) => game.id !== reset.id)]));
    clearSelection();
    toast({ title: 'Board reset', description: 'All moves were cleared for this game.' });
  };

  const handleCreateGame = async () => {
    const created = await offlineStorage.createOtbGame();
    setGames((previous) => sortGames([created, ...previous]));
    setActiveGameId(created.id);
    clearSelection();
    toast({ title: 'New OTB game', description: 'Started a new game from the initial position.' });
  };

  const handleDeleteGame = async (id: string) => {
    const target = games.find((game) => game.id === id);
    if (!target) {
      return;
    }

    if (!window.confirm('Delete this OTB game?')) {
      return;
    }

    await offlineStorage.deleteOtbGame(id);
    const remaining = games.filter((game) => game.id !== id);
    if (remaining.length === 0) {
      const created = await offlineStorage.createOtbGame();
      setGames([created]);
      setActiveGameId(created.id);
    } else {
      setGames(sortGames(remaining));
      if (activeGameId === id) {
        setActiveGameId(remaining[0].id);
      }
    }
    clearSelection();
  };

  const handleCopyPgn = async () => {
    if (!activeGame) {
      return;
    }

    try {
      const pgn = buildPgn(activeGame);
      await navigator.clipboard.writeText(pgn);
      toast({ title: 'PGN copied', description: 'PGN copied to your clipboard.' });
    } catch (error) {
      toast({
        title: 'Copy failed',
        description: error instanceof Error ? error.message : 'Unable to copy PGN.',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadPgn = () => {
    if (!activeGame) {
      return;
    }

    try {
      const pgn = buildPgn(activeGame);
      const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = getPgnFilename(activeGame);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast({ title: 'PGN downloaded', description: 'Your .pgn file has been downloaded.' });
    } catch (error) {
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Unable to download PGN.',
        variant: 'destructive',
      });
    }
  };

  const handleSyncSession = async () => {
    if (!activeGame) {
      return;
    }

    try {
      const sessionId = await upsertOtbSession(activeGame);
      await handleUpdateGame({ linkedSessionId: sessionId });
      toast({
        title: activeGame.linkedSessionId ? 'Activity updated' : 'Activity created',
        description: 'Game summary is now available in Activity and statistics.',
      });
    } catch (error) {
      toast({
        title: 'Sync failed',
        description: error instanceof Error ? error.message : 'Unable to sync this game.',
        variant: 'destructive',
      });
    }
  };

  const pieceMap = useMemo(() => (activeGame ? getPieceMap(activeGame) : {}), [activeGame]);
  const activeColor = useMemo(() => (activeGame ? getActiveColor(activeGame) : 'w'), [activeGame]);

  return (
    <div className="page-stack">
      <div className="py-3 text-center md:py-4">
        <h2 className="mb-2 text-2xl font-bold text-gray-800 md:text-3xl">OTB Board Logger</h2>
        <p className="text-sm text-gray-600">
          Tap squares to record your over-the-board game. Note: no engine or analysis, logging only.
        </p>
      </div>

      {!activeGame ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-600">Loading OTB games...</p>
          </CardContent>
        </Card>
      ) : (
        <div className="tablet-grid items-start">
          <div className="tablet-main order-2 space-y-4 md:order-1 md:space-y-6">
            <OtbBoard
              pieceMap={pieceMap}
              selectedSquare={selectedSquare}
              legalTargets={legalTargets}
              isFlipped={isBoardFlipped}
              onSquareTap={(square) => void handleSquareTap(square)}
            />

            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <Label htmlFor="whiteName">White</Label>
                    <Input
                      id="whiteName"
                      value={activeGame.whiteName}
                      onChange={(event) => void handleUpdateGame({ whiteName: event.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="blackName">Black</Label>
                    <Input
                      id="blackName"
                      value={activeGame.blackName}
                      onChange={(event) => void handleUpdateGame({ blackName: event.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="playedAt">Date</Label>
                    <Input
                      id="playedAt"
                      type="date"
                      value={toInputDate(activeGame.playedAt)}
                      onChange={(event) =>
                        void handleUpdateGame({ playedAt: fromInputDate(event.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="playerColor">Your colour</Label>
                    <select
                      id="playerColor"
                      className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      value={activeGame.playerColor || ''}
                      onChange={(event) =>
                        void handleUpdateGame({
                          playerColor:
                            event.target.value === 'white' || event.target.value === 'black'
                              ? event.target.value
                              : null,
                        })
                      }
                    >
                      <option value="">Select colour</option>
                      <option value="white">White</option>
                      <option value="black">Black</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="result">Result</Label>
                    <select
                      id="result"
                      className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      value={activeGame.result}
                      onChange={(event) =>
                        void handleUpdateGame({
                          result:
                            event.target.value === '1-0' ||
                            event.target.value === '0-1' ||
                            event.target.value === '1/2-1/2' ||
                            event.target.value === '*'
                              ? event.target.value
                              : '*',
                        })
                      }
                    >
                      <option value="*">*</option>
                      <option value="1-0">1-0</option>
                      <option value="0-1">0-1</option>
                      <option value="1/2-1/2">1/2-1/2</option>
                    </select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <p className="mt-2 text-sm text-gray-600">
                      Turn: {activeColor === 'w' ? 'White' : 'Black'} • {activeGame.status} • View:{' '}
                      {isBoardFlipped ? 'Black' : 'White'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsBoardFlipped((previous) => !previous)}
                  >
                    Flip Board
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleUndo()}>
                    Undo
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleReset()}>
                    Reset
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleCreateGame()}>
                    New Game
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleDeleteGame(activeGame.id)}
                  >
                    Delete
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleCopyPgn()}>
                    Copy PGN
                  </Button>
                  <Button type="button" variant="outline" onClick={handleDownloadPgn}>
                    Download PGN
                  </Button>
                  <Button type="button" onClick={() => void handleSyncSession()}>
                    {activeGame.linkedSessionId
                      ? 'Update Activity Session'
                      : 'Create Activity Session'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="tablet-side order-1 space-y-4 md:order-2 md:space-y-6">
            <OtbMoveList moves={activeGame.moves} />
            <OtbGameList
              games={games}
              activeGameId={activeGameId}
              onSelectGame={(id) => {
                setActiveGameId(id);
                clearSelection();
              }}
              onDeleteGame={(id) => void handleDeleteGame(id)}
            />
          </div>
        </div>
      )}

      <PromotionPicker
        open={Boolean(pendingPromotion)}
        onSelect={(piece) => void handlePromotionChoice(piece)}
        onCancel={() => setPendingPromotion(null)}
      />
    </div>
  );
}
