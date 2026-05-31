import { offlineStorage } from '../offline-storage';
import type { OpeningRepertoire } from '../opening-trainer/types';
import { getCurrentUserId } from './core';
import { markRepertoireDeletedInCloud, upsertRepertoireToCloud } from './sync-engine';

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
        console.warn('Background cloud sync failed for saved repertoire:', error);
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
        console.warn('Background cloud tombstone sync failed for repertoire:', error);
      });
    });
  }
}
