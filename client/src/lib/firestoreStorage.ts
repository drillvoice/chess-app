import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  enableNetwork,
  disableNetwork,
  writeBatch,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { 
  signInAnonymously, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';
import { TrainingSession, InsertTrainingSession } from '@shared/schema';

export class FirestoreStorage {
  private userId: string | null = null;
  private isOnline = true;
  private unsubscribes: (() => void)[] = [];

  constructor() {
    this.initAuth();
  }

  private async initAuth() {
    // Sign in anonymously if not already signed in
    onAuthStateChanged(auth, (user) => {
      if (user) {
        this.userId = user.uid;
      } else {
        this.signInAnonymously();
      }
    });
  }

  private async signInAnonymously() {
    try {
      const userCredential = await signInAnonymously(auth);
      this.userId = userCredential.user.uid;
    } catch (error) {
      console.error('Anonymous sign-in failed:', error);
    }
  }

  private getSessionsCollection() {
    if (!this.userId) throw new Error('User not authenticated');
    return collection(db, 'users', this.userId, 'trainingSessions');
  }

  async getAllSessions(): Promise<TrainingSession[]> {
    if (!this.userId) await this.waitForAuth();
    
    const sessionRef = this.getSessionsCollection();
    const querySnapshot = await getDocs(query(sessionRef, orderBy('date', 'desc')));
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: parseInt(doc.id) || Date.now(), // Use doc ID or timestamp as fallback
        date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
        goalWeekStart: data.goalWeekStart instanceof Timestamp ? data.goalWeekStart.toDate() : data.goalWeekStart ? new Date(data.goalWeekStart) : undefined
      } as TrainingSession;
    });
  }

  async getSessionsByType(type: string): Promise<TrainingSession[]> {
    if (!this.userId) await this.waitForAuth();
    
    const sessionRef = this.getSessionsCollection();
    const querySnapshot = await getDocs(
      query(sessionRef, where('type', '==', type), orderBy('date', 'desc'))
    );
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: parseInt(doc.id) || Date.now(),
        date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
        goalWeekStart: data.goalWeekStart instanceof Timestamp ? data.goalWeekStart.toDate() : data.goalWeekStart ? new Date(data.goalWeekStart) : undefined
      } as TrainingSession;
    });
  }

  async getSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]> {
    if (!this.userId) await this.waitForAuth();
    
    const sessionRef = this.getSessionsCollection();
    const querySnapshot = await getDocs(
      query(
        sessionRef, 
        where('date', '>=', Timestamp.fromDate(startDate)),
        where('date', '<=', Timestamp.fromDate(endDate)),
        orderBy('date', 'desc')
      )
    );
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: parseInt(doc.id) || Date.now(),
        date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
        goalWeekStart: data.goalWeekStart instanceof Timestamp ? data.goalWeekStart.toDate() : data.goalWeekStart ? new Date(data.goalWeekStart) : undefined
      } as TrainingSession;
    });
  }

  async createSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
    if (!this.userId) await this.waitForAuth();
    
    const sessionRef = this.getSessionsCollection();
    const sessionData = {
      ...insertSession,
      date: insertSession.date ? Timestamp.fromDate(insertSession.date) : Timestamp.fromDate(new Date()),
      goalWeekStart: insertSession.type === 'goal' && insertSession.goalWeekStart 
        ? Timestamp.fromDate(insertSession.goalWeekStart)
        : insertSession.type === 'goal' && !insertSession.goalWeekStart
        ? Timestamp.fromDate(new Date())
        : insertSession.goalWeekStart
        ? Timestamp.fromDate(insertSession.goalWeekStart)
        : undefined,
      createdAt: serverTimestamp()
    };

    const docRef = await addDoc(sessionRef, sessionData);
    
    return {
      ...insertSession,
      id: parseInt(docRef.id) || Date.now(),
      date: insertSession.date || new Date(),
      goalWeekStart: insertSession.type === 'goal' && !insertSession.goalWeekStart ? new Date() : insertSession.goalWeekStart,
    } as TrainingSession;
  }

  async deleteSession(id: number): Promise<boolean> {
    if (!this.userId) await this.waitForAuth();
    
    try {
      const sessionRef = doc(this.getSessionsCollection(), id.toString());
      await deleteDoc(sessionRef);
      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      return false;
    }
  }

  async getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
    if (!this.userId) await this.waitForAuth();
    
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const sessionRef = this.getSessionsCollection();
    const querySnapshot = await getDocs(
      query(
        sessionRef,
        where('type', '==', 'goal'),
        where('goalWeekStart', '>=', Timestamp.fromDate(oneWeekAgo)),
        orderBy('goalWeekStart', 'desc')
      )
    );
    
    if (querySnapshot.empty) return undefined;
    
    const doc = querySnapshot.docs[0];
    const data = doc.data();
    
    return {
      ...data,
      id: parseInt(doc.id) || Date.now(),
      date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
      goalWeekStart: data.goalWeekStart instanceof Timestamp ? data.goalWeekStart.toDate() : new Date(data.goalWeekStart)
    } as TrainingSession;
  }

  async exportData(): Promise<string> {
    const sessions = await this.getAllSessions();
    return JSON.stringify(sessions, null, 2);
  }

  async importData(data: string): Promise<void> {
    if (!this.userId) await this.waitForAuth();
    
    try {
      const sessions: TrainingSession[] = JSON.parse(data);
      const sessionRef = this.getSessionsCollection();
      const batch = writeBatch(db);
      
      sessions.forEach(session => {
        const docRef = doc(sessionRef, session.id.toString());
        const sessionData = {
          ...session,
          date: Timestamp.fromDate(session.date),
          goalWeekStart: session.goalWeekStart ? Timestamp.fromDate(session.goalWeekStart) : undefined,
          createdAt: serverTimestamp()
        };
        batch.set(docRef, sessionData);
      });
      
      await batch.commit();
    } catch (error) {
      throw new Error('Invalid data format');
    }
  }

  async getStatistics() {
    const sessions = await this.getAllSessions();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const totalSessions = sessions.length;
    const totalHours = sessions.reduce((sum, session) => sum + (session.duration || 0), 0) / 60;
    
    const tacticsSession = sessions.filter(s => s.type === 'tactics').pop();
    const tacticsRating = tacticsSession?.finalScore || 0;
    
    const gamesSessions = sessions.filter(s => s.type === 'game');
    const wins = gamesSessions.filter(s => s.gameResult === 'win').length;
    const draws = gamesSessions.filter(s => s.gameResult === 'draw').length;
    const losses = gamesSessions.filter(s => s.gameResult === 'loss').length;
    const winRate = gamesSessions.length > 0 ? Math.round((wins / gamesSessions.length) * 100) : 0;
    
    const todaySessions = sessions.filter(s => new Date(s.date) >= today);
    const todayTotalTime = todaySessions.reduce((sum, session) => sum + (session.duration || 0), 0);
    
    return {
      totalHours: Math.round(totalHours * 10) / 10,
      totalSessions,
      tacticsRating,
      winRate,
      todayTotalTime,
      todaySessions: todaySessions.length,
      gameStats: {
        wins,
        draws,
        losses,
        total: gamesSessions.length
      }
    };
  }

  async getStorageInfo() {
    const sessions = await this.getAllSessions();
    const totalSessions = sessions.length;
    const storageSize = JSON.stringify(sessions).length;
    
    return {
      totalSessions,
      storageSize,
      storageType: 'Firestore Cloud',
      syncStatus: this.isOnline ? 'Online' : 'Offline',
      userId: this.userId
    };
  }

  // Real-time listeners for live updates
  subscribeToSessions(callback: (sessions: TrainingSession[]) => void) {
    if (!this.userId) return () => {};
    
    const sessionRef = this.getSessionsCollection();
    const unsubscribe = onSnapshot(
      query(sessionRef, orderBy('date', 'desc')),
      (snapshot) => {
        const sessions = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: parseInt(doc.id) || Date.now(),
            date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
            goalWeekStart: data.goalWeekStart instanceof Timestamp ? data.goalWeekStart.toDate() : data.goalWeekStart ? new Date(data.goalWeekStart) : undefined
          } as TrainingSession;
        });
        callback(sessions);
      }
    );
    
    this.unsubscribes.push(unsubscribe);
    return unsubscribe;
  }

  // Network management
  async goOnline() {
    await enableNetwork(db);
    this.isOnline = true;
  }

  async goOffline() {
    await disableNetwork(db);
    this.isOnline = false;
  }

  // Utility to wait for authentication
  private async waitForAuth(): Promise<void> {
    if (this.userId) return;
    
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          this.userId = user.uid;
          unsubscribe();
          resolve();
        }
      });
    });
  }

  // Cleanup method
  cleanup() {
    this.unsubscribes.forEach(unsubscribe => unsubscribe());
    this.unsubscribes = [];
  }
}

export const firestoreStorage = new FirestoreStorage();