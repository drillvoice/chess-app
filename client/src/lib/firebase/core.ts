import { getFirebaseAuth, getFirestoreDb } from '../firebaseClient';

export let auth: Awaited<ReturnType<typeof getFirebaseAuth>>;
export let db: Awaited<ReturnType<typeof getFirestoreDb>>;

export let collection: typeof import('firebase/firestore').collection;
export let doc: typeof import('firebase/firestore').doc;
export let setDoc: typeof import('firebase/firestore').setDoc;
export let getDoc: typeof import('firebase/firestore').getDoc;
export let getDocs: typeof import('firebase/firestore').getDocs;
export let deleteDoc: typeof import('firebase/firestore').deleteDoc;
export let query: typeof import('firebase/firestore').query;
export let where: typeof import('firebase/firestore').where;
export let orderBy: typeof import('firebase/firestore').orderBy;
export let onSnapshot: typeof import('firebase/firestore').onSnapshot;
export let Timestamp: typeof import('firebase/firestore').Timestamp;

export let onAuthStateChanged: typeof import('firebase/auth').onAuthStateChanged;
export let signInAnonymously: typeof import('firebase/auth').signInAnonymously;

let currentUserId: string | null = null;
let authListenerInitialized = false;
let authResolvers: Array<() => void> = [];
let anonymousSignInPromise: Promise<void> | null = null;

export async function ensureFirebase() {
  if (!auth) {
    auth = await getFirebaseAuth();
  }
  if (!db) {
    db = await getFirestoreDb();
  }
  if (!collection) {
    const firestore = await import('firebase/firestore');
    ({
      collection,
      doc,
      setDoc,
      getDoc,
      getDocs,
      deleteDoc,
      query,
      where,
      orderBy,
      onSnapshot,
      Timestamp,
    } = firestore);
  }
  if (!onAuthStateChanged) {
    const authModule = await import('firebase/auth');
    ({ onAuthStateChanged, signInAnonymously } = authModule);
  }

  if (!authListenerInitialized) {
    if (!onAuthStateChanged) throw new Error('Firebase auth not initialized');
    onAuthStateChanged(auth, async (user) => {
      currentUserId = user ? user.uid : null;

      if (currentUserId) {
        await ensureUserDoc();
        authResolvers.forEach((res) => res());
        authResolvers = [];
      }
    });
    authListenerInitialized = true;
  }
}

async function ensureAnonymousAuth(): Promise<void> {
  if (anonymousSignInPromise) {
    return anonymousSignInPromise;
  }

  if (auth.currentUser) {
    return;
  }

  anonymousSignInPromise = (async () => {
    try {
      console.log('Signing in anonymously for cloud backup...');
      await signInAnonymously(auth);
      console.log('Anonymous backup authentication successful');
    } catch (error) {
      console.error('Anonymous backup sign-in failed:', error);
      anonymousSignInPromise = null;
      throw error;
    }
  })();

  return anonymousSignInPromise;
}

export async function waitForAuth(): Promise<void> {
  await ensureFirebase();

  if (currentUserId) {
    return;
  }

  const existingUser = auth.currentUser;
  if (existingUser) {
    currentUserId = existingUser.uid;
    await ensureUserDoc();
    return;
  }

  await ensureAnonymousAuth();
  await new Promise((resolve) => setTimeout(resolve, 500));

  const user = auth.currentUser;
  if (user) {
    currentUserId = user.uid;
    await ensureUserDoc();
  }
}

export async function getSessionsCollection() {
  if (!currentUserId) throw new Error('User not authenticated');
  return collection(db, 'users', currentUserId, 'trainingSessions');
}

export async function getDailyGoalsCollection() {
  if (!currentUserId) throw new Error('User not authenticated');
  return collection(db, 'users', currentUserId, 'dailyGoals');
}

async function ensureUserDoc(): Promise<void> {
  try {
    console.log('🔧 ensureUserDoc called for user:', currentUserId);
    await setDoc(doc(db, 'users', currentUserId!), { createdAt: Timestamp.now() }, { merge: true });
    console.log('✅ User document created/updated successfully');
  } catch (error) {
    console.error('❌ Error ensuring user document:', error);
    throw error;
  }
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}

export function clearCurrentUserId(): void {
  currentUserId = null;
}

export async function ensureAuthentication(): Promise<void> {
  await ensureFirebase();

  if (typeof (auth as any).authStateReady === 'function') {
    try {
      await (auth as any).authStateReady();
    } catch (error) {
      console.warn('authStateReady failed:', error);
    }
  }

  if (auth.currentUser) {
    return;
  }

  const hasRealLogin = typeof window !== 'undefined' && localStorage.getItem('hasRealLogin') === 'true';
  if (hasRealLogin) {
    window.dispatchEvent(new CustomEvent('auth:reauth-required'));
    return;
  }

  await ensureAnonymousAuth();
}
