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

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-3">
      <div className="mx-auto grid max-w-lg grid-cols-8 gap-0 overflow-hidden rounded-md border border-gray-300">
        {ranks.flatMap((rank) =>
          files.map((file) => {
            const square = `${file}${rank}` as Square;
            const piece = pieceMap[square];
            const isSelected = selectedSquare === square;
            const isLegalTarget = legalTargets.includes(square);

            return (
              <button
                key={square}
                type="button"
                className={cn(
                  'relative aspect-square w-full text-2xl transition-colors sm:text-3xl',
                  isDarkSquare(square) ? 'bg-[#b58863]' : 'bg-[#f0d9b5]',
                  isSelected && 'ring-4 ring-inset ring-blue-500',
                )}
                onClick={() => onSquareTap(square)}
                aria-label={`Square ${square}`}
              >
                <span
                  className={cn(
                    'pointer-events-none select-none text-[2.15rem] leading-none sm:text-[2.6rem]',
                    piece?.color === 'w'
                      ? 'text-slate-100 [text-shadow:0_1px_1px_rgba(0,0,0,0.8)]'
                      : 'text-slate-900 [text-shadow:0_1px_1px_rgba(255,255,255,0.15)]',
                  )}
                >
                  {piece ? UNICODE_PIECES[piece.color][piece.type] : ''}
                </span>
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
