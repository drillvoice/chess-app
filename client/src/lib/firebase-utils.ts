import { TrainingSession, InsertTrainingSession } from '@shared/schema';
import { SessionsCache, StatisticsCache, WeeklyGoalCache } from './cache-utils';
import { offlineStorage } from './offline-storage';
import { getFirebaseAuth, getFirestoreDb } from './firebaseClient';

// Dynamic Firebase imports with caching
let auth: Awaited<ReturnType<typeof getFirebaseAuth>>;
let db: Awaited<ReturnType<typeof getFirestoreDb>>;

let collection: typeof import('firebase/firestore').collection;
let doc: typeof import('firebase/firestore').doc;
let getDocs: typeof import('firebase/firestore').getDocs;
let getDoc: typeof import('firebase/firestore').getDoc;
let deleteDoc: typeof import('firebase/firestore').deleteDoc;
let setDoc: typeof import('firebase/firestore').setDoc;
let updateDoc: typeof import('firebase/firestore').updateDoc;
let query: typeof import('firebase/firestore').query;
let where: typeof import('firebase/firestore').where;
let orderBy: typeof import('firebase/firestore').orderBy;
let onSnapshot: typeof import('firebase/firestore').onSnapshot;
let Timestamp: typeof import('firebase/firestore').Timestamp;
let limit: typeof import('firebase/firestore').limit;

let GoogleAuthProvider: typeof import('firebase/auth').GoogleAuthProvider;
let signInWithPopup: typeof import('firebase/auth').signInWithPopup;
let signInWithRedirect: typeof import('firebase/auth').signInWithRedirect;
let linkWithCredential: typeof import('firebase/auth').linkWithCredential;
let linkWithRedirect: typeof import('firebase/auth').linkWithRedirect;
let onAuthStateChanged: typeof import('firebase/auth').onAuthStateChanged;
let provider!: import('firebase/auth').GoogleAuthProvider;

let currentUserId: string | null = null;
let authListenerInitialized = false;
let authResolvers: Array<() => void> = [];

async function ensureFirebase() {
  if (!auth) {
    auth = await getFirebaseAuth();
  }
  if (!db) {
    db = await getFirestoreDb();
  }
  if (!collection) {
    const firestore = await import('firebase/firestore');
    ({ collection, doc, getDocs, getDoc, deleteDoc, setDoc, updateDoc, query, where, orderBy, onSnapshot, Timestamp, limit } = firestore);
  }
  if (!signInWithPopup) {
    const authModule = await import('firebase/auth');
    ({
      GoogleAuthProvider,
      signInWithPopup,
      signInWithRedirect,
      linkWithCredential,
      linkWithRedirect,
      onAuthStateChanged,
    } = authModule);
    provider = new GoogleAuthProvider();
  }

  if (!authListenerInitialized) {
    onAuthStateChanged(auth, async (user) => {
      currentUserId = user ? user.uid : null;
      if (currentUserId) {
        await ensureUserDoc();
        authResolvers.forEach(res => res());
        authResolvers = [];
      }
    });
    authListenerInitialized = true;
  }
}

// Helper to wait for authentication
async function waitForAuth(timeoutMs = 5000): Promise<void> {
  await ensureFirebase();
  if (currentUserId) return;

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const resolver = () => {
      clearTimeout(timer);
      const idx = authResolvers.indexOf(resolver);
      if (idx !== -1) authResolvers.splice(idx, 1);
      resolve();
    };

    timer = setTimeout(() => {
      const idx = authResolvers.indexOf(resolver);
      if (idx !== -1) authResolvers.splice(idx, 1);
      reject(new Error('User not authenticated'));
    }, timeoutMs);

    authResolvers.push(resolver);
  });
}

// Helper to get user's sessions collection
async function getSessionsCollection() {
  if (!currentUserId) throw new Error('User not authenticated');
  return collection(db, 'users', currentUserId, 'trainingSessions');
}

// Ensure the root user document exists before accessing subcollections
async function ensureUserDoc(): Promise<void> {
  try {
    await setDoc(
      doc(db, 'users', currentUserId!),
      { createdAt: Timestamp.now() },
      { merge: true }
    );
  } catch (error) {
    console.error('Error ensuring user document:', error);
    throw error;
  }
}

