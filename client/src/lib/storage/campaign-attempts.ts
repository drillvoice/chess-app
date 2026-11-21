import { withStores } from './transaction';
import { normalizeAttempt, type CampaignAttempt } from '../campaign/attempts';

const STORE = 'campaign_attempts';

/** All stored attempts, validated on read; corrupt records are dropped with a warning. */
export async function getCampaignAttempts(): Promise<CampaignAttempt[]> {
  return withStores([STORE] as const, 'readonly', async ({ campaign_attempts }) => {
    const raw: unknown[] = await campaign_attempts.getAll();
    const valid: CampaignAttempt[] = [];
    for (const record of raw) {
      const attempt = normalizeAttempt(record);
      if (attempt) valid.push(attempt);
      else console.warn('[campaign] Ignoring invalid stored trial attempt', record);
    }
    return valid.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  });
}

export async function addCampaignAttempt(attempt: CampaignAttempt): Promise<CampaignAttempt> {
  const normalized = normalizeAttempt(attempt);
  if (!normalized) {
    throw new Error(`Refusing to save an invalid trial attempt: ${JSON.stringify(attempt)}`);
  }
  await withStores([STORE] as const, 'readwrite', async ({ campaign_attempts }) => {
    await campaign_attempts.put(normalized);
  });
  return normalized;
}

/** Add attempts that arrived from the cloud (already validated by the caller). */
export async function putCampaignAttempts(attempts: CampaignAttempt[]): Promise<void> {
  if (attempts.length === 0) return;
  await withStores([STORE] as const, 'readwrite', async ({ campaign_attempts }) => {
    for (const attempt of attempts) await campaign_attempts.put(attempt);
  });
}
