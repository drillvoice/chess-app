import { useEffect, useState } from 'react';
import { ChevronDown, Flag, Loader2, Lock, Star, Swords, Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useCampaign } from '@/hooks/use-campaign';
import { formatDuration } from '@/lib/focus/format-duration';
import { MAX_MISSES, TRIAL_MS, TRIAL_TARGET } from '@/lib/campaign/trial-rules';
import FocusModeTabs from '@/components/focus/focus-mode-tabs';
import TrialRunner from '@/components/campaign/trial-runner';
import PlacementRunner from '@/components/campaign/placement-runner';
import { Button } from '@/components/ui/button';
import { StarRow } from '@/components/campaign/star-row';
import { chapterLevel, findNode, type CampaignNode } from '@/lib/campaign/chapters';
import {
  currentChapterId,
  placementSummary,
  nodeProgress,
  type ChapterProgress,
  type NodeProgress,
  type NodeStatus,
} from '@/lib/campaign/progress';

function NodeTile({
  node,
  status,
  progress,
  onPlay,
}: {
  node: CampaignNode;
  status: NodeStatus;
  progress: NodeProgress;
  onPlay: () => void;
}) {
  const locked = status === 'locked';
  const isBoss = node.kind === 'boss';
  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={locked}
      className={cn(
        'flex min-h-[76px] flex-col justify-between rounded-lg border p-3 text-left transition-colors',
        isBoss && 'col-span-full',
        locked && 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400',
        status === 'open' &&
          (isBoss
            ? 'border-amber-500 bg-amber-50 hover:bg-amber-100'
            : 'border-blue-500 bg-blue-50 hover:bg-blue-100'),
        status === 'cleared' && 'border-gray-200 bg-white hover:bg-gray-50',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {isBoss && <Swords className="h-4 w-4 shrink-0" />}
          {node.title}
        </span>
        {locked && <Lock className="h-3.5 w-3.5 shrink-0" />}
      </span>
      <span className="mt-2 flex items-center justify-between gap-2 text-xs">
        {locked ? (
          <span>{isBoss ? 'Clear every node to face the boss' : 'Locked'}</span>
        ) : (
          <>
            <StarRow stars={progress.bestStars} size="sm" />
            <span className="text-gray-500">
              {progress.attempts === 0
                ? node.kind === 'phase'
                  ? 'phase'
                  : 'new'
                : progress.bestCompletedMs !== null
                  ? `best ${formatDuration(progress.bestCompletedMs)}`
                  : `best ${progress.bestClean}/${TRIAL_TARGET}`}
            </span>
          </>
        )}
      </span>
    </button>
  );
}

function ChapterCard({
  entry,
  previousBoss,
  expanded,
  onToggle,
  progress,
  onPlay,
}: {
  entry: ChapterProgress;
  previousBoss: string | null;
  expanded: boolean;
  onToggle: () => void;
  progress: Map<string, NodeProgress>;
  onPlay: (nodeId: string) => void;
}) {
  const {
    chapter,
    unlocked,
    status,
    clearedCount,
    bossBeaten,
    skippedByPlacement,
    stars,
    maxStars,
  } = entry;
  const total = chapter.nodes.length;
  // Locked nodes fold into one row so the ones you can play stay on screen.
  const [showLocked, setShowLocked] = useState(false);
  const visibleNodes = chapter.nodes.filter((n) => status[n.id] !== 'locked');
  const lockedNodes = chapter.nodes.filter((n) => status[n.id] === 'locked');
  return (
    <Card className={cn(!unlocked && 'opacity-70')}>
      <CardContent className="p-0 md:p-0">
        <button
          type="button"
          onClick={onToggle}
          disabled={!unlocked}
          aria-expanded={expanded}
          className="flex w-full items-start gap-3 p-4 text-left"
        >
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
              bossBeaten
                ? 'bg-amber-400 text-white'
                : unlocked
                  ? 'bg-[#1E40AF] text-white'
                  : 'bg-gray-200 text-gray-500',
            )}
          >
            {bossBeaten ? (
              <Trophy className="h-4 w-4" />
            ) : unlocked ? (
              chapter.number
            ) : (
              <Lock className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-gray-900">
                Chapter {chapter.number}: {chapter.title}
              </span>
              <span className="text-xs text-gray-500">{chapterLevel(chapter).label}</span>
            </span>
            <span className="mt-0.5 block text-sm text-gray-600">
              {unlocked ? chapter.intro : `Beat the ${previousBoss} to unlock.`}
            </span>
            {unlocked && (
              <span className="mt-2 flex items-center gap-3 text-xs text-gray-600">
                <span>
                  {clearedCount}/{total} cleared{bossBeaten && ' · boss beaten'}
                  {skippedByPlacement && ' · skipped by placement'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden />
                  {stars}/{maxStars} stars
                </span>
              </span>
            )}
          </span>
          {unlocked && (
            <ChevronDown
              className={cn(
                'mt-2 h-4 w-4 shrink-0 text-gray-400 transition-transform',
                expanded && 'rotate-180',
              )}
            />
          )}
        </button>
        {unlocked && expanded && (
          <div className="grid grid-cols-2 gap-2 border-t p-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleNodes.map((node) => (
              <NodeTile
                key={node.id}
                node={node}
                status={status[node.id]}
                progress={nodeProgress(progress, node.id)}
                onPlay={() => onPlay(node.id)}
              />
            ))}
            {lockedNodes.length > 0 && (
              <button
                type="button"
                onClick={() => setShowLocked((v) => !v)}
                aria-expanded={showLocked}
                className="col-span-full flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-left text-xs text-gray-500 hover:bg-gray-50"
              >
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  {showLocked ? (
                    'Hide locked nodes'
                  ) : (
                    <>
                      <span className="font-medium text-gray-700">
                        {lockedNodes.length} more to unlock
                      </span>
                      <span className="hidden sm:inline">
                        {' '}
                        · {lockedNodes.map((n) => n.title).join(', ')}
                      </span>
                    </>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 transition-transform',
                    showLocked && 'rotate-180',
                  )}
                />
              </button>
            )}
            {showLocked &&
              lockedNodes.map((node) => (
                <NodeTile
                  key={node.id}
                  node={node}
                  status="locked"
                  progress={nodeProgress(progress, node.id)}
                  onPlay={() => onPlay(node.id)}
                />
              ))}
            <NodeTile
              node={chapter.boss}
              status={status[chapter.boss.id]}
              progress={nodeProgress(progress, chapter.boss.id)}
              onPlay={() => onPlay(chapter.boss.id)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CampaignPage() {
  const { chapters, progress, isLoading, error } = useCampaign();
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Open the furthest unlocked chapter once progress has loaded (and when a new one unlocks).
  const current = isLoading ? null : currentChapterId(chapters);
  useEffect(() => {
    // Collapse the rest so the chapter you're on (e.g. after placement) is what you see.
    if (current) setExpanded(new Set([current]));
  }, [current]);

  if (placing) return <PlacementRunner onExit={() => setPlacing(false)} />;

  const placement = placementSummary(progress);
  const anyBossBeaten = chapters.some((c) => c.bossBeaten);
  const placedChapter = chapters.find(
    (_, i) => i === Math.min(placement.passedThrough + 1, chapters.length - 1),
  );

  // The chapter you're on goes first; later ones are one-line rows; earlier ones fold away.
  const currentIndex = Math.max(
    0,
    chapters.findIndex((c) => c.chapter.id === current),
  );
  const currentEntry = chapters[currentIndex];
  const earlier = chapters.slice(0, currentIndex);
  const later = chapters.slice(currentIndex + 1);
  const skippedCount = earlier.filter((c) => c.skippedByPlacement).length;
  const earlierSummary =
    skippedCount === earlier.length
      ? 'skipped by placement'
      : skippedCount === 0
        ? 'completed'
        : `${earlier.length - skippedCount} completed, ${skippedCount} skipped`;
  const hasPlayed = progress.size > 0;

  const chapterCard = (entry: ChapterProgress, i: number) => (
    <ChapterCard
      key={entry.chapter.id}
      entry={entry}
      previousBoss={i > 0 ? chapters[i - 1].chapter.boss.name : null}
      expanded={expanded.has(entry.chapter.id)}
      onToggle={() =>
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(entry.chapter.id)) next.delete(entry.chapter.id);
          else next.add(entry.chapter.id);
          return next;
        })
      }
      progress={progress}
      onPlay={setActiveNodeId}
    />
  );

  const active = activeNodeId ? findNode(activeNodeId) : null;
  if (active) {
    return (
      <TrialRunner
        key={active.node.id}
        chapter={active.chapter}
        node={active.node}
        previous={nodeProgress(progress, active.node.id)}
        onExit={() => setActiveNodeId(null)}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Flag className="h-6 w-6 text-[#1E40AF]" />
        <h1 className="text-2xl font-bold text-gray-900">Campaign</h1>
        <div className="ml-auto">
          <FocusModeTabs active="campaign" />
        </div>
      </div>
      {!isLoading && (!hasPlayed || showHelp) && (
        <p className="text-sm text-gray-600">
          Each node is a timed trial: solve {TRIAL_TARGET} Lichess puzzles of one theme in{' '}
          {formatDuration(TRIAL_MS)}, with no more than {MAX_MISSES} misses. One star clears a node
          and opens the next; clear a chapter to face its boss, a mix of every theme so far. Beat
          the boss to move up a rating band.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          Could not load your campaign progress:{' '}
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}
      {!isLoading &&
        (!placement.taken && !anyBossBeaten ? (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="flex flex-col gap-3 p-4 pt-4 sm:flex-row sm:items-center md:p-4 md:pt-4">
              <div className="flex-1 text-sm text-gray-700">
                <span className="block font-semibold text-gray-900">
                  Already a strong player? Take the placement test.
                </span>
                Short rounds of mixed puzzles that climb through the rating bands, so you can skip
                the chapters you don’t need. About 2–15 minutes.
              </div>
              <Button onClick={() => setPlacing(true)}>Take the placement test</Button>
            </CardContent>
          </Card>
        ) : (
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-600">
            {placement.taken && (
              <span>
                Placed at Chapter {placedChapter?.chapter.number}.{' '}
                <button
                  type="button"
                  className="font-medium text-blue-700 hover:underline"
                  onClick={() => setPlacing(true)}
                >
                  Retake
                </button>
              </span>
            )}
            {hasPlayed && (
              <button
                type="button"
                className="font-medium text-blue-700 hover:underline"
                onClick={() => setShowHelp((v) => !v)}
                aria-expanded={showHelp}
              >
                {showHelp ? 'Hide how it works' : 'How it works'}
              </button>
            )}
          </p>
        ))}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {currentEntry && chapterCard(currentEntry, currentIndex)}

          {later.length > 0 && (
            <section aria-labelledby="campaign-later" className="space-y-2">
              <h2 id="campaign-later" className="text-sm font-semibold text-gray-700">
                Coming up
              </h2>
              <Card>
                <CardContent className="divide-y p-0 md:p-0">
                  {later.map((entry, i) => (
                    <div key={entry.chapter.id} className="flex items-center gap-3 px-4 py-3">
                      <Lock className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                        <span className="font-medium">
                          Chapter {entry.chapter.number}: {entry.chapter.title}
                        </span>
                        <span className="ml-2 text-xs text-gray-500">
                          {chapterLevel(entry.chapter).label}
                        </span>
                      </span>
                      {i === 0 && currentEntry && (
                        <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">
                          Beat the {currentEntry.chapter.boss.name}
                        </span>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          )}

          {earlier.length > 0 && (
            <section className="space-y-2">
              <button
                type="button"
                onClick={() => setShowEarlier((v) => !v)}
                aria-expanded={showEarlier}
                className="flex w-full items-center gap-2 text-left text-sm font-semibold text-gray-700"
              >
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', !showEarlier && '-rotate-90')}
                />
                Earlier chapters ({earlier.length})
                <span className="font-normal text-gray-500">· {earlierSummary}</span>
              </button>
              {showEarlier && (
                <div className="space-y-3">{earlier.map((entry, i) => chapterCard(entry, i))}</div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
