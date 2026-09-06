import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  computeMistakeStats,
  MISTAKE_STATS_RANGES,
  type MistakeStatsRange,
} from '@/lib/mistake-stats';
import type { TrainingSession } from '@shared/schema';

/**
 * How often each mistake tag has been recorded on games, over a chosen window.
 * The window is local UI state: it only reshapes this card, and shouldn't drag
 * the training history below it along with it.
 */
export function MistakeStatsSection({ sessions }: { sessions: TrainingSession[] | undefined }) {
  const [range, setRange] = useState<MistakeStatsRange>('all');
  const stats = useMemo(() => computeMistakeStats(sessions, range), [sessions, range]);
  const maxCount = stats.tags[0]?.count ?? 0;

  return (
    <Card className="border-gray-200">
      <CardContent className="p-4 md:p-5">
        <div className="mb-3 flex flex-wrap gap-2">
          {MISTAKE_STATS_RANGES.map(({ value, label }) => (
            <Button
              key={value}
              variant={range === value ? 'default' : 'secondary'}
              size="sm"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
              className={cn(
                range === value
                  ? 'bg-[#1E40AF] text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
              )}
            >
              {label}
            </Button>
          ))}
        </div>

        {stats.tags.length === 0 ? (
          <div className="py-6 text-center text-gray-500">
            <div className="text-sm">
              {stats.totalGames === 0
                ? 'No games logged in this period'
                : 'No mistakes tagged in this period'}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Tag the mistakes you make when logging a game to see them counted here
            </p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-gray-600">
              Mistakes tagged in {stats.taggedGames} of {stats.totalGames}{' '}
              {stats.totalGames === 1 ? 'game' : 'games'}
            </p>
            <ul className="space-y-2">
              {stats.tags.map(({ tag, key, count }) => (
                <li key={key}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-gray-800">{tag}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-rose-700">
                      {count}
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-gray-100"
                    role="img"
                    aria-label={`${tag}: tagged in ${count} ${count === 1 ? 'game' : 'games'}`}
                  >
                    <div
                      className="h-full rounded-full bg-rose-400"
                      // Bars are read against each other, so the most frequent tag
                      // fills the row and the rest are drawn relative to it.
                      style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
