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

export async function clearSettings(): Promise<void> {
  await store.clear();
}
