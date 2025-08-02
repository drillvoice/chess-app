import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
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
import { TrainingSession, InsertTrainingSession, DailyGoal, DailyProgress } from '@shared/schema';
import { SessionsCache, StatisticsCache, WeeklyGoalCache } from './cache-utils';

// Firebase utilities for direct Firestore operations
let currentUserId: string | null = null;

// Initialize authentication when Firebase is ready
export async function initializeAuth(): Promise<void> {
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
}

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

import { offlineStorage } from './offline-storage';

// Firebase operations with true offline-first approach
export async function getAllSessions(): Promise<TrainingSession[]> {
  // ALWAYS return cached data immediately if available
  try {
    const cachedSessions = await offlineStorage.getSessions();
    if (cachedSessions && cachedSessions.length > 0) {
      // Schedule background update but don't wait for it
      queueMicrotask(() => updateSessionsInBackground());
      return cachedSessions;
    }
  } catch (error) {
    console.warn('Failed to read from offline storage:', error);
  }
  
  // Only fetch from Firebase if no cached data
  return await fetchSessionsFromFirebase();
}

async function fetchSessionsFromFirebase(): Promise<TrainingSession[]> {
  // Don't wait for auth if we're just reading
  if (!currentUserId) {
    // Try to get cached sessions while auth happens
    try {
      const cached = await offlineStorage.getSessions();
      if (cached && cached.length > 0) {
        // Start auth in background
        queueMicrotask(() => waitForAuth());
        return cached;
      }
    } catch (error) {
      console.warn('Offline storage failed:', error);
    }
  }
  
  // If we must fetch from Firebase, wait for auth
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
    
    // Cache in both localStorage and IndexedDB
    SessionsCache.set(sessions);
    await offlineStorage.setSessions(sessions);
    
    return sessions;
  } catch (error) {
    console.error('Error getting sessions:', error);
    // Return cached data on error
    try {
      const cached = await offlineStorage.getSessions();
      return cached || [];
    } catch {
      return [];
    }
  }
}

