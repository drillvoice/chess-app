import { createSingleRecordStore } from './single-record-store';
// Type-only import: no runtime dependency on the firebase layer.
import type { UserSettings } from '../firebase/settings';

// Settings are an open bag: cloud sync merges arbitrary keys into them (see
// mergeSettingsForSync) and unknown keys must survive round trips, so the
// stored shape is UserSettings plus any extra keys.
export type StoredSettings = UserSettings & Record<string, unknown>;

const store = createSingleRecordStore<StoredSettings>('settings', 'settings_last_updated');

export async function getSettings(): Promise<StoredSettings | null> {
  return store.get();
}

export async function setSettings(
  settingsData: UserSettings | Record<string, unknown>,
): Promise<void> {
  await store.set(settingsData as StoredSettings);
}

/**
 * Serializes the read-modify-write cycles that every settings writer performs.
 *
 * The settings document is a single record that several callers mutate at once:
 * saving a tag, the background push to Firestore, the background pull from it,
 * and the realtime settings listener all run concurrently after one tag is
 * added. Each used to read the record, merge in JS, and write the whole thing
 * back — so whichever wrote last silently discarded every change that landed
 * after it read. A freshly added tag could disappear that way.
 *
 * Running each cycle through this chain guarantees the mutator sees the record
 * as it stands at the moment it runs, rather than a copy taken before some
 * other writer committed. Chaining is enough because IndexedDB is the single
 * source of truth here and every writer in the app goes through this module.
 */
let settingsMutationChain: Promise<unknown> = Promise.resolve();

export async function updateSettings(
  mutate: (current: StoredSettings | null) => StoredSettings | Promise<StoredSettings>,
): Promise<StoredSettings> {
  const run = settingsMutationChain.then(async () => {
    const current = await store.get();
    const next = await mutate(current);
    await store.set(next);
    return next;
  });

  // Swallow the rejection on the chain itself so one failed mutation does not
  // reject every mutation queued behind it; `run` still rejects for the caller.
  settingsMutationChain = run.catch(() => undefined);

  return run;
}

export async function clearSettings(): Promise<void> {
  await store.clear();
}
