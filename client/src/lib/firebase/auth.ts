import { ensureFirebase, auth, db, doc, setDoc, Timestamp, clearCurrentUserId } from './core';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  linkWithCredential,
} from 'firebase/auth';
import {
  initializeCloudSyncForCurrentUser,
  startRealtimeSync,
  stopRealtimeSync,
} from './sync-engine';

export { ensureAuthentication, getCurrentUserId } from './core';

export async function refreshAuthState(): Promise<void> {
  await ensureFirebase();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    clearCurrentUserId();
    return;
  }

  await setDoc(doc(db, 'users', user.uid), { createdAt: Timestamp.now() }, { merge: true });
  await initializeCloudSyncForCurrentUser();
}

export async function startAuthFlow(useRedirect = false): Promise<void> {
  await ensureFirebase();

  const provider = new GoogleAuthProvider();
  const previousUser = auth.currentUser;

  if (useRedirect) {
    await signInWithRedirect(auth, provider);
    return;
  }

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (previousUser?.isAnonymous && credential) {
      await linkWithCredential(previousUser, credential);
    }

    localStorage.setItem('hasRealLogin', 'true');
    await initializeCloudSyncForCurrentUser();
  } catch (error) {
    throw error;
  }
}

export async function stopSessionSync(): Promise<void> {
  await stopRealtimeSync();
}

export async function startSessionSync(): Promise<void> {
  await startRealtimeSync();
}
