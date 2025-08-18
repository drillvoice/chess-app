import { TrainingSession, InsertTrainingSession } from '@shared/schema';
import { SessionsCache, StatisticsCache, WeeklyGoalCache } from '../cache-utils';
import { offlineStorage } from '../offline-storage';
import { queryClient } from '../queryClient';
import {
  waitForAuth,
  getSessionsCollection,
  doc,
  getDocs,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  collection,
  auth,
  onAuthStateChanged,
  getCurrentUserId,
  db,
} from './core';

export async function getAllSessions(): Promise<TrainingSession[]> {
  try {
    // Prefer cached sessions for instant load
    const cachedSessions = await offlineStorage.getSessions();
    if (cachedSessions && cachedSessions.length > 0) {
      try {
        const cacheAge = await offlineStorage.getCacheAge('sessions');
        if (cacheAge > 30000) {
          // Fetch fresh data in background when cache is stale
          queueMicrotask(() => updateSessionsInBackground());
        }
      } catch (ageError) {
        console.warn('Failed to check cache age:', ageError);
        // Still attempt background update
        queueMicrotask(() => updateSessionsInBackground());
      }
      return cachedSessions;
    }
  } catch (error) {
    console.warn('Failed to read sessions from offline storage:', error);
  }

  // No cached data, fall back to Firebase
  try {
    const firebaseSessions = await fetchSessionsFromFirebase();
    return firebaseSessions;
  } catch (error) {
    console.error('Failed to fetch sessions from Firebase:', error);
    return [];
  }
}

export async function fetchSessionsFromFirebase(): Promise<TrainingSession[]> {
  await waitForAuth();

  try {
    const sessionsRef = await getSessionsCollection();
    const lastSynced = await offlineStorage.getLastSyncedTimestamp();

    // For new devices or when lastSynced is 0, fetch all sessions
    // This ensures new devices get all existing data
    const q = lastSynced && lastSynced > 0
      ? query(
          sessionsRef,
          where('date', '>', Timestamp.fromMillis(lastSynced)),
          orderBy('date', 'desc'),
        )
      : query(sessionsRef, orderBy('date', 'desc'));

    const snapshot = await getDocs(q);

    if (!snapshot || !snapshot.docs) {
      throw new Error('No snapshot returned from getDocs');
    }

    const sessions = snapshot.docs.map((doc) => ({
      id: parseInt(doc.id),
      ...doc.data(),
      date: doc.data().date.toDate(),
    })) as TrainingSession[];

    await offlineStorage.mergeSessions(sessions);

    if (sessions.length > 0) {
      const latest = sessions.reduce(
        (max, s) => Math.max(max, s.date.getTime()),
        lastSynced || 0,
      );
      await offlineStorage.setLastSyncedTimestamp(latest);
    }

    const allSessions = await offlineStorage.getSessions();
    SessionsCache.set(allSessions);

    console.log(`Fetched ${sessions.length} sessions from Firebase (lastSynced: ${lastSynced || 'none'})`);
    return allSessions;
  } catch (error) {
    console.error('Error fetching sessions from Firebase:', error);

    // Only return cached data if explicitly requested, not as fallback
    // This ensures we know when Firebase sync fails
    throw error;
  }
}
// Background update function - non-blocking
async function updateSessionsInBackground(): Promise<void> {
  try {
    // Check cache age first
    const cacheAge = await offlineStorage.getCacheAge('sessions');
    if (cacheAge < 30000) {
      // Less than 30 seconds old
      return; // Skip update
    }

    await fetchSessionsFromFirebase();
    // Cache will be updated in fetchSessionsFromFirebase
  } catch (error) {
    // Silently fail - user already has cached data
  }
}

export async function getSessionsByType(type: string): Promise<TrainingSession[]> {
  try {
    const cachedSessions = await offlineStorage.getSessions();
    if (cachedSessions && cachedSessions.length > 0) {
      return cachedSessions.filter((session) => session.type === type);
    }
  } catch (error) {
    console.warn('Failed to read from offline storage:', error);
  }

  await waitForAuth();

  try {
    const sessionsRef = await getSessionsCollection();
    const q = query(sessionsRef, where('type', '==', type), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);

    const sessions = snapshot.docs.map((doc) => ({
      id: parseInt(doc.id),
      ...doc.data(),
      date: doc.data().date.toDate(),
    })) as TrainingSession[];

    SessionsCache.set(sessions);
    await offlineStorage.setSessions(sessions);

    return sessions;
  } catch (error) {
    console.error('Error getting sessions by type:', error);
    return [];
  }
}

