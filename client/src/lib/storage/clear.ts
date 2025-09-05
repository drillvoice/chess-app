import { withStores } from './transaction';

const STORES = ['sessions', 'statistics', 'settings', 'cache_meta', 'sync_queue', 'daily_goals'] as const;

export async function clearAll(): Promise<void> {
  await withStores(STORES, 'readwrite', async (stores) => {
    for (const name of STORES) {
      if (stores[name]) {
        await stores[name].clear();
      }
    }
  });
}
