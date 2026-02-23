import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebaseClient', () => ({
  getFirebaseAuth: vi.fn(),
  getFirestoreDb: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  Timestamp: { now: vi.fn(() => new Date()) },
  limit: vi.fn(),
}));

const signInAnonymously = vi.fn();
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {
    static credentialFromResult() {
      return null;
    }
  },
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  linkWithCredential: vi.fn(),
  linkWithRedirect: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInAnonymously,
}));

describe('ensureAuthentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  it('avoids anonymous sign-in when user exists after authStateReady', async () => {
    const mockAuth: any = {
      currentUser: null,
      authStateReady: vi.fn().mockImplementation(async () => {
        mockAuth.currentUser = { uid: 'abc' };
      }),
    };
    const mockDb = {};
    const firebaseClient = await import('../firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue(mockDb);

    const { ensureAuthentication } = await import('./auth');
    await ensureAuthentication();

    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('keeps local-only mode when no user after authStateReady', async () => {
    const mockAuth: any = {
      currentUser: null,
      authStateReady: vi.fn().mockResolvedValue(undefined),
    };
    const mockDb = {};
    const firebaseClient = await import('../firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue(mockDb);

    const { ensureAuthentication } = await import('./auth');
    await ensureAuthentication();

    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('dispatches reauth event when previous login detected', async () => {
    localStorage.setItem('hasRealLogin', 'true');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const mockAuth: any = {
      currentUser: null,
      authStateReady: vi.fn().mockResolvedValue(undefined),
    };
    const mockDb = {};
    const firebaseClient = await import('../firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue(mockDb);

    const { ensureAuthentication } = await import('./auth');
    await ensureAuthentication();

    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth:reauth-required' }),
    );
  });
});
