import type { IDBPObjectStore } from 'idb';
import { getDB } from './db';
import { logger } from '../logger';

export type StoreName =
  | 'settings'
  | 'statistics'
  | 'sessions'
  | 'cache_meta'
  | 'daily_goals'
  | 'sync_queue'
  | 'account_snapshots'
  | 'otb_games';

export async function withStores<N extends readonly StoreName[], M extends IDBTransactionMode, T>(
  storeNames: N,
  mode: M,
  fn: (stores: { [K in N[number]]: IDBPObjectStore<any, any, any, M> }) => Promise<T>,
): Promise<T> {
  const db = await getDB();
  const tx = db.transaction(storeNames, mode);
  const stores = {} as { [K in N[number]]: IDBPObjectStore<any, any, any, M> };
  for (const name of storeNames as readonly N[number][]) {
    stores[name] = tx.objectStore(name) as unknown as IDBPObjectStore<any, any, any, M>;
  }
  try {
    const result = await fn(stores);
    await tx.done;
    return result;
  } catch (error) {
    logger.error('IndexedDB transaction failed', error);
    throw error;
  }
}
