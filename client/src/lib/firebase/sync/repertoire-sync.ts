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
  /**
   * Always written as null so a merge-write clears any tombstone the document
   * already carries. Uploads use `setDoc(..., { merge: true })`, so omitting
   * the field would leave a `deletedAt` from an earlier delete in place: the
   * repertoire would look alive on the device that re-saved it and stay
   * invisible on every other device, because their reconcilers still see the
   * tombstone.
   */
  deletedAt: null;
}

/**
 * Firestore's hard per-document ceiling is 1 MiB (1,048,576 bytes) including
 * field names and overhead; we leave headroom so the estimate below never
 * under-reports a document the server would reject.
 */
export const MAX_REPERTOIRE_DOCUMENT_BYTES = 1_000_000;

/**
 * Approximate the stored size of a repertoire document. Firestore charges a
 * string field its UTF-8 byte length plus one, and the move tree and stats
 * dwarf every other field, so counting their bytes is close enough to catch an
 * import that would be rejected before we hand it to the server.
 */
export function estimateRepertoireDocumentBytes(serialized: SerializedRepertoire): number {
  const encoder = new TextEncoder();
  let bytes = 0;
  for (const [key, value] of Object.entries(serialized)) {
    bytes += encoder.encode(key).length + 1;
    if (typeof value === 'string') {
      bytes += encoder.encode(value).length + 1;
    } else {
      bytes += 8;
    }
  }
  return bytes;
}

/**
 * Describe why a repertoire cannot be stored as a single Firestore document, or
 * null when it fits. Firestore answers an oversized write with a generic
 * `invalid-argument`, so the check happens here and names the repertoire.
 */
export function describeOversizedRepertoire(
  repertoire: OpeningRepertoire,
  serialized: SerializedRepertoire = serializeRepertoireForCloud(repertoire),
): string | null {
  const estimatedBytes = estimateRepertoireDocumentBytes(serialized);
  if (estimatedBytes <= MAX_REPERTOIRE_DOCUMENT_BYTES) return null;
  const moveCount = Math.max(0, Object.keys(repertoire.nodes).length - 1);
  return (
    `Repertoire "${repertoire.name}" is too large to sync: ` +
    `${Math.round(estimatedBytes / 1024)}KB (${moveCount} moves) exceeds Firestore's ` +
    '1MB per-document limit. Split it into smaller repertoires to sync it across devices.'
  );
}

/**
 * Identity of a repertoire set for change detection: ids plus their recency.
 * Cloud snapshots re-fire on every echo of our own writes, so the UI is only
 * told to re-read when the reconciled set actually differs.
 */
export function repertoireSetSignature(repertoires: OpeningRepertoire[]): string {
  return repertoires
    .map((repertoire) => `${repertoire.id}@${repertoire.updatedAt}`)
    .sort()
    .join('|');
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
    deletedAt: null,
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
  repertoiresToUpload: OpeningRepertoire[];
  tombstonedIds: string[];
}

/**
 * Merge a realtime cloud snapshot with the local store. Newest `updatedAt`
 * wins; cloud tombstones remove local copies unless the local copy was edited
 * after the delete (in which case it is resurrected and re-uploaded).
 *
 * `repertoiresToUpload` covers the locally-newer copies as well as the ones the
 * cloud has never seen — the same reason `reconcileRealtimeSnapshot` does. A
 * repertoire edit reaches Firestore through one fire-and-forget write that is
 * skipped when it runs before Firebase auth resolves, and nothing retries it;
 * restricting the upload set to documents missing from the cloud left such an
 * edit sitting locally forever, because the document itself was already there.
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

  const remoteActiveRecencyById = new Map(
    remoteActive.map((remote) => [remote.id, repertoireRecency(remote)]),
  );
  // Strictly newer, so the echo of an upload — which leaves both sides on the
  // same updatedAt — does not queue another one.
  const repertoiresToUpload = nextLocal.filter((repertoire) => {
    const remoteRecency = remoteActiveRecencyById.get(repertoire.id);
    if (remoteRecency == null) return true;
    return repertoireRecency(repertoire) > remoteRecency;
  });

  return { nextLocal, repertoiresToUpload, tombstonedIds };
}
