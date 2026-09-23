import { afterEach, describe, expect, it, vi } from 'vitest';
import { purgeCachedAppShell } from './utils';

function stubCache(urls: string[]) {
  const deleted: string[] = [];
  return {
    deleted,
    cache: {
      keys: vi.fn().mockResolvedValue(urls.map((url) => ({ url }))),
      delete: vi.fn(async (request: { url: string }) => {
        deleted.push(request.url);
        return true;
      }),
    },
  };
}

describe('purgeCachedAppShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops cached HTML but keeps hashed assets and never deletes IndexedDB user data', async () => {
    const appCache = stubCache([
      'https://app.test/',
      'https://app.test/openings',
      'https://app.test/assets/index-abc123.js',
    ]);
    const otherCache = stubCache(['https://app.test/unrelated']);
    const open = vi.fn(async (name: string) =>
      name === 'chess-training-static' ? appCache.cache : otherCache.cache,
    );
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['chess-training-static', 'other-cache']),
      open,
    });
    const deleteDatabase = vi.fn();
    vi.stubGlobal('indexedDB', {
      databases: vi.fn().mockResolvedValue([{ name: 'chess-logger-offline' }]),
      deleteDatabase,
    });

    await purgeCachedAppShell();

    expect(appCache.deleted).toEqual(['https://app.test/', 'https://app.test/openings']);
    expect(open).not.toHaveBeenCalledWith('other-cache');
    expect(deleteDatabase).not.toHaveBeenCalled();
  });
});
