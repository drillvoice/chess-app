import { withStores } from './transaction';

const SETTINGS = 'settings';
const META = 'cache_meta';

export async function getSettings(): Promise<any> {
  return withStores([SETTINGS] as const, 'readonly', async ({ settings }) => {
    const res = await settings.get('current');
    return res?.data || null;
  });
}

export async function setSettings(settingsData: any): Promise<void> {
  await withStores([SETTINGS, META] as const, 'readwrite', async ({ settings, cache_meta }) => {
    await settings.put({ id: 'current', data: settingsData });
    await cache_meta.put({ key: 'settings_last_updated', timestamp: Date.now() });
  });
}

export async function clearSettings(): Promise<void> {
  await withStores([SETTINGS, META] as const, 'readwrite', async ({ settings, cache_meta }) => {
    await settings.clear();
    await cache_meta.delete('settings_last_updated');
  });
}
