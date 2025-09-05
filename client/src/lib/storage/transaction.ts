import type { IDBPObjectStore } from 'idb';
import { getDB } from './db';
import { logger } from '../logger';

export async function withStores<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  fn: (stores: Record<string, IDBPObjectStore<any>>) => Promise<T>,
): Promise<T> {
  const db = await getDB();
  const tx = db.transaction(storeNames, mode);
  const stores: Record<string, IDBPObjectStore<any>> = {};
  for (const name of storeNames) {
    stores[name] = tx.objectStore(name);
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
