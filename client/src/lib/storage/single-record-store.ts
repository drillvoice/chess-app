import { withStores, type StoreName } from './transaction';

/**
 * Accessor for stores that hold exactly one record under the id 'current'
 * (settings, statistics), with a cache_meta timestamp maintained alongside.
 * Centralizes the get/set/clear boilerplate that was previously duplicated
 * per store.
 */
export function createSingleRecordStore<T>(storeName: StoreName, metaKey: string) {
  const META = 'cache_meta' as const;

  return {
    async get(): Promise<T | null> {
      return withStores([storeName] as const, 'readonly', async (stores) => {
        const store = stores[storeName as keyof typeof stores];
        const res = (await store.get('current')) as { data?: T } | undefined;
        return res?.data ?? null;
      });
    },

    async set(data: T): Promise<void> {
      await withStores([storeName, META] as const, 'readwrite', async (stores) => {
        const store = stores[storeName as keyof typeof stores];
        await store.put({ id: 'current', data });
        await stores[META].put({ key: metaKey, value: Date.now() });
      });
    },

    async clear(): Promise<void> {
      await withStores([storeName, META] as const, 'readwrite', async (stores) => {
        const store = stores[storeName as keyof typeof stores];
        await store.clear();
        await stores[META].delete(metaKey);
      });
    },
  };
}
