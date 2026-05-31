import type {
  OpeningMoveNode,
  OpeningMoveStats,
  OpeningRepertoire,
} from '../../opening-trainer/types';

// Opening repertoires sync as whole documents with last-write-wins semantics
// (newest `updatedAt` wins) and propagating tombstones for deletes, mirroring
// how training sessions reconcile. The move tree and stats are stored as JSON
// strings in the cloud document so arbitrary node-id map keys never collide
// with Firestore field-name restrictions.

export interface RemoteRepertoire extends OpeningRepertoire {
  /** ISO timestamp present only on tombstoned (deleted) cloud documents. */
  deletedAt?: string;
}

export interface SerializedRepertoire {
  id: string;
  name: string;
  side: OpeningRepertoire['side'];
  createdAt: string;
  updatedAt: string;
  rootNodeId: string;
  nodes: string;
  stats: string;
}

export function repertoireRecency(repertoire: { updatedAt?: string }): number {
  const parsed = repertoire.updatedAt ? Date.parse(repertoire.updatedAt) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Coerce a value that may be an ISO string or a Firestore Timestamp to ISO. */
function toIsoString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; seconds?: number };
    if (typeof candidate.toDate === 'function') {
      return candidate.toDate().toISOString();
    }
    if (typeof candidate.seconds === 'number') {
      return new Date(candidate.seconds * 1000).toISOString();
    }
  }
  return undefined;
}

function parseJsonRecord<T>(value: unknown): Record<string, T> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, T>) : {};
    } catch {
      return {};
    }
  }
  if (value && typeof value === 'object') {
    return value as Record<string, T>;
  }
  return {};
}

export function serializeRepertoireForCloud(repertoire: OpeningRepertoire): SerializedRepertoire {
  return {
    id: repertoire.id,
    name: repertoire.name,
    side: repertoire.side,
    createdAt: repertoire.createdAt,
    updatedAt: repertoire.updatedAt,
    rootNodeId: repertoire.rootNodeId,
    nodes: JSON.stringify(repertoire.nodes),
    stats: JSON.stringify(repertoire.stats),
  };
}

export function deserializeRepertoireFromCloud(data: Record<string, unknown>): RemoteRepertoire {
  const nowIso = new Date().toISOString();
  const createdAt = toIsoString(data.createdAt) ?? nowIso;
  const updatedAt = toIsoString(data.updatedAt) ?? createdAt;
  const deletedAt = toIsoString(data.deletedAt);

  return {
    id: String(data.id ?? ''),
    name: typeof data.name === 'string' ? data.name : 'Repertoire',
    side: data.side === 'black' ? 'black' : 'white',
    createdAt,
    updatedAt,
    rootNodeId: typeof data.rootNodeId === 'string' ? data.rootNodeId : 'root',
    nodes: parseJsonRecord<OpeningMoveNode>(data.nodes),
    stats: parseJsonRecord<OpeningMoveStats>(data.stats),
    ...(deletedAt ? { deletedAt } : {}),
  };
}

function stripTombstone(repertoire: RemoteRepertoire): OpeningRepertoire {
  const { deletedAt: _deletedAt, ...rest } = repertoire;
  return rest;
}

export interface RepertoireReconciliation {
  nextLocal: OpeningRepertoire[];
  localOnlyToUpload: OpeningRepertoire[];
  tombstonedIds: string[];
}

/**
 * Merge a realtime cloud snapshot with the local store. Newest `updatedAt`
 * wins; cloud tombstones remove local copies unless the local copy was edited
 * after the delete (in which case it is resurrected and re-uploaded).
 */
export function reconcileRepertoireSnapshot(
  localRepertoires: OpeningRepertoire[],
  remoteRepertoires: RemoteRepertoire[],
): RepertoireReconciliation {
  const tombstoneRecencyById = new Map<string, number>();
  for (const remote of remoteRepertoires) {
    if (!remote.deletedAt) continue;
    const deletedTs = Date.parse(remote.deletedAt);
    tombstoneRecencyById.set(
      remote.id,
      Number.isNaN(deletedTs) ? repertoireRecency(remote) : deletedTs,
    );
  }

  const tombstonedIdSet = new Set(tombstoneRecencyById.keys());
  const remoteActive = remoteRepertoires.filter((remote) => !tombstonedIdSet.has(remote.id));

  const localSurviving = localRepertoires.filter((local) => {
    const tombstoneRecency = tombstoneRecencyById.get(local.id);
    if (tombstoneRecency == null) return true;
    // A local edit newer than the delete resurrects the repertoire.
    return repertoireRecency(local) > tombstoneRecency;
  });

  const resurrectedIdSet = new Set(
    localSurviving.filter((local) => tombstoneRecencyById.has(local.id)).map((local) => local.id),
  );
  const tombstonedIds = Array.from(tombstoneRecencyById.keys()).filter(
    (id) => !resurrectedIdSet.has(id),
  );

  const byId = new Map<string, OpeningRepertoire>();
  for (const local of localSurviving) {
    byId.set(local.id, local);
  }
  for (const remote of remoteActive) {
    const existing = byId.get(remote.id);
    if (!existing || repertoireRecency(remote) >= repertoireRecency(existing)) {
      byId.set(remote.id, stripTombstone(remote));
    }
  }

  const nextLocal = Array.from(byId.values()).sort(
    (a, b) => repertoireRecency(b) - repertoireRecency(a),
  );

  const remoteActiveIdSet = new Set(remoteActive.map((remote) => remote.id));
  const localOnlyToUpload = nextLocal.filter((repertoire) => !remoteActiveIdSet.has(repertoire.id));

  return { nextLocal, localOnlyToUpload, tombstonedIds };
}
