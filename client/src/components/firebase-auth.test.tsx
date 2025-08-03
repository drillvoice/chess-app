import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('@/lib/firebaseClient', () => ({
  getFirebaseAuth: vi.fn(),
  getFirestoreDb: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  setDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  Timestamp: { now: () => new Date(), fromDate: () => new Date() },
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class { static credentialFromResult() { return null; } },
  signInWithPopup: vi.fn(),
  linkWithCredential: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock('@/lib/cache-utils', () => ({
  SessionsCache: { remove: vi.fn() },
}));

vi.mock('@/lib/offline-storage', () => ({
  offlineStorage: { clear: vi.fn() },
}));

import FirebaseAuth from './firebase-auth';
import * as firebaseUtils from '@/lib/firebase-utils';

describe('FirebaseAuth sign-out', () => {
  afterEach(() => cleanup());

  it('clears caches and resets currentUserId', async () => {
    const mockAuth: any = { currentUser: { uid: 'user123' } };
    const firebaseClient = await import('@/lib/firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    let authChange: any;
    (authModule.onAuthStateChanged as any).mockImplementation((_auth, cb) => {
      authChange = cb;
      cb(mockAuth.currentUser);
      return () => {};
    });
    (authModule.signOut as any).mockImplementation(async () => {
      mockAuth.currentUser = null;
      authChange(null);
    });

    await firebaseUtils.refreshAuthState();
    expect(firebaseUtils.getCurrentUserId()).toBe('user123');

    const cacheModule = await import('@/lib/cache-utils');
    const offlineModule = await import('@/lib/offline-storage');

    render(<FirebaseAuth />);
    const signOutButton = await screen.findByRole('button', { name: /disable cloud sync/i });
    fireEvent.click(signOutButton);

    await waitFor(() => {
      expect(firebaseUtils.getCurrentUserId()).toBeNull();
      expect(cacheModule.SessionsCache.remove).toHaveBeenCalled();
      expect(offlineModule.offlineStorage.clear).toHaveBeenCalled();
    });
  });
});