// Background update function - non-blocking
async function updateSessionsInBackground(): Promise<void> {
  try {
    // Check cache age first
    const cacheAge = await offlineStorage.getCacheAge('sessions');
    if (cacheAge < 30000) { // Less than 30 seconds old
      return; // Skip update
    }
    
    const freshSessions = await fetchSessionsFromFirebase();
    // Cache will be updated in fetchSessionsFromFirebase
  } catch (error) {
    // Silently fail - user already has cached data
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
  // Generate session data immediately for optimistic updates
  const id = Date.now();
  const sessionDate = insertSession.date || new Date();
  const now = new Date();
  
  const newSession: TrainingSession = {
    ...insertSession,
    id,
    date: sessionDate,
    createdAt: now,
  } as TrainingSession;
  
  // Immediately update local cache for instant feedback
  try {
    const sessions = await offlineStorage.getSessions();
    await offlineStorage.addSession(newSession);
    
    // Clear localStorage caches to trigger UI updates
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();
  } catch (error) {
    console.warn('Failed to update offline cache:', error);
  }
  
  // Save to Firebase in the background
  const saveToFirebase = async () => {
    try {
      await waitForAuth();
      const sessionsRef = await getSessionsCollection();
      
      const sessionData = {
        ...insertSession,
        id,
        date: Timestamp.fromDate(sessionDate),
        createdAt: Timestamp.fromDate(now)
      };
      
      const docRef = doc(sessionsRef, id.toString());
      
      // Shorter timeout for better UX
      const savePromise = setDoc(docRef, sessionData);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Save taking longer than expected')), 10000);
      });
      
      await Promise.race([savePromise, timeoutPromise]);
    } catch (error) {
      console.error('Firebase save failed:', error);
      // Data is already in local cache, so user won't lose their work
      // It will sync next time they have connection
    }
  };
  
  // Don't wait for Firebase save
  queueMicrotask(() => saveToFirebase());
  
  return newSession;
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
  // Try IndexedDB first for instant loading
  try {
    const cachedStats = await offlineStorage.getStatistics();
    if (cachedStats) {
      // Schedule background update but don't wait
      queueMicrotask(() => updateStatisticsInBackground());
      return cachedStats;
    }
  } catch (error) {
    console.warn('Failed to get cached statistics:', error);
  }
  
  // Try localStorage as fallback
  const localCachedStats = StatisticsCache.get();
  if (localCachedStats) {
    // Update IndexedDB in background
    queueMicrotask(() => offlineStorage.setStatistics(localCachedStats));
    // Schedule update
    queueMicrotask(() => updateStatisticsInBackground());
    return localCachedStats;
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
  
  // Calculate tactics rating (most recent final score)
  const tacticsSessionsWithScores = sessions
    .filter(session => session.type === 'tactics' && session.finalScore)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort by date, most recent first
  
  const tacticsRating = tacticsSessionsWithScores.length > 0 
    ? tacticsSessionsWithScores[0].finalScore || 0  // Get the most recent tactics score
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
  
  // Cache the results in both storages
  StatisticsCache.set(stats);
  offlineStorage.setStatistics(stats).catch(error => {
    console.warn('Failed to cache statistics in IndexedDB:', error);
  });
  
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

// Daily Goal Functions
export async function getCurrentDailyGoal(): Promise<DailyGoal | null> {
  try {
    await waitForAuth();
    const { db } = await getFirebaseInstances();
    
    const dailyGoalRef = doc(db, 'users', currentUserId!, 'dailyGoal', 'current');
    const docSnap = await getDoc(dailyGoalRef);
    
    if (!docSnap.exists()) return null;
    
    const data = docSnap.data();
    
    return {
      id: docSnap.id,
      type: data.type,
      target: data.target,
      active: data.active,
      createdDate: data.createdDate.toDate(),
      currentStreak: data.currentStreak || 0,
      lastCompletedDate: data.lastCompletedDate ? data.lastCompletedDate.toDate() : null,
    } as DailyGoal;
  } catch (error) {
    console.error('Error getting daily goal:', error);
    return null;
  }
}

export async function setDailyGoal(goalData: { type: DailyGoal['type']; target: number }): Promise<void> {
  try {
    await waitForAuth();
    const { db } = await getFirebaseInstances();
    
    // Remove existing daily goal first
    await removeDailyGoal();
    
    const goalRef = doc(db, 'users', currentUserId!, 'dailyGoal', 'current');
    const newGoal: Omit<DailyGoal, 'id'> = {
      type: goalData.type,
      target: goalData.target,
      active: true,
      createdDate: new Date(),
      currentStreak: 0,
      lastCompletedDate: null,
    };
    
    await setDoc(goalRef, {
      ...newGoal,
      createdDate: Timestamp.fromDate(newGoal.createdDate),
    });
  } catch (error) {
    console.error('Error setting daily goal:', error);
    throw error;
  }
}

export async function removeDailyGoal(): Promise<void> {
  try {
    await waitForAuth();
    const { db } = await getFirebaseInstances();
    
    const goalRef = doc(db, 'users', currentUserId!, 'dailyGoal', 'current');
    await deleteDoc(goalRef);
  } catch (error) {
    console.error('Error removing daily goal:', error);
    // Don't throw error if document doesn't exist
  }
}

export async function getDailyProgress(): Promise<{ progress: number; completed: boolean; streak: number } | null> {
  try {
    const dailyGoal = await getCurrentDailyGoal();
    if (!dailyGoal) return null;
    
    const today = new Date();
    const todayStr = formatDateString(today);
    
    // Get today's sessions
    const sessions = await getAllSessions();
    const todaySessions = sessions.filter(session => {
      const sessionDate = new Date(session.date);
      return formatDateString(sessionDate) === todayStr;
    });
    
    let progress = 0;
    
    // Calculate progress based on goal type
    switch (dailyGoal.type) {
      case 'tactics-time':
        progress = todaySessions
          .filter(session => session.type === 'tactics')
          .reduce((sum, session) => sum + (session.duration || 0), 0);
        break;
      case 'games-count':
        progress = todaySessions.filter(session => session.type === 'game').length;
        break;
      case 'study-time':
        progress = todaySessions
          .filter(session => session.type === 'study')
          .reduce((sum, session) => sum + (session.duration || 0), 0);
        break;
    }
    
    const completed = progress >= dailyGoal.target;
    
    // Update streak if goal was completed and it's a new day
    if (completed && dailyGoal.lastCompletedDate !== todayStr) {
      await updateDailyGoalStreak(dailyGoal, todayStr);
    }
    
    return {
      progress,
      completed,
      streak: dailyGoal.currentStreak,
    };
  } catch (error) {
    console.error('Error getting daily progress:', error);
    return null;
  }
}

async function updateDailyGoalStreak(goal: DailyGoal, todayStr: string): Promise<void> {
  try {
    await waitForAuth();
    const { db } = await getFirebaseInstances();
    
    const goalRef = doc(db, 'users', currentUserId!, 'dailyGoal', 'current');
    
    let newStreak = 1;
    
    // Check if yesterday was completed to maintain streak
    if (goal.lastCompletedDate) {
      const lastCompleted = new Date(goal.lastCompletedDate);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (formatDateString(lastCompleted) === formatDateString(yesterday)) {
        newStreak = goal.currentStreak + 1;
      }
    }
    
    await setDoc(goalRef, {
      ...goal,
      currentStreak: newStreak,
      lastCompletedDate: todayStr,
      createdDate: Timestamp.fromDate(goal.createdDate),
    });
  } catch (error) {
    console.error('Error updating daily goal streak:', error);
  }
}

function formatDateString(date: Date): string {
  return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

export function getStreakEmoji(streak: number): string {
  if (streak < 5) return '';
  if (streak < 10) return '🔥';
  if (streak < 20) return '⚡';
  if (streak < 50) return '💎';
  if (streak < 100) return '🏆';
  return '👑';
}