import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  setDoc,
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
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        this.userId = user.uid;
      } else {
        try {
          const userCred = await signInAnonymously(auth);
          this.userId = userCred.user.uid;
        } catch (error) {
          console.error('Firebase auth failed:', error);
        }
      }
    });
  }

  private async signInAnonymously() {
    try {
      const userCred = await signInAnonymously(auth);
      this.userId = userCred.user.uid;
      return userCred.user;
    } catch (error) {
      console.error('Anonymous sign-in failed:', error);
      throw error;
    }
  }

  private getSessionsCollection() {
    if (!this.userId) throw new Error('User not authenticated');
    return collection(db, 'users', this.userId, 'trainingSessions');
  }

  async getAllSessions(): Promise<TrainingSession[]> {
    await this.waitForAuth();
    
    try {
      const sessionsRef = this.getSessionsCollection();
      const q = query(sessionsRef, orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: parseInt(doc.id),
        ...doc.data(),
        date: doc.data().date.toDate()
      })) as TrainingSession[];
    } catch (error) {
      console.error('Error getting sessions:', error);
      return [];
    }
  }

  async getSessionsByType(type: string): Promise<TrainingSession[]> {
    await this.waitForAuth();
    
    try {
      const sessionsRef = this.getSessionsCollection();
      const q = query(
        sessionsRef, 
        where('type', '==', type),
        orderBy('date', 'desc')
      );
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: parseInt(doc.id),
        ...doc.data(),
        date: doc.data().date.toDate()
      })) as TrainingSession[];
    } catch (error) {
      console.error('Error getting sessions by type:', error);
      return [];
    }
  }

  async getSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]> {
    await this.waitForAuth();
    
    try {
      const sessionsRef = this.getSessionsCollection();
      const q = query(
        sessionsRef,
        where('date', '>=', Timestamp.fromDate(startDate)),
        where('date', '<=', Timestamp.fromDate(endDate)),
        orderBy('date', 'desc')
      );
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: parseInt(doc.id),
        ...doc.data(),
        date: doc.data().date.toDate()
      })) as TrainingSession[];
    } catch (error) {
      console.error('Error getting sessions by date range:', error);
      return [];
    }
  }

  async createSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
    await this.waitForAuth();
    
    try {
      const sessionsRef = this.getSessionsCollection();
      
      // Generate a unique ID based on timestamp
      const id = Date.now();
      const sessionData = {
        ...insertSession,
        id,
        date: Timestamp.fromDate(insertSession.date),
        createdAt: serverTimestamp()
      };
      
      // Use setDoc with custom ID for consistent document reference
      const docRef = doc(sessionsRef, id.toString());
      await setDoc(docRef, sessionData);
      
      return {
        ...sessionData,
        id,
        date: insertSession.date
      } as TrainingSession;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  async deleteSession(id: number): Promise<boolean> {
    await this.waitForAuth();
    
    try {
      const sessionsRef = this.getSessionsCollection();
      const docRef = doc(sessionsRef, id.toString());
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      return false;
    }
  }

  async getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
    const sessions = await this.getAllSessions();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    return sessions.find(session => 
      session.type === 'goal' && 
      session.date >= oneWeekAgo
    );
  }

  async exportData(): Promise<string> {
    const sessions = await this.getAllSessions();
    return JSON.stringify(sessions, null, 2);
  }

  async importData(data: string): Promise<void> {
    await this.waitForAuth();
    
    try {
      const sessions = JSON.parse(data) as TrainingSession[];
      const batch = writeBatch(db);
      const sessionsRef = this.getSessionsCollection();
      
      for (const session of sessions) {
        const docRef = doc(sessionsRef, session.id.toString());
        batch.set(docRef, {
          ...session,
          date: Timestamp.fromDate(new Date(session.date))
        });
      }
      
      await batch.commit();
    } catch (error) {
      console.error('Error importing data:', error);
      throw error;
    }
  }

  async getStatistics() {
    const sessions = await this.getAllSessions();
    
    const totalHours = sessions.reduce((sum, session) => {
      return sum + (session.duration || 0);
    }, 0) / 60; // Convert minutes to hours
    
    const totalSessions = sessions.length;
    
    const tacticsSession = sessions.find(s => s.type === 'tactics');
    const tacticsRating = tacticsSession?.finalScore || 0;
    
    const gamesSessions = sessions.filter(s => s.type === 'game');
    const wins = gamesSessions.filter(s => s.result === 'win').length;
    const winRate = gamesSessions.length > 0 ? (wins / gamesSessions.length) * 100 : 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySessions = sessions.filter(s => new Date(s.date) >= today);
    const todayTotalTime = todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    
    return {
      totalHours,
      totalSessions,
      tacticsRating,
      winRate,
      todayTotalTime,
      todaySessions: todaySessions.length
    };
  }

  async getStorageInfo() {
    const sessions = await this.getAllSessions();
    const dataSize = JSON.stringify(sessions).length;
    
    return {
      totalSessions: sessions.length,
      dataSize,
      storageType: 'Firestore Cloud Storage',
      isOnline: this.isOnline
    };
  }

  subscribeToSessions(callback: (sessions: TrainingSession[]) => void) {
    if (!this.userId) {
      this.waitForAuth().then(() => {
        this.subscribeToSessions(callback);
      });
      return () => {};
    }
    
    const sessionsRef = this.getSessionsCollection();
    const q = query(sessionsRef, orderBy('date', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map(doc => ({
        id: parseInt(doc.id),
        ...doc.data(),
        date: doc.data().date.toDate()
      })) as TrainingSession[];
      
      callback(sessions);
    });
    
    this.unsubscribes.push(unsubscribe);
    return unsubscribe;
  }

  async goOnline() {
    await enableNetwork(db);
    this.isOnline = true;
  }

  async goOffline() {
    await disableNetwork(db);
    this.isOnline = false;
  }

  private async waitForAuth(): Promise<void> {
    if (this.userId) return;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Auth timeout'));
      }, 10000);
      
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          this.userId = user.uid;
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      });
    });
  }

  cleanup() {
    this.unsubscribes.forEach(unsubscribe => unsubscribe());
    this.unsubscribes = [];
  }
}

export const firestoreStorage = new FirestoreStorage();