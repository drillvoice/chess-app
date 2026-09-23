import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAppCache } from './utils';

describe('clearAppCache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears app caches but never deletes IndexedDB user data', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['chess-training-v5', 'other-cache']),
      delete: deleteCache,
    });
    const deleteDatabase = vi.fn();
    vi.stubGlobal('indexedDB', {
      databases: vi.fn().mockResolvedValue([{ name: 'chess-logger-offline' }]),
      deleteDatabase,
    });

    await clearAppCache();

    expect(deleteCache).toHaveBeenCalledWith('chess-training-v5');
    expect(deleteCache).not.toHaveBeenCalledWith('other-cache');
    expect(deleteDatabase).not.toHaveBeenCalled();
  });
});
