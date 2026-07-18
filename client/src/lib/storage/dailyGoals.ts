import { withStores } from './transaction';
import type { DailyGoalSettings } from '@shared/schema';
import { sanitizeDailyGoalSettings } from '../daily-goals-model';
import { logger } from '../logger';

const GOALS = 'daily_goals';

export async function getDailyGoalSettings(): Promise<DailyGoalSettings | null> {
  return withStores([GOALS] as const, 'readonly', async ({ daily_goals }) => {
    const res = await daily_goals.get('current');
    if (!res) return null;
    // Persisted records are untrusted input: heal corruption on read so it
    // can't propagate into goal arithmetic or the sync engine.
    return sanitizeDailyGoalSettings(res);
  });
}

export async function setDailyGoalSettings(settings: DailyGoalSettings): Promise<void> {
  logger.debug('Saving daily goals', settings);
  await withStores([GOALS] as const, 'readwrite', async ({ daily_goals }) => {
    const data = { id: 'current', ...settings, lastModified: new Date().toISOString() };
    await daily_goals.put(data);
  });
}

export async function clearDailyGoalSettings(): Promise<void> {
  await withStores([GOALS] as const, 'readwrite', async ({ daily_goals }) => {
    await daily_goals.delete('current');
  });
}
