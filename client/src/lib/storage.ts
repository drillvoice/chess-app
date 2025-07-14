import { TrainingSession, InsertTrainingSession } from "@shared/schema";

class LocalStorage {
  private storageKey = 'chess-training-sessions';
  private currentIdKey = 'chess-training-current-id';

  private getSessions(): Map<number, TrainingSession> {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return new Map();
    
    const sessions: TrainingSession[] = JSON.parse(stored);
    return new Map(sessions.map(session => [session.id, session]));
  }

  private saveSessions(sessions: Map<number, TrainingSession>): void {
    const sessionsArray = Array.from(sessions.values());
    localStorage.setItem(this.storageKey, JSON.stringify(sessionsArray));
  }

  private getCurrentId(): number {
    const stored = localStorage.getItem(this.currentIdKey);
    return stored ? parseInt(stored) : 1;
  }

  private setCurrentId(id: number): void {
    localStorage.setItem(this.currentIdKey, id.toString());
  }

  getAllSessions(): TrainingSession[] {
    return Array.from(this.getSessions().values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  getSessionsByType(type: string): TrainingSession[] {
    return this.getAllSessions().filter(session => session.type === type);
  }

  getSessionsByDateRange(startDate: Date, endDate: Date): TrainingSession[] {
    return this.getAllSessions().filter(session => {
      const sessionDate = new Date(session.date);
      return sessionDate >= startDate && sessionDate <= endDate;
    });
  }

  createSession(insertSession: InsertTrainingSession): TrainingSession {
    const sessions = this.getSessions();
    const currentId = this.getCurrentId();
    
    const session: TrainingSession = {
      ...insertSession,
      id: currentId,
      date: insertSession.date || new Date(),
      goalWeekStart: insertSession.type === 'goal' && !insertSession.goalWeekStart ? new Date() : insertSession.goalWeekStart,
    };

    sessions.set(currentId, session);
    this.saveSessions(sessions);
    this.setCurrentId(currentId + 1);
    
    return session;
  }

  deleteSession(id: number): boolean {
    const sessions = this.getSessions();
    const deleted = sessions.delete(id);
    if (deleted) {
      this.saveSessions(sessions);
    }
    return deleted;
  }

  getCurrentWeeklyGoal(): TrainingSession | undefined {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const goals = this.getAllSessions()
      .filter(session => session.type === 'goal')
      .filter(session => session.goalWeekStart && new Date(session.goalWeekStart) >= oneWeekAgo)
      .sort((a, b) => new Date(b.goalWeekStart!).getTime() - new Date(a.goalWeekStart!).getTime());
    
    return goals[0];
  }

  exportData(): string {
    const sessions = this.getAllSessions();
    return JSON.stringify(sessions, null, 2);
  }

  importData(data: string): void {
    try {
      const sessions: TrainingSession[] = JSON.parse(data);
      const sessionMap = new Map<number, TrainingSession>();
      let maxId = 0;
      
      for (const session of sessions) {
        sessionMap.set(session.id, session);
        if (session.id > maxId) {
          maxId = session.id;
        }
      }
      
      this.saveSessions(sessionMap);
      this.setCurrentId(maxId + 1);
    } catch (error) {
      throw new Error('Invalid data format');
    }
  }

  getStatistics() {
    const sessions = this.getAllSessions();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const totalSessions = sessions.length;
    const totalHours = sessions.reduce((sum, session) => sum + (session.duration || 0), 0) / 60;
    
    const tacticsSession = sessions.filter(s => s.type === 'tactics').pop();
    const tacticsRating = tacticsSession?.finalScore || 0;
    
    const gamesSessions = sessions.filter(s => s.type === 'game');
    const wins = gamesSessions.filter(s => s.gameResult === 'win').length;
    const winRate = gamesSessions.length > 0 ? Math.round((wins / gamesSessions.length) * 100) : 0;
    
    const todaySessions = sessions.filter(s => new Date(s.date) >= today);
    const todayTotalTime = todaySessions.reduce((sum, session) => sum + (session.duration || 0), 0);
    
    return {
      totalHours: Math.round(totalHours * 10) / 10,
      totalSessions,
      tacticsRating,
      winRate,
      todayTotalTime,
      todaySessions: todaySessions.length
    };
  }
}

export const localStorage = new LocalStorage();