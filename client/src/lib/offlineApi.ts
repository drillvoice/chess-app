import { localStorage } from "./storage";

// Offline API that mimics the server API but uses localStorage
export const offlineApi = {
  async getStatistics() {
    return localStorage.getStatistics();
  },

  async getAllTrainingSessions() {
    return localStorage.getAllSessions();
  },

  async getTrainingSessionsByType(type: string) {
    return localStorage.getSessionsByType(type);
  },

  async createTrainingSession(session: any) {
    return localStorage.createSession(session);
  },

  async deleteTrainingSession(id: number) {
    return localStorage.deleteSession(id);
  },

  async getCurrentWeeklyGoal() {
    return localStorage.getCurrentWeeklyGoal();
  },

  async exportData() {
    return localStorage.exportData();
  },

  async importData(data: string) {
    return localStorage.importData(data);
  }
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
      return { ok: true, json: () => Promise.resolve(offlineApi.getAllTrainingSessions()) };
    }
    if (endpoint === '/api/weekly-goal') {
      return { ok: true, json: () => Promise.resolve(offlineApi.getCurrentWeeklyGoal()) };
    }
    if (endpoint.startsWith('/api/training-sessions/') && options?.method === 'POST') {
      const body = options.body ? JSON.parse(options.body as string) : {};
      return { ok: true, json: () => Promise.resolve(offlineApi.createTrainingSession(body)) };
    }
    if (endpoint === '/api/export') {
      return { ok: true, text: () => Promise.resolve(offlineApi.exportData()) };
    }
    if (endpoint === '/api/import' && options?.method === 'POST') {
      const body = options.body ? JSON.parse(options.body as string) : {};
      offlineApi.importData(body.data);
      return { ok: true, json: () => Promise.resolve({ message: 'Data imported successfully' }) };
    }
  }
  
  // Online: use regular fetch
  return fetch(endpoint, options);
};