import { type TrainingSession, type InsertTrainingSession } from '@shared/schema';

export interface IStorage {
  getTrainingSession(id: number): Promise<TrainingSession | undefined>;
  getAllTrainingSessions(): Promise<TrainingSession[]>;
  getTrainingSessionsByType(type: string): Promise<TrainingSession[]>;
  getTrainingSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]>;
  createTrainingSession(session: InsertTrainingSession): Promise<TrainingSession>;
  deleteTrainingSession(id: number): Promise<boolean>;
  getCurrentWeeklyGoal(): Promise<TrainingSession | undefined>;
  exportData(): Promise<string>;
  importData(data: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private sessions: Map<number, TrainingSession>;
  private currentId: number;

  constructor() {
    this.sessions = new Map();
    this.currentId = 1;
  }

  /**
   * Returns all sessions as an array for further processing.
   * Using a helper avoids repeating Array.from calls throughout the class.
   */
  private sessionsArray(): TrainingSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Sort comparator for sessions by date in descending order.
   */
  private static sortByDateDesc(a: TrainingSession, b: TrainingSession): number {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  }

  async getTrainingSession(id: number): Promise<TrainingSession | undefined> {
    return this.sessions.get(id);
  }

  async getAllTrainingSessions(): Promise<TrainingSession[]> {
    return this.sessionsArray().sort(MemStorage.sortByDateDesc);
  }

  async getTrainingSessionsByType(type: string): Promise<TrainingSession[]> {
    return this.sessionsArray()
      .filter((session) => session.type === type)
      .sort(MemStorage.sortByDateDesc);
  }

  async getTrainingSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]> {
    return this.sessionsArray()
      .filter((session) => {
        const sessionDate = new Date(session.date);
        return sessionDate >= startDate && sessionDate <= endDate;
      })
      .sort(MemStorage.sortByDateDesc);
  }

  async createTrainingSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
    const id = this.currentId++;
    const providedDate = insertSession.date ? new Date(insertSession.date) : null;
    const sessionDate =
      providedDate && !Number.isNaN(providedDate.getTime()) ? providedDate : new Date();
    const session: TrainingSession = {
      ...insertSession,
      id,
      date: sessionDate,
      duration: insertSession.duration ?? null,
      pointsGained: insertSession.pointsGained ?? null,
      finalScore: insertSession.finalScore ?? null,
      puzzlesAttempted: insertSession.puzzlesAttempted ?? null,
      puzzlesCorrect: insertSession.puzzlesCorrect ?? null,
      tacticsNotes: insertSession.tacticsNotes ?? null,
      gameResult: insertSession.gameResult ?? null,
      gameType: insertSession.gameType ?? null,
      gameComments: insertSession.gameComments ?? null,
      playerColor: insertSession.playerColor ?? null,
      platform: insertSession.platform ?? null,
      timeControl: insertSession.timeControl ?? null,
      opponentUsername: insertSession.opponentUsername ?? null,
      studyType: insertSession.studyType ?? null,
      studyTags: insertSession.studyTags ?? null,
      studyNotes: insertSession.studyNotes ?? null,
      goalTitle: insertSession.goalTitle ?? null,
      goalDescription: insertSession.goalDescription ?? null,
      goalWeekStart:
        insertSession.type === 'goal' && !insertSession.goalWeekStart
          ? new Date()
          : (insertSession.goalWeekStart ?? null),
      needsReview: insertSession.needsReview ?? false,
    };
    this.sessions.set(id, session);
    return session;
  }

  async getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const goals = Array.from(this.sessions.values())
      .filter((session) => session.type === 'goal')
      .filter((session) => session.goalWeekStart && new Date(session.goalWeekStart) >= oneWeekAgo)
      .sort((a, b) => new Date(b.goalWeekStart!).getTime() - new Date(a.goalWeekStart!).getTime());

    return goals[0];
  }

  async deleteTrainingSession(id: number): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async exportData(): Promise<string> {
    const sessions = Array.from(this.sessions.values());
    return JSON.stringify(sessions, null, 2);
  }

  async importData(data: string): Promise<void> {
    try {
      const sessions: TrainingSession[] = JSON.parse(data);
      this.sessions.clear();
      let maxId = 0;

      for (const session of sessions) {
        this.sessions.set(session.id, session);
        if (session.id > maxId) {
          maxId = session.id;
        }
      }

      this.currentId = maxId + 1;
    } catch (_error) {
      throw new Error('Invalid data format');
    }
  }
}

export const storage = new MemStorage();
