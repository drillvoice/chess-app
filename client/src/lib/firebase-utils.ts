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
import { getFirebaseInstances } from './firebase';
import { TrainingSession, InsertTrainingSession } from '@shared/schema';
import { SessionsCache, StatisticsCache, WeeklyGoalCache } from './cache-utils';

// Firebase utilities for direct Firestore operations
let currentUserId: string | null = null;

// Initialize authentication when Firebase is ready
const initializeAuth = async () => {
  try {
    const { auth } = await getFirebaseInstances();
    
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
  } catch (error) {
    console.error('Firebase initialization failed:', error);
  }
};

// Initialize auth when Firebase is ready
setTimeout(() => {
  initializeAuth();
}, 100);

// Helper to wait for authentication with timeout
async function waitForAuth(): Promise<void> {
  if (currentUserId) return;
  
  const { auth } = await getFirebaseInstances();
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Authentication timeout - please refresh the page'));
    }, 15000);
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUserId = user.uid;
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });
}

// Helper to get user's sessions collection
async function getSessionsCollection() {
  if (!currentUserId) throw new Error('User not authenticated');
  const { db } = await getFirebaseInstances();
  return collection(db, 'users', currentUserId, 'trainingSessions');
}

// Firebase operations with caching
export async function getAllSessions(): Promise<TrainingSession[]> {
  // Try cache first for instant loading
  const cachedSessions = SessionsCache.get();
  if (cachedSessions) {
    // Return cached data immediately, then update in background
    updateSessionsInBackground();
    return cachedSessions;
  }
  
  // If no cache, fetch from Firebase
  return await fetchSessionsFromFirebase();
}

async function fetchSessionsFromFirebase(): Promise<TrainingSession[]> {
  await waitForAuth();
  
  try {
    const sessionsRef = await getSessionsCollection();
    const q = query(sessionsRef, orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    
    const sessions = snapshot.docs.map(doc => ({
      id: parseInt(doc.id),
      ...doc.data(),
      date: doc.data().date.toDate()
    })) as TrainingSession[];
    
    // Cache the results
    SessionsCache.set(sessions);
    
    return sessions;
  } catch (error) {
    console.error('Error getting sessions:', error);
    return [];
  }
}

// Background update function
async function updateSessionsInBackground(): Promise<void> {
  try {
    const freshSessions = await fetchSessionsFromFirebase();
    // Cache will be updated in fetchSessionsFromFirebase
  } catch (error) {
    console.error('Background update failed:', error);
  }
}

export async function getSessionsByType(type: string): Promise<TrainingSession[]> {
  await waitForAuth();
  
  try {
    const sessionsRef = await getSessionsCollection();
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
    const sessionsRef = await getSessionsCollection();
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
  try {
    await waitForAuth();
    
    const sessionsRef = await getSessionsCollection();
    
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
    
    // Add timeout to Firebase operation (increased to 30 seconds)
    const savePromise = setDoc(docRef, sessionData);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Save operation timed out - please check your internet connection')), 30000);
    });
    
    await Promise.race([savePromise, timeoutPromise]);
    
    const newSession = {
      ...sessionData,
      id,
      date: sessionDate
    } as TrainingSession;
    
    // Clear cache to force fresh data on next load
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();
    
    return newSession;
  } catch (error) {
    console.error('Error creating session:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to save session');
  }
}

export async function updateSession(id: number, updateData: Partial<InsertTrainingSession>): Promise<TrainingSession | null> {
  await waitForAuth();
  
  try {
    const sessionsRef = await getSessionsCollection();
    const docRef = doc(sessionsRef, id.toString());
    
    // Update the document with new data
    const updatePayload = {
      ...updateData,
      updatedAt: Timestamp.fromDate(new Date())
    };
    
    await setDoc(docRef, updatePayload, { merge: true });
    
    // Get the current sessions to find the updated one
    const sessions = await getAllSessions();
    const updatedSession = sessions.find(session => session.id === id);
    
    // Clear cache to force fresh data on next load
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();
    
    return updatedSession || null;
  } catch (error) {
    console.error('Error updating session:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to update session');
  }
}

