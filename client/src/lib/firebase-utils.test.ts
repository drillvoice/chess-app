import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebaseClient', () => ({
  getFirebaseAuth: vi.fn(),
  getFirestoreDb: vi.fn(),
}));

const mockSessions: any[] = [];
const addSession = vi.fn(async (session: any) => {
  mockSessions.push(session);
});
const getSessions = vi.fn(async () => mockSessions);

vi.mock('./offline-storage', () => ({
  offlineStorage: {
    getSessions,
    setSessions: vi.fn(),
    addSession,
  },
}));

vi.mock('./cache-utils', () => ({
  SessionsCache: { set: vi.fn(), remove: vi.fn() },
  StatisticsCache: { set: vi.fn(), get: vi.fn(), remove: vi.fn() },
  WeeklyGoalCache: { set: vi.fn(), get: vi.fn(), remove: vi.fn() },
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
  signInWithRedirect: vi.fn(),
  linkWithCredential: vi.fn(),
  linkWithRedirect: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

describe('firebase auth utilities', () => {
  beforeEach(() => {
    mockSessions.length = 0;
    vi.clearAllMocks();
    addSession.mockImplementation(async (session: any) => {
      mockSessions.push(session);
    });
    getSessions.mockImplementation(async () => mockSessions);
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

  it('verifyDataPresence returns true when cache and firebase are accessible', async () => {
    const offline = await import('./offline-storage');
    offline.offlineStorage.getSessions.mockResolvedValue([{ id: 1 }]);

    const utils = await import('./firebase-utils');
    // Stub fetchSessionsFromFirebase to avoid touching network
    vi.spyOn(utils, 'fetchSessionsFromFirebase').mockResolvedValue([]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await utils.verifyDataPresence();

    expect(result).toBe(true);
    expect(offline.offlineStorage.getSessions).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Migration verification: cached', 1, 'live read successful');

    logSpy.mockRestore();
  });

  it('verifyDataPresence returns false when verification fails', async () => {
    const offline = await import('./offline-storage');
    offline.offlineStorage.getSessions.mockRejectedValue(new Error('fail'));

    const utils = await import('./firebase-utils');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await utils.verifyDataPresence();

    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('startAuthFlow signs in and links anonymous user', async () => {
    const mockAuth: any = { currentUser: { uid: 'anon', isAnonymous: true } };
    const mockDb = {};
    const firebaseClient = await import('./firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue(mockDb);

    const authModule = await import('firebase/auth');
    let authChange: any;
    (authModule.onAuthStateChanged as any).mockImplementation((_auth, cb) => {
      authChange = cb;
      cb(mockAuth.currentUser);
      return () => {};
    });
    (authModule.signInWithPopup as any).mockImplementation(async () => {
      mockAuth.currentUser = { uid: 'user123', isAnonymous: false };
      authChange(mockAuth.currentUser);
      return { user: mockAuth.currentUser };
    });
    (authModule.GoogleAuthProvider as any).credentialFromResult = () => ({});
    (authModule.linkWithCredential as any).mockResolvedValue({ user: mockAuth.currentUser });

    const utils = await import('./firebase-utils');
    await utils.startAuthFlow();

    expect(authModule.signInWithPopup).toHaveBeenCalled();
    expect(authModule.linkWithCredential).toHaveBeenCalled();
    expect(docMock).toHaveBeenCalledWith(mockDb, 'users', 'user123');
  });

  it('updates currentUserId on sign-out', async () => {
    const mockAuth: any = { currentUser: { uid: 'user123' } };
    const mockDb = {};
    const firebaseClient = await import('./firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue(mockDb);

    const authModule = await import('firebase/auth');
    let authChange: any;
    (authModule.onAuthStateChanged as any).mockImplementation((_auth, cb) => {
      authChange = cb;
      cb(mockAuth.currentUser);
      return () => {};
    });

    const utils = await import('./firebase-utils');
    await utils.refreshAuthState();
    expect(utils.getCurrentUserId()).toBe('user123');

    mockAuth.currentUser = null;
    authChange(null);
    expect(utils.getCurrentUserId()).toBeNull();
  });

  it('importData stores sessions in offline storage', async () => {
    const offline = await import('./offline-storage');
    const utils = await import('./firebase-utils');

    const firebaseClient = await import('./firebaseClient');
    const mockAuth = { currentUser: { uid: 'user123' } };
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth, cb) => {
      cb(mockAuth.currentUser);
      return () => {};
    });

    const backup = JSON.stringify([
      { id: 1, type: 'puzzle', duration: 30, date: new Date().toISOString() },
      { id: 2, type: 'game', duration: 60, date: new Date().toISOString() }
    ]);

    await utils.importData(backup);

    const stored = await offline.offlineStorage.getSessions();
    expect(stored).toHaveLength(2);
    expect(stored.map((s: any) => s.id)).toEqual([1, 2]);
  });

  it('importData surfaces errors from offline storage', async () => {
    const offline = await import('./offline-storage');
    const utils = await import('./firebase-utils');

    const firebaseClient = await import('./firebaseClient');
    const mockAuth = { currentUser: { uid: 'user123' } };
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth, cb) => {
      cb(mockAuth.currentUser);
      return () => {};
    });

    offline.offlineStorage.addSession.mockImplementationOnce(async () => {
      throw new Error('fail');
    });

    const backup = JSON.stringify([
      { id: 1, type: 'puzzle', duration: 30, date: new Date().toISOString() },
      { id: 2, type: 'game', duration: 60, date: new Date().toISOString() }
    ]);

    await expect(utils.importData(backup)).rejects.toThrow('Failed to import 1 sessions');
  });
});
