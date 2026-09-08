import { offlineStorage } from '../offline-storage';
import type { OpeningRepertoire } from '../opening-trainer/types';
import { ensureFirebase, getCurrentUserId } from './core';
import {
  announceRepertoiresMerged,
  fetchCloudRepertoires,
  markRepertoireDeletedInCloud,
  reportRepertoireSyncFailure,
  upsertRepertoireToCloud,
} from './sync-engine';
import type { RemoteRepertoire } from './sync/repertoire-sync';

// Local-first access to opening repertoires with non-blocking cloud
// write-through for signed-in users, mirroring the session data layer. Reads
// always come from IndexedDB; the realtime listener keeps it in step with the
// cloud across devices.

function canSyncToCloud(): boolean {
  return Boolean(getCurrentUserId());
}

export async function getOpeningRepertoires(): Promise<OpeningRepertoire[]> {
  return offlineStorage.getOpeningRepertoires();
}

export async function saveOpeningRepertoire(
  repertoire: OpeningRepertoire,
): Promise<OpeningRepertoire> {
  const saved = await offlineStorage.saveOpeningRepertoire(repertoire);

  if (canSyncToCloud()) {
    queueMicrotask(() => {
      upsertRepertoireToCloud(saved).catch((error) => {
        // Best-effort write: the realtime snapshot's backfill retries it. It is
        // still recorded on the sync status, because a repertoire that never
        // reaches the cloud is invisible on every other device and the user
        // otherwise has no way to tell.
        reportRepertoireSyncFailure(`Failed to back up repertoire "${saved.name}"`, error);
      });
    });
  }

  return saved;
}

export async function deleteOpeningRepertoire(id: string): Promise<void> {
  await offlineStorage.deleteOpeningRepertoire(id);

  if (canSyncToCloud()) {
    queueMicrotask(() => {
      markRepertoireDeletedInCloud(id).catch((error) => {
        reportRepertoireSyncFailure(`Failed to sync the delete of repertoire ${id}`, error);
      });
    });
  }
}

// ── Cloud recovery ─────────────────────────────────────────────────────────
// Reading the cloud collection directly (tombstones included) is the only way
// to answer "did this repertoire ever reach the cloud?" from a device that
// never held it. A device that has been lost or wiped can no longer re-upload
// anything, so a repertoire that is in the cloud but tombstoned needs an
// explicit restore rather than the reconciler's resurrect-on-edit path.

export interface CloudRepertoireRecord {
  id: string;
  name: string;
  side: OpeningRepertoire['side'];
  moveCount: number;
  updatedAt: string;
  /** ISO timestamp when the cloud copy was deleted; absent when it is live. */
  deletedAt?: string;
  /** Whether this device already holds a copy. */
  presentLocally: boolean;
}

function toCloudRecord(remote: RemoteRepertoire, localIds: Set<string>): CloudRepertoireRecord {
  return {
    id: remote.id,
    name: remote.name,
    side: remote.side,
    moveCount: Math.max(0, Object.keys(remote.nodes).length - 1),
    updatedAt: remote.updatedAt,
    ...(remote.deletedAt ? { deletedAt: remote.deletedAt } : {}),
    presentLocally: localIds.has(remote.id),
  };
}

/**
 * Inventory of the account's cloud repertoire documents, newest first. Returns
 * null when nobody is signed in — there is no cloud to inspect.
 */
export async function listCloudRepertoires(): Promise<CloudRepertoireRecord[] | null> {
  await ensureFirebase();
  const uid = getCurrentUserId();
  if (!uid) return null;

  const [remote, local] = await Promise.all([
    fetchCloudRepertoires(uid),
    offlineStorage.getOpeningRepertoires(),
  ]);
  const localIds = new Set(local.map((repertoire) => repertoire.id));

  return remote
    .map((entry) => toCloudRecord(entry, localIds))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/**
 * Pull one cloud repertoire down to this device, clearing its tombstone if it
 * has one. The local save stamps a fresh `updatedAt`, so the restored copy is
 * newer than the delete and the reconciler keeps it instead of re-applying the
 * tombstone; saving through the write-through layer re-uploads it, which is
 * what actually clears `deletedAt` in the cloud.
 */
export async function restoreCloudRepertoire(id: string): Promise<OpeningRepertoire> {
  await ensureFirebase();
  const uid = getCurrentUserId();
  if (!uid) {
    throw new Error('Sign in to cloud sync before restoring a repertoire.');
  }

  const remote = (await fetchCloudRepertoires(uid)).find((entry) => entry.id === id);
  if (!remote) {
    throw new Error(`Repertoire ${id} is no longer in the cloud.`);
  }

  const { deletedAt: _deletedAt, ...repertoire } = remote;
  const restored = await saveOpeningRepertoire(repertoire);
  announceRepertoiresMerged(await offlineStorage.getOpeningRepertoires());
  return restored;
}