export async function getSessionsNeedingReview(): Promise<TrainingSession[]> {
  try {
    const cachedSessions = await offlineStorage.getSessions();
    if (cachedSessions && cachedSessions.length > 0) {
      return cachedSessions.filter((session) => (session as any).needsReview);
    }
  } catch (error) {
    console.warn('Failed to read from offline storage:', error);
  }

  await waitForAuth();

  try {
    const sessionsRef = await getSessionsCollection();
    const q = query(sessionsRef, where('needsReview', '==', true), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);

    const sessions = snapshot.docs.map((doc) => ({
      id: parseInt(doc.id),
      ...doc.data(),
      date: doc.data().date.toDate(),
    })) as TrainingSession[];

    return sessions;
  } catch (error) {
    console.error('Error getting sessions needing review:', error);
    return [];
  }
}

export async function getSessionsByDateRange(
  startDate: Date,
  endDate: Date,
): Promise<TrainingSession[]> {
  try {
    const cachedSessions = await offlineStorage.getSessions();
    if (cachedSessions && cachedSessions.length > 0) {
      return cachedSessions.filter(
        (session) => session.date >= startDate && session.date <= endDate,
      );
    }
  } catch (error) {
    console.warn('Failed to read from offline storage:', error);
  }

  await waitForAuth();

  try {
    const sessionsRef = await getSessionsCollection();
    const q = query(
      sessionsRef,
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate)),
      orderBy('date', 'desc'),
    );
    const snapshot = await getDocs(q);

    const sessions = snapshot.docs.map((doc) => ({
      id: parseInt(doc.id),
      ...doc.data(),
      date: doc.data().date.toDate(),
    })) as TrainingSession[];

    SessionsCache.set(sessions);
    await offlineStorage.setSessions(sessions);

    return sessions;
  } catch (error) {
    console.error('Error getting sessions by date range:', error);
    return [];
  }
}

export async function createSession(
  insertSession: InsertTrainingSession,
  id?: number,
): Promise<TrainingSession> {
  const sessionId = id ?? Date.now();
  const sessionDate = insertSession.date || new Date();
  const now = new Date();

  const newSession: TrainingSession = {
    ...insertSession,
    id: sessionId,
    date: sessionDate,
    createdAt: now,
    needsReview: insertSession.needsReview ?? false,
  } as TrainingSession;

  // 1. Save locally FIRST for instant user feedback
  try {
    await offlineStorage.addSession(newSession);
    await offlineStorage.clearStatistics();

    // Mark as unsynced for background sync (we'll add this method later)
    await offlineStorage.markAsUnsynced(sessionId, 'create');

    // Update caches immediately
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();

    queueMicrotask(() => updateStatisticsInBackground());
  } catch (error) {
    console.error('Failed to save session locally:', error);
    throw new Error('Failed to save session offline');
  }

  // 2. Queue for Firebase sync (non-blocking)
  queueMicrotask(() => syncSessionToFirebase(sessionId, newSession));

  return newSession;
}

export async function updateSession(
  id: number,
  updateData: Partial<InsertTrainingSession>,
): Promise<TrainingSession | null> {
  try {
    // Update locally first (we'll add this method later)
    const updatedSession = await offlineStorage.updateSession(id, updateData);
    if (!updatedSession) {
      throw new Error('Session not found locally');
    }

    // Mark as unsynced for background sync (we'll add this method later)
    await offlineStorage.markAsUnsynced(id, 'update', updateData);

    // Clear caches
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();

    queueMicrotask(() => updateStatisticsInBackground());

    // Queue for Firebase sync (non-blocking)
    queueMicrotask(() => syncUpdateToFirebase(id, updateData));

    // Refresh pending review queries so UI reflects latest data
    queryClient.invalidateQueries({ queryKey: ['pending-review'] });

    return updatedSession;
  } catch (error) {
    console.error('Error updating session locally:', error);
    throw new Error('Failed to update session');
  }
}

