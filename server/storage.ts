import { trainingSessionsTable, type TrainingSession, type InsertTrainingSession } from "@shared/schema";

export interface IStorage {
  getTrainingSession(id: number): Promise<TrainingSession | undefined>;
  getAllTrainingSessions(): Promise<TrainingSession[]>;
  getTrainingSessionsByType(type: string): Promise<TrainingSession[]>;
  getTrainingSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]>;
  createTrainingSession(session: InsertTrainingSession): Promise<TrainingSession>;
  deleteTrainingSession(id: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private sessions: Map<number, TrainingSession>;
  private currentId: number;

  constructor() {
    this.sessions = new Map();
    this.currentId = 1;
  }

  async getTrainingSession(id: number): Promise<TrainingSession | undefined> {
    return this.sessions.get(id);
  }

  async getAllTrainingSessions(): Promise<TrainingSession[]> {
    return Array.from(this.sessions.values()).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  async getTrainingSessionsByType(type: string): Promise<TrainingSession[]> {
    return Array.from(this.sessions.values())
      .filter(session => session.type === type)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async getTrainingSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]> {
    return Array.from(this.sessions.values())
      .filter(session => {
        const sessionDate = new Date(session.date);
        return sessionDate >= startDate && sessionDate <= endDate;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async createTrainingSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
    const id = this.currentId++;
    const session: TrainingSession = {
      ...insertSession,
      id,
      date: new Date(),
    };
    this.sessions.set(id, session);
    return session;
  }

  async deleteTrainingSession(id: number): Promise<boolean> {
    return this.sessions.delete(id);
  }
}

export const storage = new MemStorage();
