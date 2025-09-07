import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const handleAuth = (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
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
        export async function linkWithCredential(user, credential) { auth.currentUser = user; return { user }; }
        export function onAuthStateChanged(_auth, cb) { authChange = cb; cb(auth.currentUser); return () => {}; }
        export async function signOut() {
          auth.currentUser = null;
          authChange && authChange(auth.currentUser);
          globalThis.__signOutCalls++;
        }
        globalThis.__signOut = () => signOut();
      `,
    });
  };
  await page.route('**/*firebase_auth*', handleAuth);
  await page.route('**/*firebase-auth*', handleAuth);

  await page.route('**/*firebaseClient*', (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        const auth = globalThis.__mockAuth || (globalThis.__mockAuth = { currentUser: null });
        export async function getFirebaseAuth() { return auth; }
        export async function getFirestoreDb() { return {}; }
      `,
    });
  });

  const handleFirestore = (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
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
      `,
    });
  };
  await page.route('**/*firebase_firestore*', handleFirestore);
  await page.route('**/*firebase-firestore*', handleFirestore);
});

test.skip('Google sign-in and sign-out flow', async ({ page }) => {
  // Requires full Firebase environment; covered in manual tests.
  await page.goto('/');
});

test('data management accessible only from Account page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /activity/i }).click();
  await expect(page.getByText(/data management/i)).toHaveCount(0);
  await page.getByRole('button', { name: /account/i }).click();
  await expect(page.getByText(/data management/i)).toBeVisible();
});
