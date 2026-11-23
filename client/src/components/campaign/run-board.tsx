import type { ReactNode } from 'react';
import { Clock, Loader2, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import OtbBoard from '@/components/otb/otb-board';
import PromotionPicker from '@/components/otb/promotion-picker';
import { pieceMapFromFen } from '@/lib/otb/chess';
import type { Square } from '@/lib/otb/types';
import { formatDuration } from '@/lib/focus/format-duration';
import { getThemeLabel } from '@/lib/focus/themes';
import { solutionSan } from '@/lib/focus/puzzle-session';
import type { RunFlash, TimedPuzzleRun } from '@/hooks/use-timed-puzzle-run';

const FLASH_COLOR: Record<RunFlash, string> = {
  find: 'text-gray-700',
  correct: 'text-green-700',
  solved: 'text-green-700',
  missed: 'text-red-600',
};

interface Props {
  run: TimedPuzzleRun;
  title: string;
  /** Progress bar and counts shown under the title. */
  progress: ReactNode;
  /** For mixed-theme runs: themes to name once a puzzle is over (hidden while solving). */
  revealThemesFrom?: string[];
}

/** Board and side panel for a running trial or placement round. */
export default function RunBoard({ run, title, progress, revealThemesFrom }: Props) {
  const { state, flash, remainingMs, myColor } = run;
  const sideName = myColor === 'w' ? 'White' : 'Black';
  // After a miss the board shows the move that should have been played.
  const missedMove =
    flash === 'missed' && state && state.ply > 0 ? solutionSan(state.puzzle)[state.ply - 1] : null;
  const flashText: Record<RunFlash, string> = {
    find: revealThemesFrom ? `${sideName} to move — find the tactic.` : `${sideName} to move.`,
    correct: 'Correct — keep going.',
    solved: 'Solved!',
    missed: missedMove ? `Missed — it was ${missedMove}.` : 'Missed.',
  };
  const lastMoveSquares = state?.lastMove
    ? ([state.lastMove.slice(0, 2), state.lastMove.slice(2, 4)] as Square[])
    : [];

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {state ? (
          <OtbBoard
            pieceMap={pieceMapFromFen(state.fen)}
            selectedSquare={run.selected}
            legalTargets={run.legalTargets}
            isFlipped={myColor === 'b'}
            isTableMode={false}
            onSquareTap={run.onSquareTap}
            highlightSquares={lastMoveSquares}
          />
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-lg bg-gray-100">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        )}
        <Card>
          <CardContent className="space-y-4 p-4 pt-4 md:p-4 md:pt-4">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-bold text-gray-900">{title}</h1>
              <span
                className={`inline-flex items-center gap-1 text-2xl font-bold tabular-nums ${
                  remainingMs < 30_000 ? 'text-red-600' : 'text-gray-900'
                }`}
                aria-label="Time left"
              >
                <Clock className="h-5 w-5" />
                {formatDuration(remainingMs)}
              </span>
            </div>
            {progress}
            <p className={`text-lg font-semibold ${FLASH_COLOR[flash]}`} aria-live="polite">
              {flashText[flash]}
            </p>
            {flash === 'missed' && (
              <p className="-mt-2 text-sm text-gray-500">
                You can go through it with the engine after the run.
              </p>
            )}
            {revealThemesFrom && state && state.status !== 'playing' && (
              <p className="text-sm text-gray-500">
                Theme:{' '}
                {state.puzzle.themes
                  .filter((t) => revealThemesFrom.includes(t))
                  .map(getThemeLabel)
                  .join(', ') || '—'}
              </p>
            )}
            <div className="text-xs text-gray-500">
              Puzzle {run.index + 1}
              {state?.puzzle.rating != null && ` · rated ${state.puzzle.rating}`}
            </div>
            <Button
              variant="outline"
              onClick={run.skip}
              disabled={!state || state.status !== 'playing'}
            >
              <SkipForward className="mr-2 h-4 w-4" /> Skip (counts as a miss)
            </Button>
          </CardContent>
        </Card>
      </div>
      <PromotionPicker
        open={run.pendingPromotion !== null}
        onSelect={run.choosePromotion}
        onCancel={run.cancelPromotion}
      />
    </>
  );
}

/** Solved-count bar. */
export function SolvedBar({
  clean,
  target,
  missed,
  maxMisses,
  label,
}: {
  clean: number;
  target: number;
  missed: number;
  /** When set, misses are shown against this allowance (the next one ends the run). */
  maxMisses?: number;
  label?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm text-gray-600">
        <span>
          {label ?? 'Solved'} <strong className="text-gray-900">{clean}</strong> / {target}
        </span>
        {maxMisses === undefined ? (
          <span>{missed} missed</span>
        ) : (
          <span className={missed >= maxMisses ? 'font-semibold text-red-600' : undefined}>
            Misses {missed} / {maxMisses}
          </span>
        )}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={clean}
      >
        <div
          className="h-full bg-green-600 transition-all"
          style={{ width: `${Math.min(100, (clean / target) * 100)}%` }}
        />
      </div>
    </div>
  );
}
