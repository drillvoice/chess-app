import { 
  collection, 
  doc, 
  getDocs, 
  deleteDoc, 
  setDoc,
  query, 
  where, 
  orderBy, 
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { 
  signInAnonymously, 
  onAuthStateChanged,
} from 'firebase/auth';
import { db, auth } from './firebase';
import { TrainingSession, InsertTrainingSession } from '@shared/schema';

// Firebase utilities for direct Firestore operations
let currentUserId: string | null = null;

// Initialize authentication
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserId = user.uid;
  } else {
    try {
      const userCred = await signInAnonymously(auth);
      currentUserId = userCred.user.uid;
    } catch (error) {
      console.error('Firebase auth failed:', error);
    }
  }
});

// Helper to wait for authentication
async function waitForAuth(): Promise<void> {
  if (currentUserId) return;
  
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUserId = user.uid;
        unsubscribe();
        resolve();
      }
    });
  });
}

// Helper to get user's sessions collection
function getSessionsCollection() {
  if (!currentUserId) throw new Error('User not authenticated');
  return collection(db, 'users', currentUserId, 'trainingSessions');
}

// Firebase operations
export async function getAllSessions(): Promise<TrainingSession[]> {
  await waitForAuth();
  
  try {
    const sessionsRef = getSessionsCollection();
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

export async function getSessionsByType(type: string): Promise<TrainingSession[]> {
  await waitForAuth();
  
  try {
    const sessionsRef = getSessionsCollection();
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

export async function getSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]> {
  await waitForAuth();
  
  try {
    const sessionsRef = getSessionsCollection();
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

export async function createSession(insertSession: InsertTrainingSession): Promise<TrainingSession> {
  await waitForAuth();
  
  try {
    const sessionsRef = getSessionsCollection();
    
    // Generate a unique ID based on timestamp
    const id = Date.now();
    
    // Ensure date is set to current date if not provided
    const sessionDate = insertSession.date || new Date();
    const now = new Date();
    
    const sessionData = {
      ...insertSession,
      id,
      date: Timestamp.fromDate(sessionDate),
      createdAt: Timestamp.fromDate(now)
    };
    
    // Use setDoc with custom ID for consistent document reference
    const docRef = doc(sessionsRef, id.toString());
    await setDoc(docRef, sessionData);
    
    return {
      ...sessionData,
      id,
      date: sessionDate
    } as TrainingSession;
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
}

export async function deleteSession(id: number): Promise<boolean> {
  await waitForAuth();
  
  try {
    const sessionsRef = getSessionsCollection();
    const docRef = doc(sessionsRef, id.toString());
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error('Error deleting session:', error);
    return false;
  }
}

export async function getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
  const sessions = await getAllSessions();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  return sessions.find(session => 
    session.type === 'goal' && 
    session.date >= oneWeekAgo
  );
}

export async function exportData(): Promise<string> {
  const sessions = await getAllSessions();
  return JSON.stringify(sessions, null, 2);
}

export async function importData(data: string): Promise<void> {
  const sessions: TrainingSession[] = JSON.parse(data);
  
  // Import each session
  for (const session of sessions) {
    const { id, createdAt, updatedAt, ...insertSession } = session;
    await createSession(insertSession);
  }
}

export async function getStatistics() {
  const sessions = await getAllSessions();
  
  const totalSessions = sessions.length;
  const totalHours = sessions.reduce((sum, session) => sum + (session.duration || 0), 0) / 60;
  
  // Get today's sessions
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaySessions = sessions.filter(session => {
    const sessionDate = new Date(session.date);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate.getTime() === today.getTime();
  });
  
  const todayTotalTime = todaySessions.reduce((sum, session) => sum + (session.duration || 0), 0);
  
  // Calculate tactics rating (average of final scores)
  const tacticsSessionsWithScores = sessions.filter(session => 
    session.type === 'tactics' && session.finalScore
  );
  const tacticsRating = tacticsSessionsWithScores.length > 0 
    ? Math.round(tacticsSessionsWithScores.reduce((sum, session) => sum + (session.finalScore || 0), 0) / tacticsSessionsWithScores.length)
    : 0;
  
  // Calculate win rate
  const gameSessions = sessions.filter(session => session.type === 'game');
  const wins = gameSessions.filter(session => session.gameResult === 'win').length;
  const winRate = gameSessions.length > 0 ? Math.round((wins / gameSessions.length) * 100) : 0;
  
  return {
    totalHours: Math.round(totalHours * 10) / 10,
    totalSessions,
    tacticsRating,
    winRate,
    todayTotalTime,
    todaySessions: todaySessions.length
  };
}

// Real-time listener for sessions
export function subscribeToSessions(callback: (sessions: TrainingSession[]) => void) {
  if (!currentUserId) {
    // Wait for auth and then subscribe
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUserId = user.uid;
        unsubscribeAuth();
        subscribeToSessions(callback);
      }
    });
    return () => unsubscribeAuth();
  }

  const sessionsRef = collection(db, 'users', currentUserId, 'trainingSessions');
  const q = query(sessionsRef, orderBy('date', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map(doc => ({
      id: parseInt(doc.id),
      ...doc.data(),
      date: doc.data().date.toDate()
    })) as TrainingSession[];
    
    callback(sessions);
  }, (error) => {
    console.error('Error listening to sessions:', error);
    callback([]);
  });
}