import { withStores } from './transaction';

const STATS = 'statistics';
const META = 'cache_meta';

export async function getStatistics(): Promise<any> {
  return withStores([STATS] as const, 'readonly', async ({ statistics }) => {
    const res = await statistics.get('current');
    return res?.data || null;
  });
}

export async function setStatistics(stats: any): Promise<void> {
  await withStores([STATS, META] as const, 'readwrite', async ({ statistics, cache_meta }) => {
    await statistics.put({ id: 'current', data: stats });
    await cache_meta.put({ key: 'statistics_last_updated', value: Date.now() });
  });
}

export async function clearStatistics(): Promise<void> {
  await withStores([STATS, META] as const, 'readwrite', async ({ statistics, cache_meta }) => {
    await statistics.clear();
    await cache_meta.delete('statistics_last_updated');
  });
}
