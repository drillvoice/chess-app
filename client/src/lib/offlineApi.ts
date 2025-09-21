import { offlineStorage } from './offline-storage';
import { sessionEvents } from './session-events';
import './session-event-bridge';
import type { TrainingSession } from '@shared/schema';

// Offline API that mimics the server API but uses IndexedDB via offlineStorage
export const offlineApi = {
  async getStatistics() {
    return await offlineStorage.getStatistics();
  },

  async getAllTrainingSessions(): Promise<TrainingSession[]> {
    return await offlineStorage.getSessions();
  },

  async getTrainingSessionsByType(type: string): Promise<TrainingSession[]> {
    const sessions = await offlineStorage.getSessions();
    return sessions.filter((session) => session.type === type);
  },

  async createTrainingSession(session: TrainingSession): Promise<TrainingSession> {
    await offlineStorage.addSession(session);
    sessionEvents.emit('sessionAdded', session);
    return session;
  },

  async deleteTrainingSession(id: number): Promise<boolean> {
    const sessions = await offlineStorage.getSessions();
    const updated = sessions.filter((session) => session.id !== id);
    await offlineStorage.setSessions(updated);
    sessionEvents.emit('sessionsReplaced', updated);
    sessionEvents.emit('sessionDeleted', { id });
    return true;
  },

  async getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
    const sessions = await offlineStorage.getSessions();
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return sessions
      .filter((s) => s.type === 'goal')
      .filter((s) => s.goalWeekStart && new Date(s.goalWeekStart) >= oneWeekAgo)
      .sort(
        (a, b) =>
          new Date(b.goalWeekStart as Date).getTime() - new Date(a.goalWeekStart as Date).getTime(),
      )[0];
  },

  async exportData(): Promise<string> {
    const sessions = await offlineStorage.getSessions();
    const statistics = await offlineStorage.getStatistics();
    return JSON.stringify({ sessions, statistics });
  },

  async importData(data: string): Promise<void> {
    const parsed = JSON.parse(data);
    if (parsed.sessions) {
      const normalizedSessions = parsed.sessions.map((s: any) => ({
        ...s,
        date: new Date(s.date),
      }));
      await offlineStorage.setSessions(normalizedSessions);
      sessionEvents.emit('sessionsReplaced', normalizedSessions);
    }
    if (parsed.statistics) {
      await offlineStorage.setStatistics(parsed.statistics);
    }
  },
};

// Check if online and use appropriate API
export const isOnline = () => navigator.onLine;

export const apiCall = async (endpoint: string, options?: RequestInit) => {
  if (!isOnline()) {
    // Route to offline API based on endpoint
    if (endpoint === '/api/statistics') {
      return { ok: true, json: () => Promise.resolve(offlineApi.getStatistics()) };
    }
    if (endpoint === '/api/training-sessions') {
      return {
        ok: true,
        json: () => Promise.resolve(offlineApi.getAllTrainingSessions()),
      };
    }
    if (endpoint === '/api/weekly-goal') {
      return {
        ok: true,
        json: () => Promise.resolve(offlineApi.getCurrentWeeklyGoal()),
      };
    }
    if (endpoint.startsWith('/api/training-sessions/') && options?.method === 'POST') {
      const body = options.body ? JSON.parse(options.body as string) : {};
      return {
        ok: true,
        json: () => Promise.resolve(offlineApi.createTrainingSession(body)),
      };
    }
    if (endpoint === '/api/export') {
      return { ok: true, text: () => Promise.resolve(offlineApi.exportData()) };
    }
    if (endpoint === '/api/import' && options?.method === 'POST') {
      const body = options.body ? JSON.parse(options.body as string) : {};
      await offlineApi.importData(body.data);
      return {
        ok: true,
        json: () => Promise.resolve({ message: 'Data imported successfully' }),
      };
    }
  }

  // Online: use regular fetch
  return fetch(endpoint, options);
};
