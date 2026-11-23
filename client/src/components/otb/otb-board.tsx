import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { PieceView } from '@/lib/otb/chess';
import type { Square } from '@/lib/otb/types';
import ChessPiece from './chess-pieces';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

function isDarkSquare(square: Square): boolean {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]) - 1;
  return (file + rank) % 2 === 0;
}

/** An arrow drawn over the board, e.g. an engine's suggested move. */
export interface BoardArrow {
  from: Square;
  to: Square;
  /** Any CSS colour; defaults to Lichess-style green. */
  color?: string;
  /** 0–1, defaults to 0.8. Fainter arrows read as secondary suggestions. */
  opacity?: number;
}

const DEFAULT_ARROW = '#15781b';

/** Centre of a square in board units (0–8), as drawn from the viewer's side. */
function squareCentre(square: Square, isFlipped: boolean): [number, number] {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]) - 1;
  return isFlipped ? [7 - file + 0.5, rank + 0.5] : [file + 0.5, 7 - rank + 0.5];
}

function ArrowLayer({ arrows, isFlipped }: { arrows: BoardArrow[]; isFlipped: boolean }) {
  const id = useId();
  const colors = Array.from(new Set(arrows.map((a) => a.color ?? DEFAULT_ARROW)));
  const markerId = (color: string) => `${id}-head-${colors.indexOf(color)}`;
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 8 8"
      aria-hidden="true"
    >
      <defs>
        {colors.map((color) => (
          <marker
            key={color}
            id={markerId(color)}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="2.6"
            markerHeight="2.6"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={color} />
          </marker>
        ))}
      </defs>
      {arrows.map((arrow, i) => {
        const color = arrow.color ?? DEFAULT_ARROW;
        const [x1, y1] = squareCentre(arrow.from, isFlipped);
        const [x2, y2] = squareCentre(arrow.to, isFlipped);
        const length = Math.hypot(x2 - x1, y2 - y1);
        if (length === 0) return null;
        // Stop short so the arrowhead tip lands near the target square's centre.
        const shorten = 0.35 / length;
        return (
          <line
            key={`${arrow.from}${arrow.to}${i}`}
            x1={x1}
            y1={y1}
            x2={x2 - (x2 - x1) * shorten}
            y2={y2 - (y2 - y1) * shorten}
            stroke={color}
            strokeWidth={0.16}
            strokeLinecap="round"
            opacity={arrow.opacity ?? 0.8}
            markerEnd={`url(#${markerId(color)})`}
          />
        );
      })}
    </svg>
  );
}

interface OtbBoardProps {
  pieceMap: Record<string, PieceView>;
  selectedSquare: Square | null;
  legalTargets: Square[];
  isFlipped: boolean;
  isTableMode: boolean;
  onSquareTap: (square: Square) => void;
  /** Squares to tint, e.g. the from/to of the last move. */
  highlightSquares?: Square[];
  /** Arrows drawn over the pieces (they don't block taps). */
  arrows?: BoardArrow[];
  /** Squares to mark as a mistake (red tint), e.g. a wrong move under review. */
  mistakeSquares?: Square[];
}

export default function OtbBoard({
  pieceMap,
  selectedSquare,
  legalTargets,
  isFlipped,
  isTableMode,
  onSquareTap,
  highlightSquares = [],
  arrows = [],
  mistakeSquares = [],
}: OtbBoardProps) {
  const files = isFlipped ? [...FILES].reverse() : FILES;
  const ranks = isFlipped ? [...RANKS].reverse() : RANKS;
  const bottomRank = ranks[ranks.length - 1];
  const rightFile = files[files.length - 1];

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-3">
      {/* touch-manipulation: taps register instantly (no double-tap-zoom wait), and quick
          taps on the same square can't zoom the page. */}
      <div className="relative mx-auto grid max-w-lg touch-manipulation select-none grid-cols-8 gap-0 overflow-hidden rounded-md border border-gray-300">
        {ranks.flatMap((rank, rankIndex) =>
          files.map((file) => {
            const square = `${file}${rank}` as Square;
            const piece = pieceMap[square];
            const darkSquare = isDarkSquare(square);
            const isSelected = selectedSquare === square;
            const isLegalTarget = legalTargets.includes(square);
            const isHighlighted = highlightSquares.includes(square);
            const isMistake = mistakeSquares.includes(square);
            const rotatePiece = isTableMode && rankIndex < 4;
            const showFileCoordinate = rank === bottomRank;
            const showRankCoordinate = file === rightFile;

            return (
              <button
                key={square}
                type="button"
                className={cn(
                  'relative flex aspect-square w-full items-center justify-center overflow-hidden',
                  darkSquare ? 'bg-[#b58863]' : 'bg-[#f0d9b5]',
                  isHighlighted && (darkSquare ? 'bg-[#aaa23a]' : 'bg-[#cdd26a]'),
                  isMistake && (darkSquare ? 'bg-[#c0644f]' : 'bg-[#e8907c]'),
                  isSelected && 'ring-4 ring-inset ring-blue-500',
                )}
                onClick={() => onSquareTap(square)}
                aria-label={`Square ${square}`}
              >
                {piece && (
                  <div
                    className={cn(
                      'pointer-events-none absolute inset-[6%]',
                      rotatePiece && 'rotate-180',
                    )}
                  >
                    <ChessPiece color={piece.color} type={piece.type} />
                  </div>
                )}
                {showFileCoordinate && (
                  <span
                    className={cn(
                      'pointer-events-none absolute bottom-0.5 left-1 text-[10px] font-semibold leading-none',
                      darkSquare ? 'text-[#f1dfbf]/90' : 'text-[#8b6a51]',
                    )}
                  >
                    {file}
                  </span>
                )}
                {showRankCoordinate && (
                  <span
                    className={cn(
                      'pointer-events-none absolute right-1 top-0.5 text-[10px] font-semibold leading-none',
                      darkSquare ? 'text-[#f1dfbf]/90' : 'text-[#8b6a51]',
                    )}
                  >
                    {rank}
                  </span>
                )}
                {isLegalTarget && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="h-3 w-3 rounded-full bg-blue-600/70" />
                  </span>
                )}
              </button>
            );
          }),
        )}
        {arrows.length > 0 && <ArrowLayer arrows={arrows} isFlipped={isFlipped} />}
      </div>
    </div>
  );
}
