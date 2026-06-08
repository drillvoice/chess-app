import { nanoid } from 'nanoid';
import { withStores } from './transaction';
import { moveStatsNeedRepair, sanitizeMoveStats } from '../opening-trainer/scheduler';
import type { OpeningMoveStats, OpeningRepertoire } from '../opening-trainer/types';

const OPENING_REPERTOIRES = 'opening_repertoires';

// Count of move stats healed by the most recent normalisation pass. Read (and
// reset) by getOpeningRepertoires so a one-time, low-noise warning can confirm
// whether stored data actually carried non-finite corruption.
let lastRepairedStatCount = 0;

// Coerce every stat to finite values on the way in/out of storage, so a corrupt
// record (a NaN/Infinity from an old build or sync round-trip) is healed the
// moment it's read and the clean copy is persisted on the next save.
function normalizeStats(
  stats: Record<string, OpeningMoveStats> | undefined,
): Record<string, OpeningMoveStats> {
  if (!stats) {
    return {};
  }
  const normalized: Record<string, OpeningMoveStats> = {};
  for (const [id, stat] of Object.entries(stats)) {
    if (moveStatsNeedRepair(stat)) {
      lastRepairedStatCount += 1;
    }
    normalized[id] = sanitizeMoveStats(stat);
  }
  return normalized;
}

function normalizeRepertoire(input: Partial<OpeningRepertoire>): OpeningRepertoire {
  const now = new Date().toISOString();
  return {
    id: input.id || nanoid(),
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'Repertoire',
    side: input.side === 'black' ? 'black' : 'white',
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    rootNodeId: input.rootNodeId || 'root',
    nodes: input.nodes || {},
    stats: normalizeStats(input.stats),
  };
}

function sortByUpdatedDesc(repertoires: OpeningRepertoire[]): OpeningRepertoire[] {
  return repertoires.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getOpeningRepertoires(): Promise<OpeningRepertoire[]> {
  return withStores([OPENING_REPERTOIRES] as const, 'readonly', async ({ opening_repertoires }) => {
    const all = await opening_repertoires.getAll();
    lastRepairedStatCount = 0;
    const normalized = sortByUpdatedDesc(all.map((repertoire) => normalizeRepertoire(repertoire)));
    if (lastRepairedStatCount > 0) {
      // The healed copies persist the next time each repertoire is saved (after
      // any drilled move). This warning confirms corruption actually existed.
      console.warn(
        `[openings] healed ${lastRepairedStatCount} corrupt move stat(s) with non-finite values`,
      );
    }
    return normalized;
  });
}

export async function saveOpeningRepertoire(
  repertoire: OpeningRepertoire,
): Promise<OpeningRepertoire> {
  return withStores(
    [OPENING_REPERTOIRES] as const,
    'readwrite',
    async ({ opening_repertoires }) => {
      const normalized = normalizeRepertoire({
        ...repertoire,
        updatedAt: new Date().toISOString(),
      });
      await opening_repertoires.put(normalized);
      return normalized;
    },
  );
}

export async function deleteOpeningRepertoire(id: string): Promise<void> {
  await withStores([OPENING_REPERTOIRES] as const, 'readwrite', async ({ opening_repertoires }) => {
    await opening_repertoires.delete(id);
  });
}

/**
 * Replace the entire local repertoire store with the given set. Used by cloud
 * sync to apply a reconciled snapshot atomically.
 */
export async function setOpeningRepertoires(repertoires: OpeningRepertoire[]): Promise<void> {
  await withStores([OPENING_REPERTOIRES] as const, 'readwrite', async ({ opening_repertoires }) => {
    await opening_repertoires.clear();
    for (const repertoire of repertoires) {
      await opening_repertoires.put(normalizeRepertoire(repertoire));
    }
  });
}