export async function refreshAuthState(): Promise<void> {
  await ensureFirebase();
  const user = auth.currentUser;
  currentUserId = user ? user.uid : null;
  if (currentUserId) {
    await ensureUserDoc();
  }
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}

export async function startAuthFlow(useRedirect = false): Promise<void> {
  await ensureFirebase();
  const anonUser = auth.currentUser;
  if (useRedirect) {
    if (anonUser && anonUser.isAnonymous) {
      await linkWithRedirect(anonUser, provider);
    } else {
      await signInWithRedirect(auth, provider);
    }
  } else {
    const result = await signInWithPopup(auth, provider);
    if (anonUser && anonUser.isAnonymous) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential) {
        await linkWithCredential(anonUser, credential);
      }
    }
  }
  await refreshAuthState();
}

export async function verifyDataPresence(): Promise<boolean> {
  try {
    const cached = await offlineStorage.getSessions();
    await fetchSessionsFromFirebase();
    console.log(
      'Migration verification: cached',
      cached?.length || 0,
      'live read successful'
    );
    return true;
  } catch (error) {
    console.error('Migration verification failed:', error);
    return false;
  }
}

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

export async function fetchSessionsFromFirebase(): Promise<TrainingSession[]> {
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
      date: doc.data().date.toDate(),
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
  try {
    const cachedSessions = await offlineStorage.getSessions();
    if (cachedSessions && cachedSessions.length > 0) {
      return cachedSessions.filter(session => session.type === type);
    }
  } catch (error) {
    console.warn('Failed to read from offline storage:', error);
  }

  await waitForAuth();

  try {
    const sessionsRef = await getSessionsCollection();
    const q = query(
      sessionsRef,
      where('type', '==', type),
      orderBy('date', 'desc')
    );
    const snapshot = await getDocs(q);

    const sessions = snapshot.docs.map(doc => ({
      id: parseInt(doc.id),
      ...doc.data(),
      date: doc.data().date.toDate()
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
      return cachedSessions.filter(session => (session as any).needsReview);
    }
  } catch (error) {
    console.warn('Failed to read from offline storage:', error);
  }

  await waitForAuth();

  try {
    const sessionsRef = await getSessionsCollection();
    const q = query(
      sessionsRef,
      where('needsReview', '==', true),
      orderBy('date', 'desc')
    );
    const snapshot = await getDocs(q);

    const sessions = snapshot.docs.map(doc => ({
      id: parseInt(doc.id),
      ...doc.data(),
      date: doc.data().date.toDate()
    })) as TrainingSession[];

    return sessions;
  } catch (error) {
    console.error('Error getting sessions needing review:', error);
    return [];
  }
}

export async function getSessionsByDateRange(startDate: Date, endDate: Date): Promise<TrainingSession[]> {
  try {
    const cachedSessions = await offlineStorage.getSessions();
    if (cachedSessions && cachedSessions.length > 0) {
      return cachedSessions.filter(
        session => session.date >= startDate && session.date <= endDate
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
      orderBy('date', 'desc')
    );
    const snapshot = await getDocs(q);

    const sessions = snapshot.docs.map(doc => ({
      id: parseInt(doc.id),
      ...doc.data(),
      date: doc.data().date.toDate()
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
  id?: number
): Promise<TrainingSession> {
  // Use provided id or generate a new one for optimistic updates
  const sessionId = id ?? Date.now();
  const sessionDate = insertSession.date || new Date();
  const now = new Date();

  const newSession: TrainingSession = {
    ...insertSession,
    id: sessionId,
    date: sessionDate,
    createdAt: now,
  } as TrainingSession;

  // Immediately update local cache for instant feedback
  try {
    await offlineStorage.addSession(newSession);
    await offlineStorage.clearStatistics();

    // Clear localStorage caches to trigger UI updates
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();

    queueMicrotask(() => updateStatisticsInBackground());
  } catch (error) {
    console.warn('Failed to update offline cache:', error);
    // Bubble up the error so callers can detect failures
    throw error;
  }

  // Save to Firebase and surface any errors
  try {
    await waitForAuth();
    const sessionsRef = await getSessionsCollection();

    const sessionData = {
      ...insertSession,
      id: sessionId,
      date: Timestamp.fromDate(sessionDate),
      createdAt: Timestamp.fromDate(now)
    };

    const docRef = doc(sessionsRef, sessionId.toString());

    // Shorter timeout for better UX
    const savePromise = setDoc(docRef, sessionData);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Save taking longer than expected')), 10000);
    });

    await Promise.race([savePromise, timeoutPromise]);
  } catch (error) {
    console.error('Firebase save failed:', error);
    // Bubble up the error so callers can detect failures
    throw error;
  }

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

    try {
      if (updatedSession) {
        await offlineStorage.updateSession(updatedSession);
      } else {
        await offlineStorage.removeSession(id);
      }
      await offlineStorage.clearStatistics();
    } catch (error) {
      console.warn('Failed to update offline cache:', error);
    }

    // Clear cache to force fresh data on next load
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();

    queueMicrotask(() => updateStatisticsInBackground());

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
    await offlineStorage.deleteSession(id);
    await offlineStorage.clearStatistics();

    // Clear cache to force fresh data on next load
    SessionsCache.remove();
    StatisticsCache.remove();
    WeeklyGoalCache.remove();

    queueMicrotask(() => updateStatisticsInBackground());

    return true;
  } catch (error) {
    console.error('Error deleting session:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to delete session');
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

export async function importData(
  data: string,
  onProgress?: (processed: number, total: number) => void
): Promise<{ imported: number; skipped: number }> {
  const sessions: any[] = JSON.parse(data);
  const total = sessions.length;
  const errors: Array<{ id: number; error: unknown }> = [];

  const existingSessions = await offlineStorage.getSessions();
  const existingIds = new Set(existingSessions.map(s => s.id));

  let imported = 0;
  let skipped = 0;
  let processed = 0;

  // Import each session, preserving IDs when provided
  for (const session of sessions) {
    const { id, date, createdAt: _createdAt, ...rest } = session as any;

    if (existingIds.has(id)) {
      skipped++;
      continue;
    }

    let normalizedDate: Date;
    if (typeof date === 'string' || typeof date === 'number') {
      normalizedDate = new Date(date);
    } else if (
      date &&
      typeof date === 'object' &&
      'seconds' in date &&
      'nanoseconds' in date
    ) {
      normalizedDate = new Date(date.seconds * 1000 + date.nanoseconds / 1e6);
    } else if (date instanceof Date) {
      normalizedDate = date;
    } else {
      normalizedDate = new Date();
    }

    try {
      await createSession({ ...rest, date: normalizedDate }, id);
      imported++;
      processed++;
      existingIds.add(id);
      onProgress?.(processed, total);
    } catch (error) {
      errors.push({ id, error });
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(
      errors.map(e => e.error),
      `Failed to import ${errors.length} sessions`
    );
  }

  return { imported, skipped };
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

// ---------------------- User Settings ----------------------

export interface UserSettings {
  lichessUsername?: string;
}

// Retrieve user settings, preferring cached offline data when available
export async function getUserSettings(): Promise<UserSettings> {
  try {
    const cached = await offlineStorage.getSettings();
    if (cached) {
      return cached as UserSettings;
    }
  } catch (error) {
    console.warn('Failed to read settings from offline storage:', error);
  }

  await waitForAuth();

  try {
    const settingsRef = doc(db, 'users', currentUserId!, 'settings', 'settings');
    const snapshot = await getDoc(settingsRef);
    const settings = snapshot.exists() ? (snapshot.data() as UserSettings) : {};
    await offlineStorage.setSettings(settings);
    return settings;
  } catch (error) {
    console.error('Error getting user settings:', error);
    return {};
  }
}

// Update user settings in Firestore and offline storage
export async function updateUserSettings(settings: UserSettings): Promise<void> {
  await waitForAuth();
  try {
    const settingsRef = doc(db, 'users', currentUserId!, 'settings', 'settings');
    await setDoc(settingsRef, settings, { merge: true });
    await offlineStorage.setSettings(settings);
  } catch (error) {
    console.error('Error updating user settings:', error);
    throw error;
  }
}
