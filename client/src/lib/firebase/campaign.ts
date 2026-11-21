import { offlineStorage } from '../offline-storage';
import type { CampaignAttempt } from '../campaign/attempts';
import { getCurrentUserId } from './core';
import { upsertCampaignAttemptToCloud } from './sync-engine';

// Local-first campaign attempts with non-blocking cloud write-through, like
// repertoires. A skipped or failed upload is retried by the realtime listener,
// which uploads any local attempt the cloud doesn't have.

export async function getCampaignAttempts(): Promise<CampaignAttempt[]> {
  return offlineStorage.getCampaignAttempts();
}

export async function saveCampaignAttempt(attempt: CampaignAttempt): Promise<CampaignAttempt> {
  const saved = await offlineStorage.addCampaignAttempt(attempt);
  if (getCurrentUserId()) {
    queueMicrotask(() => {
      upsertCampaignAttemptToCloud(saved).catch((error) => {
        console.warn('[campaign] Background cloud sync failed for trial attempt', {
          id: saved.id,
          error,
        });
      });
    });
  }
  return saved;
}
