import { cn } from '@/lib/utils';
import type { PieceView } from '@/lib/otb/chess';
import type { Square } from '@/lib/otb/types';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

const UNICODE_PIECES: Record<'w' | 'b', Record<string, string>> = {
  // Use filled glyphs for both colors and colorize via CSS so white pieces
  // are not rendered as hollow outlines.
  w: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

function isDarkSquare(square: Square): boolean {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]) - 1;
  return (file + rank) % 2 === 1;
}

interface OtbBoardProps {
  pieceMap: Record<string, PieceView>;
  selectedSquare: Square | null;
  legalTargets: Square[];
  isFlipped: boolean;
  onSquareTap: (square: Square) => void;
}

export default function OtbBoard({
  pieceMap,
  selectedSquare,
  legalTargets,
  isFlipped,
  onSquareTap,
}: OtbBoardProps) {
  const files = isFlipped ? [...FILES].reverse() : FILES;
  const ranks = isFlipped ? [...RANKS].reverse() : RANKS;
  const bottomRank = ranks[ranks.length - 1];
  const rightFile = files[files.length - 1];

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-3">
      <div className="mx-auto grid max-w-lg grid-cols-8 gap-0 overflow-hidden rounded-md border border-gray-300">
        {ranks.flatMap((rank) =>
          files.map((file) => {
            const square = `${file}${rank}` as Square;
            const piece = pieceMap[square];
            const darkSquare = isDarkSquare(square);
            const isSelected = selectedSquare === square;
            const isLegalTarget = legalTargets.includes(square);
            const showFileCoordinate = rank === bottomRank;
            const showRankCoordinate = file === rightFile;

            return (
              <button
                key={square}
                type="button"
                className={cn(
                  'relative flex aspect-square w-full items-center justify-center overflow-hidden transition-colors',
                  darkSquare ? 'bg-[#b58863]' : 'bg-[#f0d9b5]',
                  isSelected && 'ring-4 ring-inset ring-blue-500',
                )}
                onClick={() => onSquareTap(square)}
                aria-label={`Square ${square}`}
              >
                <span
                  className={cn(
                    'pointer-events-none select-none text-[2.7rem] font-semibold leading-[0.82] sm:text-[3.35rem]',
                    piece?.color === 'w'
                      ? 'text-[#f8f8f8] [-webkit-text-stroke:0.9px_#181818]'
                      : 'text-[#111111]',
                  )}
                >
                  {piece ? UNICODE_PIECES[piece.color][piece.type] : ''}
                </span>
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
      </div>
    </div>
  );
}
