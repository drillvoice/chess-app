import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import {
  ArrowLeft,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Cpu,
  ExternalLink,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import OtbBoard, { type BoardArrow } from '@/components/otb/otb-board';
import PromotionPicker from '@/components/otb/promotion-picker';
import { cn } from '@/lib/utils';
import { pieceMapFromFen } from '@/lib/otb/chess';
import type { PromotionPiece, Square } from '@/lib/otb/types';
import { playUci } from '@/lib/focus/lichess-puzzles';
import { solverColor } from '@/lib/focus/puzzle-session';
import { getThemeLabel } from '@/lib/focus/themes';
import { mistakeLine, type MissedPuzzle } from '@/lib/campaign/missed-puzzle';
import { formatScore, uciLineToSan, type EngineLine, type SanMove } from '@/lib/engine/uci';
import { useEngineAnalysis } from '@/hooks/use-engine-analysis';

const ENGINE_PREF_KEY = 'campaign-review-engine';

function loadEnginePref(): boolean {
  try {
    return localStorage.getItem(ENGINE_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveEnginePref(on: boolean) {
  try {
    localStorage.setItem(ENGINE_PREF_KEY, on ? 'on' : 'off');
  } catch {
    // A remembered toggle is a convenience only.
  }
}

/** The line on the board: moves from the puzzle start, and how many are played. */
interface Cursor {
  line: string[];
  ply: number;
}

function startCursor(miss: MissedPuzzle): Cursor {
  // Start on the position where the mistake was made, with the wrong move one step ahead.
  return { line: mistakeLine(miss), ply: miss.ply };
}

function fenAt(startFen: string, line: string[], ply: number): string {
  const chess = new Chess(startFen);
  for (const uci of line.slice(0, ply)) {
    if (!playUci(chess, uci)) break;
  }
  return chess.fen();
}

const sameStart = (a: string[], b: string[], n: number) =>
  a.length >= n && b.length >= n && a.slice(0, n).every((m, i) => m === b[i]);

function squaresOf(uci: string | null | undefined): Square[] {
  return uci ? [uci.slice(0, 2) as Square, uci.slice(2, 4) as Square] : [];
}

/** A row of clickable SAN moves; `activeIndex` is the move just played on the board. */
function MoveChips({
  moves,
  activeIndex,
  onSelect,
  tone = 'default',
  offset = 0,
  compact = false,
}: {
  moves: SanMove[];
  activeIndex: number | null;
  onSelect: (index: number) => void;
  tone?: 'default' | 'mistake';
  /** Index of moves[0] within its line (chips report absolute indices). */
  offset?: number;
  /** One line, clipped at the edge (engine lines), instead of wrapping. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex text-sm',
        compact ? 'flex-nowrap gap-x-0.5 overflow-hidden whitespace-nowrap' : 'flex-wrap gap-1',
      )}
    >
      {moves.map((move, i) => (
        <span key={`${i}-${move.uci}`} className="inline-flex shrink-0 items-center">
          {move.label && <span className="mr-0.5 text-gray-400">{move.label}</span>}
          <button
            type="button"
            onClick={() => onSelect(offset + i)}
            className={cn(
              'rounded font-medium hover:bg-gray-100',
              compact ? 'px-1' : 'px-1.5 py-0.5',
              tone === 'mistake' ? 'text-red-700' : 'text-gray-900',
              activeIndex === offset + i &&
                (tone === 'mistake'
                  ? 'bg-red-100 hover:bg-red-100'
                  : 'bg-blue-100 hover:bg-blue-100'),
            )}
          >
            {move.san}
            {tone === 'mistake' && '?'}
          </button>
        </span>
      ))}
    </div>
  );
}

function EngineLines({
  fen,
  lines,
  onPlay,
}: {
  fen: string;
  lines: EngineLine[];
  onPlay: (moves: string[]) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {lines.map((line) => {
        const san = uciLineToSan(fen, line.pv, 10);
        const whiteBetter = line.mate !== null ? line.mate > 0 : (line.cp ?? 0) >= 0;
        return (
          <li key={line.multipv} className="flex items-center gap-2">
            <span
              className={cn(
                'w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-bold tabular-nums',
                whiteBetter
                  ? 'bg-white text-gray-900 ring-1 ring-gray-300'
                  : 'bg-gray-800 text-white',
              )}
            >
              {formatScore(line)}
            </span>
            <div className="min-w-0 flex-1">
              <MoveChips
                moves={san}
                compact
                activeIndex={null}
                onSelect={(i) => onPlay(line.pv.slice(0, i + 1))}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface Props {
  misses: MissedPuzzle[];
  /** Shown above the board, e.g. the trial name. */
  title: string;
  onClose: () => void;
}

/**
 * Post-run review of missed puzzles, in the spirit of the Lichess puzzle page:
 * step through the solution, compare it with the move you played, try your own
 * moves on the board, and ask Stockfish for its best lines in any position.
 */
export default function MistakeReview({ misses, title, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const miss = misses[index];
  const [cursor, setCursor] = useState<Cursor>(() => startCursor(misses[0]));
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(
    null,
  );
  const [engineOn, setEngineOn] = useState(loadEnginePref);

  const { puzzle } = miss;
  const solution = puzzle.solution;
  const fen = useMemo(
    () => fenAt(puzzle.fen, cursor.line, cursor.ply),
    [puzzle.fen, cursor.line, cursor.ply],
  );
  const chess = useMemo(() => new Chess(fen), [fen]);
  const engine = useEngineAnalysis(fen, { enabled: engineOn });

  const goToMiss = (next: number) => {
    setIndex(next);
    setCursor(startCursor(misses[next]));
    setSelected(null);
  };

  const step = useCallback((delta: number) => {
    setSelected(null);
    setCursor((c) => ({ ...c, ply: Math.max(0, Math.min(c.line.length, c.ply + delta)) }));
  }, []);
  const jump = useCallback((ply: number) => {
    setSelected(null);
    setCursor((c) => ({ ...c, ply: Math.max(0, Math.min(c.line.length, ply)) }));
  }, []);

  /** Play moves from the current position, following the line if they match it. */
  const playMoves = useCallback((moves: string[]) => {
    setSelected(null);
    setCursor((c) => {
      const prefix = c.line.slice(0, c.ply);
      const follows = moves.every((m, i) => c.line[c.ply + i] === m);
      const line = follows ? c.line : [...prefix, ...moves];
      return { line, ply: c.ply + moves.length };
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === 'ArrowRight') step(1);
      else if (event.key === 'ArrowUp' || event.key === 'Home') jump(0);
      else if (event.key === 'ArrowDown' || event.key === 'End') jump(Number.MAX_SAFE_INTEGER);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, jump]);

  const legalTargets = useMemo<Square[]>(() => {
    if (!selected) return [];
    return chess.moves({ square: selected, verbose: true }).map((m) => m.to as Square);
  }, [chess, selected]);

  const onSquareTap = (square: Square) => {
    if (selected && legalTargets.includes(square)) {
      const needsPromotion = chess
        .moves({ square: selected, verbose: true })
        .some((m) => m.to === square && m.promotion);
      if (needsPromotion) setPendingPromotion({ from: selected, to: square });
      else playMoves([`${selected}${square}`]);
      return;
    }
    const piece = chess.get(square);
    setSelected(piece && piece.color === chess.turn() ? square : null);
  };

  const myColor = solverColor(puzzle);
  const lastMove = cursor.ply > 0 ? cursor.line[cursor.ply - 1] : puzzle.lastMove;
  const yourLine = useMemo(() => mistakeLine(miss), [miss]);
  const onYourMove =
    miss.wrongMove !== null &&
    cursor.ply === yourLine.length &&
    sameStart(cursor.line, yourLine, yourLine.length);
  const onSolution = sameStart(cursor.line, solution, cursor.ply);

  const solutionSan = useMemo(() => uciLineToSan(puzzle.fen, solution), [puzzle.fen, solution]);
  const yourSan = useMemo(
    () => uciLineToSan(puzzle.fen, yourLine).slice(miss.ply),
    [puzzle.fen, yourLine, miss.ply],
  );
  const correctSan = solutionSan[miss.ply]?.san ?? '';
  const wrongSan = yourSan[0]?.san ?? '';
  const exploring = !onSolution && !onYourMove && !sameStart(cursor.line, yourLine, cursor.ply);
  const exploreSan = useMemo(() => {
    if (!exploring) return null;
    // Show the exploration from where it leaves the solution.
    let from = 0;
    while (from < cursor.line.length && cursor.line[from] === solution[from]) from++;
    return { from, moves: uciLineToSan(puzzle.fen, cursor.line).slice(from) };
  }, [exploring, cursor.line, solution, puzzle.fen]);

  // Best move in green, the alternatives fainter in blue (one arrow per distinct move).
  const arrows: BoardArrow[] = engine.lines
    .map((line) => line.pv[0])
    .filter((move, i, all): move is string => !!move && all.indexOf(move) === i)
    .map((move, i) => ({
      from: move.slice(0, 2) as Square,
      to: move.slice(2, 4) as Square,
      color: i === 0 ? '#15781b' : '#003088',
      opacity: i === 0 ? 0.8 : 0.4,
    }));

  const sideToMove = chess.turn() === 'w' ? 'White' : 'Black';
  const themes = puzzle.themes.map(getThemeLabel).join(', ');

  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} className="-ml-2">
          <ArrowLeft className="mr-1 h-4 w-4" /> Results
        </Button>
        <div className="min-w-0 text-sm text-gray-500">{title}</div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-2">
          <OtbBoard
            pieceMap={pieceMapFromFen(fen)}
            selectedSquare={selected}
            legalTargets={legalTargets}
            isFlipped={myColor === 'b'}
            isTableMode={false}
            onSquareTap={onSquareTap}
            highlightSquares={onYourMove ? [] : squaresOf(lastMove)}
            mistakeSquares={onYourMove ? squaresOf(miss.wrongMove) : []}
            arrows={arrows}
          />
          <div className="mx-auto flex max-w-lg justify-center gap-1">
            <Button variant="outline" size="sm" onClick={() => jump(0)} aria-label="First move">
              <ChevronFirst className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => step(-1)} aria-label="Previous move">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => step(1)} aria-label="Next move">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => jump(Number.MAX_SAFE_INTEGER)}
              aria-label="Last move"
            >
              <ChevronLast className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4 pt-4 md:p-4 md:pt-4">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-bold text-gray-900">
                Mistake {index + 1} of {misses.length}
              </h1>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => goToMiss(index - 1)}
                  aria-label="Previous mistake"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={index === misses.length - 1}
                  onClick={() => goToMiss(index + 1)}
                  aria-label="Next mistake"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1 text-sm text-gray-700">
              {miss.wrongMove ? (
                <p>
                  You played <strong className="text-red-700">{wrongSan}</strong>. The move was{' '}
                  <strong className="text-green-700">{correctSan}</strong>.
                </p>
              ) : (
                <p>
                  {miss.reason === 'away'
                    ? 'You left the app on this one.'
                    : 'You skipped this one.'}{' '}
                  The move was <strong className="text-green-700">{correctSan}</strong>.
                </p>
              )}
              <p className="text-xs text-gray-500">
                {puzzle.rating != null && `Rated ${puzzle.rating}`}
                {puzzle.rating != null && themes && ' · '}
                {themes}
              </p>
            </div>

            <div className="space-y-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Solution
                </div>
                <MoveChips
                  moves={solutionSan}
                  activeIndex={onSolution && cursor.ply > 0 ? cursor.ply - 1 : null}
                  onSelect={(i) => {
                    setSelected(null);
                    setCursor({ line: solution, ply: i + 1 });
                  }}
                />
              </div>
              {miss.wrongMove && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Your move
                  </div>
                  <MoveChips
                    moves={yourSan}
                    offset={miss.ply}
                    tone="mistake"
                    activeIndex={onYourMove ? miss.ply : null}
                    onSelect={() => {
                      setSelected(null);
                      setCursor({ line: yourLine, ply: yourLine.length });
                    }}
                  />
                </div>
              )}
              {exploreSan && exploreSan.moves.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <span>Your analysis</span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-normal normal-case text-gray-500 hover:text-gray-800"
                      onClick={() => setCursor(startCursor(miss))}
                    >
                      <RotateCcw className="h-3 w-3" /> Reset
                    </button>
                  </div>
                  <MoveChips
                    moves={exploreSan.moves}
                    offset={exploreSan.from}
                    activeIndex={cursor.ply - 1}
                    onSelect={(i) => jump(i + 1)}
                  />
                </div>
              )}
              <p className="text-xs text-gray-500">
                {sideToMove} to move. Tap pieces to try your own moves; use ← → to step.
              </p>
            </div>

            <div className="space-y-2 border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="review-engine"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900"
                >
                  <Cpu className="h-4 w-4" /> Stockfish
                </label>
                <div className="flex items-center gap-2">
                  {engineOn && engine.status !== 'error' && engine.status !== 'game-over' && (
                    <span className="text-xs tabular-nums text-gray-500">
                      {engine.status === 'loading' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        `depth ${engine.depth}/${engine.maxDepth}`
                      )}
                    </span>
                  )}
                  <Switch
                    id="review-engine"
                    checked={engineOn}
                    onCheckedChange={(on) => {
                      setEngineOn(on);
                      saveEnginePref(on);
                    }}
                  />
                </div>
              </div>
              {engineOn &&
                (engine.status === 'error' ? (
                  <p role="alert" className="text-sm text-red-600">
                    {engine.error}
                  </p>
                ) : engine.status === 'game-over' ? (
                  <p className="text-sm text-gray-600">{engine.gameOver}.</p>
                ) : engine.lines.length === 0 ? (
                  <p className="text-sm text-gray-500">Starting the engine…</p>
                ) : (
                  <>
                    {onYourMove && (
                      <p className="text-xs text-gray-600">
                        This is the position after your move. The top line shows how it gets
                        punished.
                      </p>
                    )}
                    <EngineLines fen={fen} lines={engine.lines} onPlay={playMoves} />
                  </>
                ))}
              {!engineOn && (
                <p className="text-xs text-gray-500">
                  Turn on to see the engine’s best lines for the position on the board.
                </p>
              )}
            </div>

            <a
              href={`https://lichess.org/training/${puzzle.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
            >
              Open this puzzle on Lichess <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      </div>
      <PromotionPicker
        open={pendingPromotion !== null}
        onSelect={(piece: PromotionPiece) => {
          if (pendingPromotion)
            playMoves([`${pendingPromotion.from}${pendingPromotion.to}${piece}`]);
          setPendingPromotion(null);
        }}
        onCancel={() => setPendingPromotion(null)}
      />
    </div>
  );
}