export async function deleteSession(id: number): Promise<boolean> {
  try {
    // Delete locally first
    await offlineStorage.deleteSession(id);
    await offlineStorage.clearStatistics();

    // Mark as unsynced for background sync (we'll add this method later)
    await offlineStorage.markAsUnsynced(id, 'delete');

    // Clear caches
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();

    queueMicrotask(() => updateStatisticsInBackground());

    // Queue for Firebase sync (non-blocking)
    queueMicrotask(() => syncDeleteToFirebase(id));

    return true;
  } catch (error) {
    console.error('Error deleting session locally:', error);
    throw new Error('Failed to delete session');
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
  const todaySessions = sessions.filter((session) => {
    const sessionDate = new Date(session.date);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate.getTime() === today.getTime();
  });

  const todayTotalTime = todaySessions.reduce((sum, session) => sum + (session.duration || 0), 0);

  // Calculate tactics rating (most recent final score)
  const tacticsSessionsWithScores = sessions
    .filter((session) => session.type === 'tactics' && session.finalScore)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort by date, most recent first

  const tacticsRating =
    tacticsSessionsWithScores.length > 0
      ? tacticsSessionsWithScores[0].finalScore || 0 // Get the most recent tactics score
      : 0;

  // Calculate win rate
  const gameSessions = sessions.filter((session) => session.type === 'game');
  const wins = gameSessions.filter((session) => session.gameResult === 'win').length;
  const winRate = gameSessions.length > 0 ? Math.round((wins / gameSessions.length) * 100) : 0;

  const stats = {
    totalHours: Math.round(totalHours * 10) / 10,
    totalSessions,
    tacticsRating,
    winRate,
    todayTotalTime,
    todaySessions: todaySessions.length,
  };

  // Cache the results in both storages
  StatisticsCache.set(stats);
  offlineStorage.setStatistics(stats).catch((error) => {
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
    const daySessions = sessions.filter((session) => {
      const sessionDate = new Date(session.date);
      return sessionDate >= currentDay && sessionDate <= dayEnd;
    });

    // Calculate total duration for the day
    const totalDuration = daySessions.reduce((sum, session) => sum + (session.duration || 0), 0);

    weeklyData.push({
      day: dayNames[i],
      duration: totalDuration,
      sessions: daySessions.length,
    });
  }

  return weeklyData;
}

async function updateStatisticsInBackground(): Promise<void> {
  try {
    await calculateStatistics();
    // Cache will be updated in calculateStatistics
  } catch (error) {
    console.error('Statistics background update failed:', error);
  }
}

// Background sync functions
async function syncSessionToFirebase(sessionId: number, session: TrainingSession): Promise<void> {
  try {
    await waitForAuth();
    const sessionsRef = await getSessionsCollection();

    const sessionData = {
      ...session,
      date: Timestamp.fromDate(session.date),

    };

    const docRef = doc(sessionsRef, sessionId.toString());
    await setDoc(docRef, sessionData);

    // Mark as synced on success (we'll add this method later)
    await offlineStorage.markAsSynced(sessionId);
    
    console.log(`Session ${sessionId} synced to Firebase successfully`);
  } catch (error) {
    console.error('Failed to sync session to Firebase:', sessionId, error);
    // Keep marked as unsynced for retry (we'll add this method later)
    await offlineStorage.incrementSyncRetries(sessionId);
  }
}

async function syncUpdateToFirebase(id: number, updateData: Partial<InsertTrainingSession>): Promise<void> {
  try {
    await waitForAuth();
    const sessionsRef = await getSessionsCollection();
    const docRef = doc(sessionsRef, id.toString());

    const updatePayload = {
      ...updateData,
      ...(updateData.needsReview === undefined ? { needsReview: false } : {}),
      updatedAt: Timestamp.fromDate(new Date()),
    };

    await setDoc(docRef, updatePayload, { merge: true });
    await offlineStorage.markAsSynced(id);
    
    console.log(`Session ${id} update synced to Firebase`);
  } catch (error) {
    console.error('Failed to sync update to Firebase:', id, error);
    await offlineStorage.incrementSyncRetries(id);
  }
}

async function syncDeleteToFirebase(id: number): Promise<void> {
  try {
    await waitForAuth();
    const sessionsRef = await getSessionsCollection();
    const docRef = doc(sessionsRef, id.toString());
    await deleteDoc(docRef);
    await offlineStorage.markAsSynced(id);
    
    console.log(`Session ${id} deletion synced to Firebase`);
  } catch (error) {
    console.error('Failed to sync deletion to Firebase:', id, error);
    await offlineStorage.incrementSyncRetries(id);
  }
}

// Real-time listener for sessions
export async function subscribeToSessions(callback: (sessions: TrainingSession[]) => void) {
  try {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      // Wait for auth and then subscribe
      const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
          unsubscribeAuth();
          subscribeToSessions(callback);
        }
      });
      return () => unsubscribeAuth();
    }
    const sessionsRef = collection(db, 'users', currentUserId, 'trainingSessions');
    const q = query(sessionsRef, orderBy('date', 'desc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const sessions = snapshot.docs.map((doc) => ({
          id: parseInt(doc.id),
          ...doc.data(),
          date: doc.data().date.toDate(),
        })) as TrainingSession[];

        callback(sessions);
      },
      (error) => {
        console.error('Error listening to sessions:', error);
        callback([]);
      },
    );
  } catch (error) {
    console.error('Error setting up sessions listener:', error);
    callback([]);
  }
}

let unsubscribeSessionSync: (() => void) | null = null;

export async function startSessionSync(onUpdate?: () => void): Promise<void> {
  if (unsubscribeSessionSync) return;
  try {
    const unsub = await subscribeToSessions(async (sessions) => {
      SessionsCache.set(sessions);
      await offlineStorage.setSessions(sessions);
      onUpdate?.();
    });
    unsubscribeSessionSync = unsub || null;
  } catch (error) {
    console.error('Error starting session sync:', error);
  }
}

export function stopSessionSync(): void {
  if (unsubscribeSessionSync) {
    unsubscribeSessionSync();
    unsubscribeSessionSync = null;
  }
}

