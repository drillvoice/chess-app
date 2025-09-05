import { withStores } from './transaction';

const SETTINGS = 'settings';
const META = 'cache_meta';

export async function getSettings(): Promise<any> {
  return withStores([SETTINGS], 'readonly', async ({ settings }) => {
    const res = await settings.get('current');
    return res?.data || null;
  });
}

export async function setSettings(settingsData: any): Promise<void> {
  await withStores([SETTINGS, META], 'readwrite', async ({ settings, cache_meta }) => {
    await settings.put({ id: 'current', data: settingsData });
    await cache_meta.put({ key: 'settings_last_updated', timestamp: Date.now() });
  });
}
