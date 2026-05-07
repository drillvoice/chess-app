import { nanoid } from 'nanoid';
import { withStores } from './transaction';
import type { OpeningRepertoire } from '../opening-trainer/types';

const OPENING_REPERTOIRES = 'opening_repertoires';

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
    stats: input.stats || {},
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
    return sortByUpdatedDesc(all.map((repertoire) => normalizeRepertoire(repertoire)));
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
