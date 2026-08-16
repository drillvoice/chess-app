import type { Page, Route } from '@playwright/test';

/**
 * Network-level stubs for the Firebase SDK, shared by every E2E spec.
 *
 * The app loads `firebase/auth` and `firebase/firestore` as ES modules, so these
 * replacements have to export *every* binding the app imports. A missing export
 * is not a silently-undefined function: the module fails to link and Vite blanks
 * the page with "does not provide an export named X", which then shows up as
 * every locator on every spec timing out.
 *
 * So: when you add a Firebase import under `client/src/lib/firebase/` or in
 * `client/src/components/firebase-auth.tsx`, add the matching export here.
 */

const AUTH_MODULE = `
  const auth = globalThis.__mockAuth || (globalThis.__mockAuth = { currentUser: null });
  let authChange;
  globalThis.__signInCalls = 0;
  globalThis.__signOutCalls = 0;

  export class GoogleAuthProvider { static credentialFromResult() { return null; } }

  export async function signInWithPopup() {
    auth.currentUser = { uid: 'mock', isAnonymous: false };
    authChange && authChange(auth.currentUser);
    globalThis.__signInCalls++;
    return { user: auth.currentUser };
  }
  export async function signInWithRedirect() {
    auth.currentUser = { uid: 'mock', isAnonymous: false };
    authChange && authChange(auth.currentUser);
    globalThis.__signInCalls++;
  }
  export async function getRedirectResult() { return null; }
  export async function signInAnonymously() {
    auth.currentUser = { uid: 'anon', isAnonymous: true };
    authChange && authChange(auth.currentUser);
    return { user: auth.currentUser };
  }
  export async function linkWithCredential(user) { auth.currentUser = user; return { user }; }
  export function onAuthStateChanged(_auth, cb) { authChange = cb; cb(auth.currentUser); return () => {}; }
  export async function signOut() {
    auth.currentUser = null;
    authChange && authChange(auth.currentUser);
    globalThis.__signOutCalls++;
  }
  globalThis.__signOut = () => signOut();
`;

const CLIENT_MODULE = `
  const auth = globalThis.__mockAuth || (globalThis.__mockAuth = { currentUser: null });
  export async function getFirebaseAuth() { return auth; }
  export async function getFirestoreDb() { return {}; }
`;

const FIRESTORE_MODULE = `
  export const collection = () => {};
  export const doc = () => ({});
  export const getDocs = async () => ({ docs: [] });
  export const getDoc = async () => ({ exists: () => false });
  export const deleteDoc = async () => {};
  export const setDoc = async () => {};
  export const query = () => {};
  export const where = () => {};
  export const orderBy = () => {};
  export const onSnapshot = () => {};
  export const Timestamp = { now: () => new Date(), fromDate: () => new Date() };
`;

function serveModule(body: string) {
  return (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body });
}

/** Route every Firebase module request to an in-memory stub. */
export async function stubFirebase(page: Page): Promise<void> {
  // Match the Vite dep bundle (`.vite/deps/firebase_auth.js`) and the raw
  // package path. Deliberately NOT `*firebase-auth*`: that also matches the
  // app's own `client/src/components/firebase-auth.tsx`, and serving this stub
  // in its place strips the component's default export and blanks the page.
  const auth = serveModule(AUTH_MODULE);
  await page.route('**/firebase_auth*', auth);
  await page.route('**/firebase/auth/**', auth);

  const firestore = serveModule(FIRESTORE_MODULE);
  await page.route('**/firebase_firestore*', firestore);
  await page.route('**/firebase/firestore/**', firestore);

  await page.route('**/firebaseClient*', serveModule(CLIENT_MODULE));
}
