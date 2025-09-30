import {
  ensureFirebase,
  auth,
  db,
  doc,
  setDoc,
  Timestamp,
  clearCurrentUserId,
} from './core';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  linkWithCredential,
} from 'firebase/auth';

export { ensureAuthentication, getCurrentUserId } from './core';

export async function refreshAuthState(): Promise<void> {
  await ensureFirebase();
  const user = auth.currentUser;
  if (!user) {
    clearCurrentUserId();
    return;
  }

  await setDoc(doc(db, 'users', user.uid), { createdAt: Timestamp.now() }, { merge: true });
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
  } catch (error) {
    throw error;
  }
}

export function stopSessionSync(): void {
  // Firestore listeners are managed elsewhere; provided for API compatibility.
}

export function startSessionSync(): void {
  // Firestore listeners are managed elsewhere; provided for API compatibility.
}
