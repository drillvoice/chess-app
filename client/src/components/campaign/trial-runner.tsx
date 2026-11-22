import { useCallback, useState } from 'react';
import { nanoid } from 'nanoid';
import { ArrowLeft, Loader2, RotateCcw, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { formatDuration } from '@/lib/focus/format-duration';
import { chapterLevel, type CampaignChapter, type CampaignNode } from '@/lib/campaign/chapters';
import { INITIAL_PUZZLES } from '@/lib/campaign/trial-puzzles';
import {
  BOSS_CLEAR_STARS,
  MAX_MISSES,
  ONE_STAR_CLEAN,
  THREE_STAR_MS,
  trialEnd,
  starsFor,
  TRIAL_MS,
  TRIAL_TARGET,
  trialPace,
  type Stars,
} from '@/lib/campaign/trial-rules';
import type { CampaignAttempt } from '@/lib/campaign/attempts';
import type { NodeProgress } from '@/lib/campaign/progress';
import { saveCampaignAttempt } from '@/lib/firebase/campaign';
import { CAMPAIGN_QUERY_KEY } from '@/hooks/use-campaign';
import { useTimedPuzzleRun, type RunResult } from '@/hooks/use-timed-puzzle-run';
import { logCampaignSession } from '@/lib/campaign/log-session';
import RunBoard, { SolvedBar } from './run-board';
import { StarRow } from './star-row';

interface Props {
  chapter: CampaignChapter;
  /** A boss node carries an intro line. */
  node: CampaignNode & { intro?: string };
  previous: NodeProgress;
  onExit: () => void;
}

export default function TrialRunner({ chapter, node, previous, onExit }: Props) {
  const { toast } = useToast();
  const level = chapterLevel(chapter);
  const isBoss = node.kind === 'boss';
  const [result, setResult] = useState<CampaignAttempt | null>(null);
  const [saving, setSaving] = useState(false);

  const onFinish = useCallback(
    async (run: RunResult) => {
      const attempt: CampaignAttempt = { id: nanoid(), nodeId: node.id, ...run };
      setResult(attempt);
      setSaving(true);
      try {
        await saveCampaignAttempt(attempt);
        queryClient.invalidateQueries({ queryKey: CAMPAIGN_QUERY_KEY });
      } catch (error) {
        console.error('[campaign] Failed to save trial attempt', { attempt, error });
        toast({
          title: 'Could not save this trial',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }
      if (attempt.attempted > 0) {
        await logCampaignSession(
          {
            startedAt: attempt.startedAt,
            durationMs: attempt.durationMs,
            attempted: attempt.attempted,
            clean: attempt.clean,
            notes: `Campaign trial: ${node.title} (${level.label}) — ${attempt.clean} clean in ${formatDuration(
              attempt.completedMs ?? attempt.durationMs,
            )}, ${starsFor(attempt)}/3 stars`,
          },
          toast,
        );
      }
      setSaving(false);
    },
    [node.id, node.title, level.label, toast],
  );

  const run = useTimedPuzzleRun({
    node,
    difficulty: level.difficulty,
    timeLimitMs: TRIAL_MS,
    batchSize: INITIAL_PUZZLES,
    endRule: trialEnd,
    onFinish,
  });
  const { phase, loadError, load, start, tally } = run;

  const abandon = () => {
    if (
      phase === 'running' &&
      !window.confirm('Abandon this trial? It won’t be saved or count toward your progress.')
    ) {
      return;
    }
    run.abort();
    onExit();
  };

  const retry = () => {
    setResult(null);
    void load();
  };

  const header = (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={abandon} className="-ml-2">
        <ArrowLeft className="mr-1 h-4 w-4" /> Campaign
      </Button>
      <div className="min-w-0 text-sm text-gray-500">
        Chapter {chapter.number} · {level.label}
      </div>
    </div>
  );

  if (phase === 'loading' || phase === 'error' || phase === 'ready') {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        {header}
        <Card>
          <CardContent className="space-y-4 p-5 pt-5 md:p-5 md:pt-5">
            <div className="flex items-center gap-2">
              {isBoss && <Swords className="h-5 w-5 text-amber-600" />}
              <h1 className="text-xl font-bold text-gray-900">{node.title}</h1>
            </div>
            {node.intro && <p className="text-sm text-gray-600">{node.intro}</p>}
            <ul className="space-y-1 text-sm text-gray-700">
              <li>
                Solve <strong>{TRIAL_TARGET}</strong> puzzles in{' '}
                <strong>{formatDuration(TRIAL_MS)}</strong>. A wrong move or skip is a miss. You can
                afford <strong>{MAX_MISSES}</strong>; the next one ends the trial.
              </li>
              <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <StarRow stars={1} size="sm" /> {ONE_STAR_CLEAN} solved
                </span>
                <span className="inline-flex items-center gap-1">
                  <StarRow stars={2} size="sm" /> {TRIAL_TARGET} in {formatDuration(TRIAL_MS)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <StarRow stars={3} size="sm" /> {TRIAL_TARGET} in {formatDuration(THREE_STAR_MS)}
                </span>
              </li>
              <li>
                {isBoss
                  ? `Beat the boss with ${BOSS_CLEAR_STARS} stars to unlock the next chapter.`
                  : 'One star clears this node and opens the next one.'}
              </li>
              <li className="text-gray-500">
                Leaving the app pauses the clock, but the puzzle on screen counts as missed.
              </li>
            </ul>
            {previous.attempts > 0 && (
              <p className="text-sm text-gray-600">
                Your best: <StarRow stars={previous.bestStars} size="sm" /> · pace{' '}
                {previous.bestPace?.toFixed(1)} per 5 min · {previous.attempts} attempt
                {previous.attempts === 1 ? '' : 's'}
              </p>
            )}
            {phase === 'error' ? (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-red-600">
                  {loadError}
                </p>
                <Button onClick={() => void load()}>Try again</Button>
              </div>
            ) : (
              <Button onClick={start} disabled={phase === 'loading'} className="w-full" size="lg">
                {phase === 'loading' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading puzzles…
                  </>
                ) : (
                  'Start the clock'
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === 'done' && result) {
    const stars = starsFor(result) as Stars;
    const pace = trialPace(result);
    const newBest =
      previous.attempts > 0 &&
      (stars > previous.bestStars || (previous.bestPace !== null && pace > previous.bestPace));
    const bossBeaten = isBoss && stars >= BOSS_CLEAR_STARS;
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        {header}
        <Card>
          <CardContent className="space-y-4 p-5 pt-5 text-center md:p-5 md:pt-5">
            <h1 className="text-xl font-bold text-gray-900">
              {isBoss ? (bossBeaten ? 'Boss beaten!' : 'The boss holds') : node.title}
            </h1>
            <div className="flex justify-center">
              <StarRow stars={stars} size="lg" />
            </div>
            <p className="text-lg text-gray-800">
              <strong>{result.clean}</strong> solved of {result.attempted} ·{' '}
              {result.completedMs !== null
                ? `target hit in ${formatDuration(result.completedMs)}`
                : result.attempted - result.clean > MAX_MISSES
                  ? 'out of misses'
                  : 'time up'}
            </p>
            <p className="text-sm text-gray-600">
              Pace: <strong>{pace.toFixed(1)}</strong> per 5 min
              {newBest && <span className="ml-2 font-semibold text-green-700">New best!</span>}
            </p>
            {isBoss && !bossBeaten && (
              <p className="text-sm text-gray-600">
                You need {TRIAL_TARGET} solved within {formatDuration(TRIAL_MS)}, with at most{' '}
                {MAX_MISSES} misses, to beat the boss.
              </p>
            )}
            {saving && (
              <p className="text-xs text-gray-500">
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Saving…
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={retry} disabled={saving}>
                <RotateCcw className="mr-2 h-4 w-4" /> Try again
              </Button>
              <Button onClick={onExit} disabled={saving}>
                Back to campaign
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-4">
      {header}
      <RunBoard
        run={run}
        title={node.title}
        revealThemesFrom={isBoss ? node.themes : undefined}
        progress={
          <SolvedBar
            clean={tally.clean}
            target={TRIAL_TARGET}
            missed={tally.attempted - tally.clean}
            maxMisses={MAX_MISSES}
          />
        }
      />
    </div>
  );
}
