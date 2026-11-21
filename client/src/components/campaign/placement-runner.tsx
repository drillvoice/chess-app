import { useCallback, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { ArrowLeft, CheckCircle2, Flag, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { formatDuration } from '@/lib/focus/format-duration';
import { CAMPAIGN, chapterLevel } from '@/lib/campaign/chapters';
import {
  PLACEMENT_PASS,
  PLACEMENT_ROUND_MS,
  PLACEMENT_ROUND_SIZE,
  placementNodeId,
  placementRoundEnd,
  placementRoundPassed,
  startingChapterIndex,
} from '@/lib/campaign/placement';
import type { CampaignAttempt } from '@/lib/campaign/attempts';
import { saveCampaignAttempt } from '@/lib/firebase/campaign';
import { logCampaignSession } from '@/lib/campaign/log-session';
import { CAMPAIGN_QUERY_KEY } from '@/hooks/use-campaign';
import { useTimedPuzzleRun, type RunResult } from '@/hooks/use-timed-puzzle-run';
import RunBoard, { SolvedBar } from './run-board';

/** Mixed puzzles fetched per round: three themes, so the round isn't one motif. */
const ROUND_BATCH = 18;

interface RoundOutcome {
  chapterIndex: number;
  attempt: CampaignAttempt;
  passed: boolean;
}

function RoundView({
  roundIndex,
  previous,
  onDone,
  onRunningChange,
}: {
  roundIndex: number;
  /** The round just finished, shown as a banner on the next round's start screen. */
  previous: RoundOutcome | null;
  onDone: (outcome: RoundOutcome) => void;
  onRunningChange: (running: boolean) => void;
}) {
  const { toast } = useToast();
  const chapter = CAMPAIGN[roundIndex];
  const level = chapterLevel(chapter);
  const [saving, setSaving] = useState(false);

  const onFinish = useCallback(
    async (run: RunResult) => {
      onRunningChange(false);
      const attempt: CampaignAttempt = {
        id: nanoid(),
        nodeId: placementNodeId(chapter.id),
        ...run,
      };
      setSaving(true);
      try {
        await saveCampaignAttempt(attempt);
        queryClient.invalidateQueries({ queryKey: CAMPAIGN_QUERY_KEY });
      } catch (error) {
        // Fail loud: an unsaved pass would silently leave chapters locked.
        console.error('[campaign] Failed to save placement round', { attempt, error });
        toast({
          title: 'Could not save this placement round',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      }
      setSaving(false);
      onDone({ chapterIndex: roundIndex, attempt, passed: placementRoundPassed(run.clean) });
    },
    [chapter.id, roundIndex, onDone, onRunningChange, toast],
  );

  const run = useTimedPuzzleRun({
    node: chapter.boss,
    difficulty: level.difficulty,
    timeLimitMs: PLACEMENT_ROUND_MS,
    batchSize: ROUND_BATCH,
    endRule: placementRoundEnd,
    onFinish,
  });

  if (run.phase === 'running' || run.phase === 'done') {
    return (
      <>
        <RunBoard
          run={run}
          title={`Round ${roundIndex + 1}: ${chapter.title}`}
          revealThemesFrom={chapter.boss.themes}
          progress={
            <SolvedBar
              clean={run.tally.clean}
              target={PLACEMENT_PASS}
              missed={run.tally.attempted - run.tally.clean}
              label="Solved"
            />
          }
        />
        {saving && (
          <p className="text-center text-xs text-gray-500">
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Saving…
          </p>
        )}
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <Card>
        <CardContent className="space-y-4 p-5 pt-5 md:p-5 md:pt-5">
          {previous ? (
            <p className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Round {previous.chapterIndex + 1} passed with {previous.attempt.clean} solved. Up a
              band.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Flag className="h-5 w-5 text-[#1E40AF]" />
                <h1 className="text-xl font-bold text-gray-900">Placement test</h1>
              </div>
              <p className="text-sm text-gray-600">
                Skip the chapters you don’t need. There’s one short round per rating band, starting
                at Beginner. Each round mixes that band’s themes. Keep passing to climb; the first
                round you don’t pass is the chapter you start in. Chapters below it stay open to
                play any time.
              </p>
            </div>
          )}
          <div>
            <div className="text-sm text-gray-500">
              Round {roundIndex + 1} of {CAMPAIGN.length}
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{level.label}</h2>
          </div>
          <ul className="space-y-1 text-sm text-gray-700">
            <li>
              Solve <strong>{PLACEMENT_PASS}</strong> of {PLACEMENT_ROUND_SIZE} in{' '}
              <strong>{formatDuration(PLACEMENT_ROUND_MS)}</strong> to pass. That’s the pace for 2
              stars in a trial.
            </li>
            <li>
              The round stops early once you’ve passed, or once a pass is out of reach. A wrong move
              or skip counts as a miss.
            </li>
            <li className="text-gray-500">
              Leaving the app pauses the clock, but the puzzle on screen counts as missed.
            </li>
          </ul>
          {run.phase === 'error' ? (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-red-600">
                {run.loadError}
              </p>
              <Button onClick={() => void run.load()}>Try again</Button>
            </div>
          ) : (
            <Button
              onClick={() => {
                onRunningChange(true);
                run.start();
              }}
              disabled={run.phase === 'loading'}
              className="w-full"
              size="lg"
            >
              {run.phase === 'loading' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading puzzles…
                </>
              ) : (
                `Start round ${roundIndex + 1}`
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PlacementRunner({ onExit }: { onExit: () => void }) {
  const { toast } = useToast();
  const [roundIndex, setRoundIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<RoundOutcome[]>([]);
  const [finished, setFinished] = useState(false);
  const running = useRef(false);
  const logged = useRef(false);

  /** One tactics session for the whole test, logged once. */
  const logTest = useCallback(
    (all: RoundOutcome[], placedIndex: number) => {
      if (logged.current || all.length === 0) return;
      logged.current = true;
      const attempts = all.map((o) => o.attempt);
      void logCampaignSession(
        {
          startedAt: attempts[0].startedAt,
          durationMs: attempts.reduce((sum, a) => sum + a.durationMs, 0),
          attempted: attempts.reduce((sum, a) => sum + a.attempted, 0),
          clean: attempts.reduce((sum, a) => sum + a.clean, 0),
          notes: `Campaign placement test: ${all.filter((o) => o.passed).length}/${all.length} rounds passed, placed at Chapter ${placedIndex + 1} (${CAMPAIGN[placedIndex].title})`,
        },
        toast,
      );
    },
    [toast],
  );

  const passedThrough = (all: RoundOutcome[]) =>
    all.filter((o) => o.passed).reduce((max, o) => Math.max(max, o.chapterIndex), -1);

  const onDone = useCallback(
    (outcome: RoundOutcome) => {
      const all = [...outcomes, outcome];
      setOutcomes(all);
      const last = outcome.chapterIndex === CAMPAIGN.length - 1;
      if (!outcome.passed || last) {
        setFinished(true);
        logTest(all, startingChapterIndex(passedThrough(all)));
      } else {
        setRoundIndex(outcome.chapterIndex + 1);
      }
    },
    [outcomes, logTest],
  );

  const onRunningChange = useCallback((value: boolean) => {
    running.current = value;
  }, []);

  const leave = () => {
    if (
      running.current &&
      !window.confirm('Leave the placement test? The round in progress won’t count.')
    ) {
      return;
    }
    if (!finished) logTest(outcomes, startingChapterIndex(passedThrough(outcomes)));
    onExit();
  };

  const header = (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={leave} className="-ml-2">
        <ArrowLeft className="mr-1 h-4 w-4" /> Campaign
      </Button>
      <div className="text-sm text-gray-500">Placement test</div>
    </div>
  );

  if (finished) {
    const placedIndex = startingChapterIndex(passedThrough(outcomes));
    const placed = CAMPAIGN[placedIndex];
    const failed = outcomes.find((o) => !o.passed);
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        {header}
        <Card>
          <CardContent className="space-y-4 p-5 pt-5 text-center md:p-5 md:pt-5">
            <h1 className="text-xl font-bold text-gray-900">
              You start at Chapter {placed.number}: {placed.title}
            </h1>
            <p className="text-sm text-gray-600">{chapterLevel(placed).label}</p>
            <ul className="mx-auto max-w-sm space-y-1 text-left text-sm">
              {outcomes.map((o) => (
                <li key={o.attempt.id} className="flex items-center gap-2">
                  {o.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  Round {o.chapterIndex + 1} ({CAMPAIGN[o.chapterIndex].title}): {o.attempt.clean}/
                  {PLACEMENT_ROUND_SIZE} solved
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-600">
              {placedIndex > 0
                ? `Chapters 1–${placedIndex} are open to play any time, but you don’t need them to progress.`
                : 'Chapter 1 is the right place to start.'}
              {failed === undefined &&
                ' You passed every round, so the whole campaign is open. The Expert boss is the last challenge.'}
              {' Placement only ever opens chapters. A retake can’t lock anything.'}
            </p>
            <Button onClick={onExit}>Go to the campaign</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-4">
      {header}
      <RoundView
        key={roundIndex}
        roundIndex={roundIndex}
        previous={outcomes[outcomes.length - 1] ?? null}
        onDone={onDone}
        onRunningChange={onRunningChange}
      />
    </div>
  );
}
