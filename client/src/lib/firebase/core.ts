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
let previousAnonymousUserId: string | null = null; // Track previous anonymous user for migration

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
      const previousUserId = currentUserId;
      currentUserId = user ? user.uid : null;

      if (currentUserId) {
        await ensureUserDoc();

        // Handle migration when linking anonymous to Google
        if (previousUserId && previousUserId !== currentUserId && previousAnonymousUserId) {
          console.log('🔄 Auth state change detected - potential migration needed');
          localStorage.setItem('previousAnonymousUserId', previousAnonymousUserId);

          // If this is now a Google user (not anonymous), trigger migration
          if (user && !user.isAnonymous) {
            try {
              await migrateAnonymousData(previousAnonymousUserId, currentUserId);
              previousAnonymousUserId = null; // Clear after successful migration
            } catch (error) {
              console.error('❌ Migration during auth state change failed:', error);
            }
          }
        }

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

    // Check for data migration if this is a Google user (not anonymous)
    if (user && !user.isAnonymous) {
      await checkAndMigrateData();
    }
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

export async function startAuthFlow(useRedirect = false): Promise<void> {
  await ensureFirebase();

  // Check if user is already signed in with Google
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    console.log('✅ User already signed in with Google, no action needed');
    await refreshAuthState();
    return;
  }

  // Store the current anonymous user ID before linking (if any)
  if (auth.currentUser && auth.currentUser.isAnonymous) {
    previousAnonymousUserId = auth.currentUser.uid;
    console.log('🔗 Storing anonymous user ID for potential migration:', previousAnonymousUserId);
  }

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

// New function to migrate data from anonymous user to Google user
async function migrateAnonymousData(anonymousUserId: string, googleUserId: string): Promise<void> {
  try {
    console.log('🔄 Starting data migration from anonymous user to Google user...');

    // Migrate sessions
    const anonymousSessionsRef = collection(db, 'users', anonymousUserId, 'trainingSessions');
    const googleSessionsRef = collection(db, 'users', googleUserId, 'trainingSessions');

    const sessionsSnapshot = await getDocs(anonymousSessionsRef);
    let migratedSessions = 0;

    for (const sessionDoc of sessionsSnapshot.docs) {
      const sessionData = sessionDoc.data();
      await setDoc(doc(googleSessionsRef, sessionDoc.id), sessionData);
      migratedSessions++;
    }

    // Migrate settings
    const anonymousSettingsRef = doc(db, 'users', anonymousUserId, 'settings', 'settings');
    const googleSettingsRef = doc(db, 'users', googleUserId, 'settings', 'settings');

    try {
      const settingsDoc = await getDoc(anonymousSettingsRef);
      if (settingsDoc.exists()) {
        await setDoc(googleSettingsRef, settingsDoc.data(), { merge: true });
        console.log('✅ Settings migrated');
      }
    } catch (error) {
      console.warn('No settings to migrate or error:', error);
    }

    // Migrate statistics
    const anonymousStatsRef = collection(db, 'users', anonymousUserId, 'statistics');
    const googleStatsRef = collection(db, 'users', googleUserId, 'statistics');

    try {
      const statsSnapshot = await getDocs(anonymousStatsRef);
      for (const statsDoc of statsSnapshot.docs) {
        const statsData = statsDoc.data();
        await setDoc(doc(googleStatsRef, statsDoc.id), statsData);
      }
      console.log('✅ Statistics migrated');
    } catch (error) {
      console.warn('No statistics to migrate or error:', error);
    }

    console.log(`✅ Data migration completed: ${migratedSessions} sessions migrated`);

    // Store migration record to prevent re-migration
    await setDoc(doc(db, 'users', googleUserId, 'migrations', 'anonymous'), {
      migratedFrom: anonymousUserId,
      migratedAt: Timestamp.now(),
      sessionsCount: migratedSessions,
    });
  } catch (error) {
    console.error('❌ Data migration failed:', error);
    throw error;
  }
}

// Check if data migration is needed for the current user
async function checkAndMigrateData(): Promise<void> {
  try {
    const userId = getCurrentUserId();
    if (!userId) return;

    // Check if this user has already been migrated
    const migrationRef = doc(db, 'users', userId, 'migrations', 'anonymous');
    const migrationDoc = await getDoc(migrationRef);

    if (migrationDoc.exists()) {
      console.log('✅ User already migrated, skipping migration check');
      return;
    }

    // Check if there's a previous anonymous user ID stored locally
    const storedAnonymousId = localStorage.getItem('previousAnonymousUserId');
    if (storedAnonymousId && storedAnonymousId !== userId) {
      console.log('🔄 Found stored anonymous user ID, attempting migration...');
      await migrateAnonymousData(storedAnonymousId, userId);
      localStorage.removeItem('previousAnonymousUserId'); // Clean up
      return;
    }

    // Check if this user has any data (if not, might be a new device)
    const sessionsRef = collection(db, 'users', userId, 'trainingSessions');
    const sessionsSnapshot = await getDocs(sessionsRef);

    if (sessionsSnapshot.empty) {
      console.log('📱 New device detected - no existing data found');
      // For new devices, we'll rely on the real-time sync to populate data
    } else {
      console.log('✅ User has existing data, no migration needed');
    }
  } catch (error) {
    console.error('❌ Migration check failed:', error);
  }
}
