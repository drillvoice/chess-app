import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { offlineStorage } from '../offline-storage';

beforeEach(async () => {
  await offlineStorage.clearAll();
});

describe('updateSettings', () => {
  /**
   * Adding one tag sets four writers going at once: the foreground save, the
   * background push to Firestore, the background pull from it, and the realtime
   * settings listener. Each reads the record, merges in JS and writes the whole
   * thing back, so an unserialized cycle let the last writer discard whatever
   * landed after it read — losing a freshly added tag.
   */
  it('does not lose a write made while another mutation is in flight', async () => {
    await offlineStorage.setSettings({ tags: ['a'], lichessUsername: 'someone' });

    // A slow merge, modelling a mutator that awaits before returning.
    const slow = offlineStorage.updateSettings(async (current) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { ...(current ?? {}), tags: [...((current?.tags as string[]) ?? []), 'b'] };
    });
    const fast = offlineStorage.updateSettings((current) => ({
      ...(current ?? {}),
      tags: [...((current?.tags as string[]) ?? []), 'c'],
    }));

    await Promise.all([slow, fast]);

    const stored = await offlineStorage.getSettings();
    expect(stored?.tags).toEqual(['a', 'b', 'c']);
    // Unrelated keys survive both cycles.
    expect(stored?.lichessUsername).toBe('someone');
  });

  it('passes each mutator the record left by the previous one', async () => {
    await offlineStorage.setSettings({ counter: 0 });

    await Promise.all(
      Array.from({ length: 5 }, () =>
        offlineStorage.updateSettings((current) => ({
          ...(current ?? {}),
          counter: ((current?.counter as number) ?? 0) + 1,
        })),
      ),
    );

    expect((await offlineStorage.getSettings())?.counter).toBe(5);
  });

  it('keeps running queued mutations after one of them fails', async () => {
    await offlineStorage.setSettings({ tags: ['a'] });

    const failed = offlineStorage.updateSettings(() => {
      throw new Error('mutator blew up');
    });
    const queued = offlineStorage.updateSettings((current) => ({
      ...(current ?? {}),
      tags: [...((current?.tags as string[]) ?? []), 'b'],
    }));

    await expect(failed).rejects.toThrow('mutator blew up');
    await expect(queued).resolves.toBeTruthy();
    expect((await offlineStorage.getSettings())?.tags).toEqual(['a', 'b']);
  });
});
