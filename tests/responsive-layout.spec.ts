import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const handleAuth = (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        const auth = globalThis.__mockAuth || (globalThis.__mockAuth = { currentUser: null });
        let authChange;
        export class GoogleAuthProvider { static credentialFromResult() { return null; } }
        export async function signInWithPopup() {
          auth.currentUser = { uid: 'mock', isAnonymous: false };
          authChange && authChange(auth.currentUser);
          return { user: auth.currentUser };
        }
        export async function linkWithCredential(user, credential) { auth.currentUser = user; return { user }; }
        export function onAuthStateChanged(_auth, cb) { authChange = cb; cb(auth.currentUser); return () => {}; }
        export async function signOut() {
          auth.currentUser = null;
          authChange && authChange(auth.currentUser);
        }
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

const viewports = [
  { name: 'pixel-10', width: 412, height: 915 },
  { name: 'narrow-fallback', width: 360, height: 800 },
];

for (const viewport of viewports) {
  test(`responsive home and modal fit (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: 'Log game' })).toBeVisible();

    const pageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(pageOverflows).toBeFalsy();

    await page.getByRole('button', { name: 'Activity' }).click();
    await expect(page).toHaveURL(/\/activity$/);

    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole('button', { name: 'Log game' }).click();
    const dialog = page.getByRole('dialog', { name: 'Log game' });
    await expect(dialog).toBeVisible();

    await expect(page.getByRole('button', { name: 'Classical' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Over the Board' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width + 1);

    const modalPageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(modalPageOverflows).toBeFalsy();
  });
}
