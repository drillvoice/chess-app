import { trainingSessionsTable, type TrainingSession, type InsertTrainingSession } from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export interface IStorage {
  getTrainingSession(id: number): Promise<TrainingSession | undefined>;
  getAllTrainingSessions(): Promise<TrainingSession[]>;
  getTrainingSessionsByType(type: string): Promise<TrainingSession[]>;
  getTrainingSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]>;
  createTrainingSession(session: InsertTrainingSession): Promise<TrainingSession>;
  deleteTrainingSession(id: number): Promise<boolean>;
  getCurrentWeeklyGoal(): Promise<TrainingSession | undefined>;
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
      duration: insertSession.duration ?? null,
      pointsGained: insertSession.pointsGained ?? null,
      finalScore: insertSession.finalScore ?? null,
      tacticsNotes: insertSession.tacticsNotes ?? null,
      gameResult: insertSession.gameResult ?? null,
      gameType: insertSession.gameType ?? null,
      gameComments: insertSession.gameComments ?? null,
      playerColor: insertSession.playerColor ?? null,
      platform: insertSession.platform ?? null,
      timeControl: insertSession.timeControl ?? null,
      studyType: insertSession.studyType ?? null,
      studyNotes: insertSession.studyNotes ?? null,
      goalTitle: insertSession.goalTitle ?? null,
      goalDescription: insertSession.goalDescription ?? null,
      goalWeekStart: insertSession.type === 'goal' && !insertSession.goalWeekStart ? new Date() : (insertSession.goalWeekStart ?? null),
    };
    this.sessions.set(id, session);
    return session;
  }

  async getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const goals = Array.from(this.sessions.values())
      .filter(session => session.type === 'goal')
      .filter(session => session.goalWeekStart && new Date(session.goalWeekStart) >= oneWeekAgo)
      .sort((a, b) => new Date(b.goalWeekStart!).getTime() - new Date(a.goalWeekStart!).getTime());
    
    return goals[0];
  }

  async deleteTrainingSession(id: number): Promise<boolean> {
    return this.sessions.delete(id);
  }
}

// Use DatabaseStorage instead of MemStorage for persistent data
export class DatabaseStorage implements IStorage {
  async getTrainingSession(id: number): Promise<TrainingSession | undefined> {
    const [session] = await db.select().from(trainingSessionsTable).where(eq(trainingSessionsTable.id, id));
    return session || undefined;
  }

  async getAllTrainingSessions(): Promise<TrainingSession[]> {
    const sessions = await db.select().from(trainingSessionsTable).orderBy(desc(trainingSessionsTable.date));
    return sessions;
  }

  async getTrainingSessionsByType(type: string): Promise<TrainingSession[]> {
    const sessions = await db.select()
      .from(trainingSessionsTable)
      .where(eq(trainingSessionsTable.type, type))
      .orderBy(desc(trainingSessionsTable.date));
    return sessions;
  }

  async getTrainingSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]> {
    const sessions = await db.select()
      .from(trainingSessionsTable)
      .where(
        and(
          gte(trainingSessionsTable.date, startDate),
          lte(trainingSessionsTable.date, endDate)
        )
      )
      .orderBy(desc(trainingSessionsTable.date));
    return sessions;
  }

  async createTrainingSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
    const sessionData = {
      ...insertSession,
      goalWeekStart: insertSession.type === 'goal' && !insertSession.goalWeekStart ? new Date() : insertSession.goalWeekStart,
    };

    const [session] = await db
      .insert(trainingSessionsTable)
      .values(sessionData)
      .returning();
    return session;
  }

  async deleteTrainingSession(id: number): Promise<boolean> {
    const result = await db.delete(trainingSessionsTable).where(eq(trainingSessionsTable.id, id));
    return result.rowCount > 0;
  }

  async getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const [goal] = await db.select()
      .from(trainingSessionsTable)
      .where(
        and(
          eq(trainingSessionsTable.type, 'goal'),
          gte(trainingSessionsTable.goalWeekStart, oneWeekAgo)
        )
      )
      .orderBy(desc(trainingSessionsTable.goalWeekStart))
      .limit(1);
    
    return goal || undefined;
  }
}

export const storage = new DatabaseStorage();
