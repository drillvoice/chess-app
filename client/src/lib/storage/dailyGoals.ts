import { withStores } from './transaction';
import type { DailyGoalSettings } from '@shared/schema';
import { logger } from '../logger';

const GOALS = 'daily_goals';

export async function getDailyGoalSettings(): Promise<DailyGoalSettings | null> {
  return withStores([GOALS], 'readonly', async ({ daily_goals }) => {
    const res = await daily_goals.get('current');
    if (!res) return null;
    return {
      ...res,
      lastModified: res.lastModified ? new Date(res.lastModified) : undefined,
    } as DailyGoalSettings;
  });
}

export async function setDailyGoalSettings(settings: DailyGoalSettings): Promise<void> {
  logger.debug('Saving daily goals', settings);
  await withStores([GOALS], 'readwrite', async ({ daily_goals }) => {
    const data = { id: 'current', ...settings, lastModified: new Date().toISOString() };
    await daily_goals.put(data);
  });
}

export async function clearDailyGoalSettings(): Promise<void> {
  await withStores([GOALS], 'readwrite', async ({ daily_goals }) => {
    await daily_goals.delete('current');
  });
}
