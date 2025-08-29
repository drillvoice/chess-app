// Enhanced storage layer using Capacitor's native storage
import { Preferences } from '@capacitor/preferences';
import { Device } from '@capacitor/device';
import type { TrainingSession } from '@shared/schema';

interface CapacitorStorageOptions {
  useNativeStorage: boolean;
  fallbackToIndexedDB: boolean;
}

class CapacitorStorage {
  private useNative = false;
  private fallbackStorage: any;

  async init(
    options: CapacitorStorageOptions = { useNativeStorage: true, fallbackToIndexedDB: true },
  ): Promise<void> {
    try {
      // Check if we're running in a Capacitor environment
      const info = await Device.getInfo();
      this.useNative =
        options.useNativeStorage && (info.platform === 'android' || info.platform === 'ios');

      if (!this.useNative && options.fallbackToIndexedDB) {
        // Fallback to IndexedDB for web
        const { offlineStorage } = await import('./offline-storage');
        this.fallbackStorage = offlineStorage;
        await this.fallbackStorage.init();
      }

      console.log(
        `CapacitorStorage initialized: native=${this.useNative}, platform=${info.platform}`,
      );
    } catch (error) {
      console.warn('Failed to initialize Capacitor storage, using fallback:', error);
      if (options.fallbackToIndexedDB) {
        const { offlineStorage } = await import('./offline-storage');
        this.fallbackStorage = offlineStorage;
        await this.fallbackStorage.init();
      }
    }
  }

  async getSessions(): Promise<TrainingSession[]> {
    if (this.useNative) {
      try {
        const { value } = await Preferences.get({ key: 'chess_sessions' });
        if (value) {
          const sessions = JSON.parse(value);
          return sessions.map((session: any) => ({
            ...session,
            date: new Date(session.date),
          }));
        }
        return [];
      } catch (error) {
        console.error('Native storage getSessions failed:', error);
        if (this.fallbackStorage) {
          return this.fallbackStorage.getSessions();
        }
        return [];
      }
    } else {
      return this.fallbackStorage ? this.fallbackStorage.getSessions() : [];
    }
  }

  async setSessions(sessions: TrainingSession[]): Promise<void> {
    if (this.useNative) {
      try {
        const serializedSessions = sessions.map((session) => ({
          ...session,
          date: session.date.toISOString(),
        }));
        await Preferences.set({
          key: 'chess_sessions',
          value: JSON.stringify(serializedSessions),
        });
      } catch (error) {
        console.error('Native storage setSessions failed:', error);
        if (this.fallbackStorage) {
          return this.fallbackStorage.setSessions(sessions);
        }
      }
    } else {
      return this.fallbackStorage ? this.fallbackStorage.setSessions(sessions) : Promise.resolve();
    }
  }

  async addSession(session: TrainingSession): Promise<void> {
    if (this.useNative) {
      try {
        const sessions = await this.getSessions();
        sessions.push(session);
        await this.setSessions(sessions);
      } catch (error) {
        console.error('Native storage addSession failed:', error);
        if (this.fallbackStorage) {
          return this.fallbackStorage.addSession(session);
        }
      }
    } else {
      return this.fallbackStorage ? this.fallbackStorage.addSession(session) : Promise.resolve();
    }
  }

  async getSettings(): Promise<any> {
    if (this.useNative) {
      try {
        const { value } = await Preferences.get({ key: 'chess_settings' });
        return value ? JSON.parse(value) : null;
      } catch (error) {
        console.error('Native storage getSettings failed:', error);
        if (this.fallbackStorage) {
          return this.fallbackStorage.getSettings();
        }
        return null;
      }
    } else {
      return this.fallbackStorage ? this.fallbackStorage.getSettings() : null;
    }
  }

  async setSettings(settings: any): Promise<void> {
    if (this.useNative) {
      try {
        await Preferences.set({
          key: 'chess_settings',
          value: JSON.stringify(settings),
        });
      } catch (error) {
        console.error('Native storage setSettings failed:', error);
        if (this.fallbackStorage) {
          return this.fallbackStorage.setSettings(settings);
        }
      }
    } else {
      return this.fallbackStorage ? this.fallbackStorage.setSettings(settings) : Promise.resolve();
    }
  }

  async getStatistics(): Promise<any> {
    if (this.useNative) {
      try {
        const { value } = await Preferences.get({ key: 'chess_statistics' });
        return value ? JSON.parse(value) : null;
      } catch (error) {
        console.error('Native storage getStatistics failed:', error);
        if (this.fallbackStorage) {
          return this.fallbackStorage.getStatistics();
        }
        return null;
      }
    } else {
      return this.fallbackStorage ? this.fallbackStorage.getStatistics() : null;
    }
  }

  async setStatistics(stats: any): Promise<void> {
    if (this.useNative) {
      try {
        await Preferences.set({
          key: 'chess_statistics',
          value: JSON.stringify(stats),
        });
      } catch (error) {
        console.error('Native storage setStatistics failed:', error);
        if (this.fallbackStorage) {
          return this.fallbackStorage.setStatistics(stats);
        }
      }
    } else {
      return this.fallbackStorage ? this.fallbackStorage.setStatistics(stats) : Promise.resolve();
    }
  }

  async clear(): Promise<void> {
    if (this.useNative) {
      try {
        await Preferences.clear();
      } catch (error) {
        console.error('Native storage clear failed:', error);
        if (this.fallbackStorage) {
          return this.fallbackStorage.clear();
        }
      }
    } else {
      return this.fallbackStorage ? this.fallbackStorage.clear() : Promise.resolve();
    }
  }

  // Get storage info for debugging
  async getStorageInfo(): Promise<{ type: string; platform: string; available: boolean }> {
    try {
      const info = await Device.getInfo();
      return {
        type: this.useNative ? 'native-preferences' : 'indexeddb',
        platform: info.platform,
        available: this.useNative || !!this.fallbackStorage,
      };
    } catch (error) {
      return {
        type: 'unknown',
        platform: 'unknown',
        available: false,
      };
    }
  }
}

export const capacitorStorage = new CapacitorStorage();
