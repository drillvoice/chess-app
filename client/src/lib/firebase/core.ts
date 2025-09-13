import { getFirebaseAuth, getFirestoreDb } from '../firebaseClient';

export let auth: Awaited<ReturnType<typeof getFirebaseAuth>>;
export let db: Awaited<ReturnType<typeof getFirestoreDb>>;

export let collection: typeof import('firebase/firestore').collection;
export let doc: typeof import('firebase/firestore').doc;
export let getDocs: typeof import('firebase/firestore').getDocs;
export let getDoc: typeof import('firebase/firestore').getDoc;
export let deleteDoc: typeof import('firebase/firestore').deleteDoc;
export let setDoc: typeof import('firebase/firestore').setDoc;
export let updateDoc: typeof import('firebase/firestore').updateDoc;
export let query: typeof import('firebase/firestore').query;
export let where: typeof import('firebase/firestore').where;
export let orderBy: typeof import('firebase/firestore').orderBy;
export let onSnapshot: typeof import('firebase/firestore').onSnapshot;
export let Timestamp: typeof import('firebase/firestore').Timestamp;
export let limit: typeof import('firebase/firestore').limit;

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
      getDocs,
      getDoc,
      deleteDoc,
      setDoc,
      updateDoc,
      query,
      where,
      orderBy,
      onSnapshot,
      Timestamp,
      limit,
    } = firestore);
  }
  if (!onAuthStateChanged) {
    const authModule = await import('firebase/auth');
    ({
      onAuthStateChanged,
      signInAnonymously,
    } = authModule);
  }

  if (!authListenerInitialized) {
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

// Automatically sign in anonymously if no user is authenticated
async function ensureAnonymousAuth(): Promise<void> {
  if (anonymousSignInPromise) {
    return anonymousSignInPromise;
  }

  if (auth.currentUser) {
    return; // Already authenticated
  }

  anonymousSignInPromise = (async () => {
    try {
      console.log(
        'No authenticated user found, signing in anonymously for device-specific storage...',
      );
      await signInAnonymously(auth);
      console.log('Anonymous authentication successful');
    } catch (error) {
      console.error('Anonymous sign-in failed:', error);
      anonymousSignInPromise = null;
      throw error;
    }
  })();

  return anonymousSignInPromise;
}

export async function waitForAuth(timeoutMs = 30000): Promise<void> {
  console.log('🔐 waitForAuth called with timeout:', timeoutMs);
  await ensureFirebase();
  
  if (currentUserId) {
    console.log('✅ User already authenticated:', currentUserId);
    return;
  }
  
  if (auth.currentUser) {
    currentUserId = auth.currentUser.uid;
    console.log('✅ Current user found:', currentUserId);
    await ensureUserDoc();
    return;
  }

  // Try anonymous sign-in first as fallback
  try {
    console.log('🔄 Attempting anonymous authentication...');
    await ensureAnonymousAuth();
    // Wait a moment for the auth state change to propagate
    await new Promise((resolve) => setTimeout(resolve, 500));
    const user = auth.currentUser;
    if (user) {
      currentUserId = (user as any).uid;
      console.log('✅ Anonymous authentication successful:', currentUserId);
      await ensureUserDoc();
      return;
    }
  } catch (error) {
    console.warn('Anonymous auth fallback failed:', error);
  }

  // If anonymous auth didn't work, wait for any auth state change
  console.log('⏳ Waiting for auth state change...');
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUserId = user.uid;
        console.log('✅ Auth state change detected, user authenticated:', currentUserId);
        await ensureUserDoc();
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
    timer = setTimeout(() => {
      unsubscribe();
      const error = new Error(`Authentication timeout after ${timeoutMs}ms`);
      console.error('❌ Authentication timeout:', error);
      reject(error);
    }, timeoutMs);
  });
}

export async function getSessionsCollection() {
  if (!currentUserId) throw new Error('User not authenticated');
  return collection(db, 'users', currentUserId, 'trainingSessions');
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

// Public function to ensure anonymous authentication for apps that need Firebase access
export async function ensureAuthentication(): Promise<void> {
  await ensureFirebase();
  await new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, () => {
      unsub();
      resolve(undefined);
    });
  });
  if (!auth.currentUser) {
    await ensureAnonymousAuth();
  }
}


