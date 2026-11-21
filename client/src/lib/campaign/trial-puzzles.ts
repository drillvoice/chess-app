import { fetchFocusPuzzles, type FocusPuzzle } from '../focus/lichess-puzzles';
import type { FocusDifficulty } from '../focus/themes';
import type { CampaignNode } from './chapters';

/** Puzzles fetched before the clock starts; enough for most trials without a refill. */
export const INITIAL_PUZZLES = 24;
/** Refill when this few unplayed puzzles are left in the queue. */
export const REFILL_BELOW = 6;
/** A boss draws this many puzzles from each of several randomly chosen themes. */
const BOSS_PER_THEME = 6;

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface FetchOptions {
  /** Ids to leave out: puzzles already in this trial and ones played on Lichess. */
  exclude: Set<string>;
  fetchImpl?: typeof fetch;
  random?: () => number;
}

/**
 * Fetch puzzles for a trial at a fixed band (anonymous, so the rating band is
 * absolute). A regular node pulls one batch of its theme. A boss pulls a few
 * small batches from randomly chosen chapter themes and shuffles them, so you
 * can't tell which motif is coming. Themes Lichess has nothing for are skipped
 * as long as at least one batch succeeds.
 */
export async function fetchTrialPuzzles(
  node: CampaignNode,
  difficulty: FocusDifficulty,
  count: number,
  { exclude, fetchImpl, random = Math.random }: FetchOptions,
): Promise<FocusPuzzle[]> {
  const batches: Array<{ theme: string; nb: number }> =
    node.kind === 'boss'
      ? shuffle(node.themes, random)
          .slice(0, Math.max(1, Math.ceil(count / BOSS_PER_THEME)))
          .map((theme) => ({ theme, nb: BOSS_PER_THEME }))
      : [{ theme: node.themes[0], nb: count }];

  const results = await Promise.allSettled(
    batches.map(({ theme, nb }) => fetchFocusPuzzles(theme, difficulty, nb, { fetchImpl })),
  );
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  const fetched = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (fetched.length === 0) {
    const reason = failures[0]?.reason;
    throw reason instanceof Error ? reason : new Error(String(reason ?? 'No puzzles returned'));
  }
  if (failures.length > 0) {
    console.warn('[campaign] Some boss theme batches failed; continuing with the rest', {
      node: node.id,
      failures: failures.map((f) => String(f.reason)),
    });
  }

  const unique = new Map<string, FocusPuzzle>();
  for (const puzzle of fetched) {
    if (!exclude.has(puzzle.id)) unique.set(puzzle.id, puzzle);
  }
  const fresh = Array.from(unique.values());
  return node.kind === 'boss' ? shuffle(fresh, random) : fresh;
}