export async function deleteSession(id: number): Promise<boolean> {
  await waitForAuth();
  
  try {
    const sessionsRef = await getSessionsCollection();
    const docRef = doc(sessionsRef, id.toString());
    await deleteDoc(docRef);
    
    // Clear cache to force fresh data on next load
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();
    
    return true;
  } catch (error) {
    console.error('Error deleting session:', error);
    return false;
  }
}

export async function getCurrentWeeklyGoal(): Promise<TrainingSession | undefined> {
  try {
    // Try cache first for instant loading
    const cachedGoal = WeeklyGoalCache.get();
    if (cachedGoal !== null) {
      // Return cached data immediately, then update in background
      updateWeeklyGoalInBackground();
      return cachedGoal || undefined;
    }
    
    // If no cache, calculate from sessions
    return await calculateWeeklyGoal();
  } catch (error) {
    console.error('Error getting weekly goal:', error);
    return undefined;
  }
}

async function calculateWeeklyGoal(): Promise<TrainingSession | undefined> {
  try {
    const sessions = await getAllSessions();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const goal = sessions.find(session => 
      session.type === 'goal' && 
      session.date >= oneWeekAgo
    );
    
    // Cache the result (including null/undefined)
    WeeklyGoalCache.set(goal || null);
    
    return goal;
  } catch (error) {
    console.error('Error calculating weekly goal:', error);
    // Cache null on error to prevent repeated failures
    WeeklyGoalCache.set(null);
    return undefined;
  }
}

async function updateWeeklyGoalInBackground(): Promise<void> {
  try {
    const freshGoal = await calculateWeeklyGoal();
    // Cache will be updated in calculateWeeklyGoal
  } catch (error) {
    console.error('Weekly goal background update failed:', error);
  }
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
  // Try cache first for instant loading
  const cachedStats = StatisticsCache.get();
  if (cachedStats) {
    // Return cached data immediately, then update in background
    updateStatisticsInBackground();
    return cachedStats;
  }
  
  // If no cache, calculate from sessions
  return await calculateStatistics();
}

async function calculateStatistics() {
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
  
  const stats = {
    totalHours: Math.round(totalHours * 10) / 10,
    totalSessions,
    tacticsRating,
    winRate,
    todayTotalTime,
    todaySessions: todaySessions.length
  };
  
  // Cache the results
  StatisticsCache.set(stats);
  
  return stats;
}

export async function getWeeklyActivity() {
  const sessions = await getAllSessions();
  
  // Get current week's data (Monday to Sunday)
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);
  
  const weeklyData = [];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  for (let i = 0; i < 7; i++) {
    const currentDay = new Date(startOfWeek);
    currentDay.setDate(startOfWeek.getDate() + i);
    
    const dayEnd = new Date(currentDay);
    dayEnd.setHours(23, 59, 59, 999);
    
    // Get sessions for this day
    const daySessions = sessions.filter(session => {
      const sessionDate = new Date(session.date);
      return sessionDate >= currentDay && sessionDate <= dayEnd;
    });
    
    // Calculate total duration for the day
    const totalDuration = daySessions.reduce((sum, session) => sum + (session.duration || 0), 0);
    
    weeklyData.push({
      day: dayNames[i],
      duration: totalDuration,
      sessions: daySessions.length
    });
  }
  
  return weeklyData;
}

async function updateStatisticsInBackground(): Promise<void> {
  try {
    const freshStats = await calculateStatistics();
    // Cache will be updated in calculateStatistics
  } catch (error) {
    console.error('Statistics background update failed:', error);
  }
}

// Real-time listener for sessions
export async function subscribeToSessions(callback: (sessions: TrainingSession[]) => void) {
  try {
    if (!currentUserId) {
      const { auth } = await getFirebaseInstances();
      // Wait for auth and then subscribe
      const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
          currentUserId = user.uid;
          unsubscribeAuth();
          subscribeToSessions(callback);
        }
      });
      return () => unsubscribeAuth();
    }

    const { db } = await getFirebaseInstances();
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
  } catch (error) {
    console.error('Error setting up sessions listener:', error);
    callback([]);
  }
}