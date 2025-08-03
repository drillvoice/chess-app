import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebaseClient', () => ({
  getFirebaseAuth: vi.fn(),
  getFirestoreDb: vi.fn(),
}));

vi.mock('./offline-storage', () => ({
  offlineStorage: {
    getSessions: vi.fn(),
    setSessions: vi.fn(),
  },
}));

vi.mock('./cache-utils', () => ({
  SessionsCache: { set: vi.fn() },
  StatisticsCache: { set: vi.fn(), get: vi.fn() },
  WeeklyGoalCache: { set: vi.fn(), get: vi.fn() },
}));

const docMock = vi.fn(() => ({}));
const setDocMock = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: docMock,
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  setDoc: setDocMock,
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  Timestamp: { now: vi.fn(() => new Date()), fromDate: vi.fn(() => new Date()) },
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class { static credentialFromResult() { return null; } },
  signInWithPopup: vi.fn(),
  linkWithCredential: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

describe('firebase auth utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('refreshAuthState stores user id and ensures user doc', async () => {
    const mockAuth = { currentUser: { uid: 'user123' } };
    const mockDb = {};
    const firebaseClient = await import('./firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue(mockDb);

    const utils = await import('./firebase-utils');
    await utils.refreshAuthState();

    expect(docMock).toHaveBeenCalledWith(mockDb, 'users', 'user123');
    expect(setDocMock).toHaveBeenCalled();
  });

  it('refreshAuthState handles no current user', async () => {
    const mockAuth = { currentUser: null };
    const mockDb = {};
    const firebaseClient = await import('./firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue(mockDb);

    const utils = await import('./firebase-utils');
    await utils.refreshAuthState();

    expect(docMock).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('verifyDataPresence checks cache and firebase', async () => {
    const offline = await import('./offline-storage');
    offline.offlineStorage.getSessions.mockResolvedValue([{ id: 1 }]);

    const utils = await import('./firebase-utils');
    // Stub fetchSessionsFromFirebase to avoid touching network
    vi.spyOn(utils, 'fetchSessionsFromFirebase').mockResolvedValue([]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await utils.verifyDataPresence();

    expect(offline.offlineStorage.getSessions).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Migration verification: cached', 1, 'live read successful');

    logSpy.mockRestore();
  });
});
