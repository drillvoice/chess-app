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

export let GoogleAuthProvider: typeof import('firebase/auth').GoogleAuthProvider;
export let signInWithPopup: typeof import('firebase/auth').signInWithPopup;
export let signInWithRedirect: typeof import('firebase/auth').signInWithRedirect;
export let linkWithCredential: typeof import('firebase/auth').linkWithCredential;
export let linkWithRedirect: typeof import('firebase/auth').linkWithRedirect;
export let onAuthStateChanged: typeof import('firebase/auth').onAuthStateChanged;
export let signInAnonymously: typeof import('firebase/auth').signInAnonymously;
export let provider: import('firebase/auth').GoogleAuthProvider;

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
  if (!signInWithPopup) {
    const authModule = await import('firebase/auth');
    ({
      GoogleAuthProvider,
      signInWithPopup,
      signInWithRedirect,
      linkWithCredential,
      linkWithRedirect,
      onAuthStateChanged,
      signInAnonymously,
    } = authModule);
    provider = new GoogleAuthProvider();
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
      console.log('No authenticated user found, signing in anonymously for device-specific storage...');
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

export async function waitForAuth(timeoutMs = 15000): Promise<void> {
  await ensureFirebase();
  if (currentUserId) return;
  if (auth.currentUser) {
    currentUserId = auth.currentUser.uid;
    await ensureUserDoc();
    return;
  }

  // Try anonymous sign-in first as fallback
  try {
    await ensureAnonymousAuth();
    // Wait a moment for the auth state change to propagate
    await new Promise(resolve => setTimeout(resolve, 100));
    const user = auth.currentUser;
    if (user) {
      currentUserId = (user as any).uid;
      await ensureUserDoc();
      return;
    }
  } catch (error) {
    console.warn('Anonymous auth fallback failed:', error);
  }

  // If anonymous auth didn't work, wait for any auth state change
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUserId = user.uid;
        await ensureUserDoc();
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
    timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Authentication timeout after ${timeoutMs}ms`));
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
  if (!auth.currentUser) {
    await ensureAnonymousAuth();
  }
}

export async function startAuthFlow(useRedirect = false): Promise<void> {
  await ensureFirebase();
  
  // Ensure we have an anonymous user to link with, if none exists
  if (!auth.currentUser) {
    await ensureAnonymousAuth();
  }
  
  const anonUser = auth.currentUser;
  if (useRedirect) {
    if (anonUser && anonUser.isAnonymous) {
      await linkWithRedirect(anonUser, provider);
    } else {
      await signInWithRedirect(auth, provider);
    }
  } else {
    if (anonUser && anonUser.isAnonymous) {
      // Link the anonymous user with Google credentials
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential) {
        await linkWithCredential(anonUser, credential);
      }
    } else {
      // Direct sign-in if no anonymous user exists
      await signInWithPopup(auth, provider);
    }
  }
  await refreshAuthState();
}

