import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebaseClient', () => ({
  getFirebaseAuth: vi.fn(),
  getFirestoreDb: vi.fn(),
}));

const mockSessions: any[] = [];
const addSession = vi.fn(async (session: any) => {
  session.date.toISOString();
  mockSessions.push(session);
});
const getSessions = vi.fn(async () => mockSessions);

vi.mock('./offline-storage', () => ({
  offlineStorage: {
    getSessions,
    setSessions: vi.fn(),
    addSession,
    updateSession: vi.fn(),
    removeSession: vi.fn(),
    deleteSession: vi.fn(),
    getStatistics: vi.fn(),
    setStatistics: vi.fn().mockResolvedValue(undefined),
    clearStatistics: vi.fn(),
    getCacheAge: vi.fn(),
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
  limit: vi.fn(),
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
      session.date.toISOString();
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
    vi.mocked(offline.offlineStorage.getSessions).mockResolvedValue([{ id: 1 } as any]);

    const utils = await import('./firebase-utils');
    // Stub fetchSessionsFromFirebase to avoid touching network
    const fetchSpy = vi.spyOn(utils, 'fetchSessionsFromFirebase');
    fetchSpy.mockResolvedValue([]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await utils.verifyDataPresence();

    expect(result).toBe(true);
    expect(offline.offlineStorage.getSessions).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Migration verification: cached', 1, 'live read successful');

    logSpy.mockRestore();
  });

  it('verifyDataPresence returns false when verification fails', async () => {
    const offline = await import('./offline-storage');
    vi.mocked(offline.offlineStorage.getSessions).mockRejectedValue(new Error('fail'));

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
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
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
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
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

  it('getAllSessions filters out daily-goal entries from cache', async () => {
    const offline = await import('./offline-storage');
    vi.mocked(offline.offlineStorage.getCacheAge).mockResolvedValue(0);
    mockSessions.push(
      { id: 1, type: 'game', date: new Date() } as any,
      { id: 2, type: 'daily-goal', date: new Date() } as any
    );

    const utils = await import('./firebase-utils');
    const sessions = await utils.getAllSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions.every(s => s.type !== 'daily-goal')).toBe(true);
  });

  it('fetchSessionsFromFirebase filters out daily-goal before caching', async () => {
    const offline = await import('./offline-storage');
    const firebaseClient = await import('./firebaseClient');
    const mockAuth = { currentUser: { uid: 'user123' } };
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(mockAuth.currentUser);
      return () => {};
    });

    const firestore = await import('firebase/firestore');
    const doc1 = { id: '1', data: () => ({ type: 'game', date: { toDate: () => new Date() } }) };
    const doc2 = { id: '2', data: () => ({ type: 'daily-goal', date: { toDate: () => new Date() } }) };
    (firestore.getDocs as any).mockResolvedValue({ docs: [doc1, doc2] });

    const utils = await import('./firebase-utils');
    const sessions = await utils.fetchSessionsFromFirebase();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].type).toBe('game');
    const cached = vi.mocked(offline.offlineStorage.setSessions).mock.calls[0][0];
    expect(cached.some((s: any) => s.type === 'daily-goal')).toBe(false);
  });

  it('importData stores sessions in offline storage', async () => {
    const offline = await import('./offline-storage');
    const utils = await import('./firebase-utils');

    const firebaseClient = await import('./firebaseClient');
    const mockAuth = { currentUser: { uid: 'user123' } };
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(mockAuth.currentUser);
      return () => {};
    });

    const now = new Date();
    const iso = now.toISOString();
    const backup = JSON.stringify([
      { id: 1, type: 'puzzle', duration: 30, date: iso, createdAt: iso },
      { id: 2, type: 'game', duration: 60, date: iso, createdAt: iso }
    ]);

    const result = await utils.importData(backup);

    const stored = await offline.offlineStorage.getSessions();
    expect(result).toEqual({ imported: 2, skipped: 0 });
    expect(stored).toHaveLength(2);
    expect(stored.map((s: any) => s.id)).toEqual([1, 2]);
    expect(stored.every((s: any) => s.date instanceof Date)).toBe(true);
    expect(stored.every((s: any) => s.createdAt instanceof Date)).toBe(true);
  });

  it('importData normalizes firestore timestamp objects', async () => {
    const offline = await import('./offline-storage');
    const utils = await import('./firebase-utils');

    const firebaseClient = await import('./firebaseClient');
    const mockAuth = { currentUser: { uid: 'user123' } };
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(mockAuth.currentUser);
      return () => {};
    });

    const ts = { seconds: 1_700_000_000, nanoseconds: 500_000_000 };
    const createdTs = { seconds: 1_700_000_100, nanoseconds: 0 };
    const backup = JSON.stringify([
      { id: 3, type: 'puzzle', duration: 30, date: ts, createdAt: createdTs }
    ]);

    const result = await utils.importData(backup);

    const stored = await offline.offlineStorage.getSessions();
    const expectedDate = new Date(ts.seconds * 1000 + ts.nanoseconds / 1e6);
    expect(result).toEqual({ imported: 1, skipped: 0 });
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(3);
    expect(stored[0].date).toBeInstanceOf(Date);
    expect(stored[0].date.getTime()).toBe(expectedDate.getTime());
    expect((stored[0] as any).createdAt).toBeInstanceOf(Date);
  });

  it('importData handles legacy backups with ISO dates and timestamp createdAt', async () => {
    const offline = await import('./offline-storage');
    const utils = await import('./firebase-utils');

    const firebaseClient = await import('./firebaseClient');
    const mockAuth = { currentUser: { uid: 'user123' } };
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(mockAuth.currentUser);
      return () => {};
    });

    const createdTs = { seconds: 1_700_000_200, nanoseconds: 0 };
    const iso = new Date().toISOString();
    const backup = JSON.stringify([
      { id: 4, type: 'puzzle', duration: 45, date: iso, createdAt: createdTs },
      { id: 5, type: 'game', duration: 60, date: iso, createdAt: createdTs },
    ]);

    const result = await utils.importData(backup);

    const stored = await offline.offlineStorage.getSessions();
    expect(result).toEqual({ imported: 2, skipped: 0 });
    expect(stored).toHaveLength(2);
    expect(stored.map((s: any) => s.id)).toEqual([4, 5]);
    expect(stored.every((s: any) => s.date instanceof Date)).toBe(true);
    expect(stored.every((s: any) => s.createdAt instanceof Date)).toBe(true);
  });

  it('importData skips sessions with existing IDs', async () => {
    const offline = await import('./offline-storage');
    const utils = await import('./firebase-utils');

    const firebaseClient = await import('./firebaseClient');
    const mockAuth = { currentUser: { uid: 'user123' } };
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(mockAuth.currentUser);
      return () => {};
    });

    // existing session id 1 already in storage
    mockSessions.push({ id: 1, type: 'puzzle', duration: 10, date: new Date(), createdAt: new Date() });

    const iso = new Date().toISOString();
    const backup = JSON.stringify([
      { id: 1, type: 'puzzle', duration: 30, date: iso },
      { id: 2, type: 'game', duration: 60, date: iso },
    ]);

    const result = await utils.importData(backup);

    const stored = await offline.offlineStorage.getSessions();
    expect(result).toEqual({ imported: 1, skipped: 1 });
    expect(stored).toHaveLength(2);
    expect(stored.map((s: any) => s.id)).toEqual([1, 2]);
  });

  it('importData reports errors for sessions with invalid date formats', async () => {
    const offline = await import('./offline-storage');
    const utils = await import('./firebase-utils');

    const firebaseClient = await import('./firebaseClient');
    const mockAuth = { currentUser: { uid: 'user123' } };
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(mockAuth.currentUser);
      return () => {};
    });

    const createdTs = { seconds: 1_700_000_300, nanoseconds: 0 };
    const iso = new Date().toISOString();
    const backup = JSON.stringify([
      { id: 6, type: 'puzzle', duration: 30, date: 'not-a-date', createdAt: createdTs },
      { id: 7, type: 'game', duration: 60, date: iso, createdAt: createdTs },
    ]);

    try {
      await utils.importData(backup);
      throw new Error('expected importData to throw');
    } catch (error: any) {
      expect(error).toBeInstanceOf(AggregateError);
      expect(error.errors).toHaveLength(1);
      expect(error.message).toBe('Failed to import 1 sessions');
    }

    const stored = await offline.offlineStorage.getSessions();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(7);
  });

  it('importData surfaces errors from offline storage', async () => {
    const offline = await import('./offline-storage');
    const utils = await import('./firebase-utils');

    const firebaseClient = await import('./firebaseClient');
    const mockAuth = { currentUser: { uid: 'user123' } };
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(mockAuth.currentUser);
      return () => {};
    });

    vi.mocked(offline.offlineStorage.addSession).mockImplementationOnce(async () => {
      throw new Error('fail');
    });

    const backup = JSON.stringify([
      { id: 1, type: 'puzzle', duration: 30, date: new Date().toISOString() },
      { id: 2, type: 'game', duration: 60, date: new Date().toISOString() }
    ]);

    await expect(utils.importData(backup)).rejects.toThrow('Failed to import 1 sessions');
  });

  it('updates daily goal streak without creating training session docs', async () => {
    const offline = await import('./offline-storage');
    vi.mocked(offline.offlineStorage.getCacheAge).mockResolvedValue(0);

    const firebaseClient = await import('./firebaseClient');
    const firestore = await import('firebase/firestore');
    const authModule = await import('firebase/auth');

    const mockDb = {};
    const mockAuth = { currentUser: { uid: 'user123' } };
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue(mockDb);

    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(mockAuth.currentUser);
      return () => {};
    });

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    (firestore.getDoc as any).mockResolvedValue({
      exists: () => true,
      id: 'current',
      data: () => ({
        type: 'daily-goal',
        goalType: 'games-count',
        target: 1,
        active: true,
        createdDate: { toDate: () => today },
        currentStreak: 1,
        lastCompletedDate: yesterdayStr,
      }),
    });

    const utils = await import('./firebase-utils');

    mockSessions.push({ id: 1, type: 'game', date: today } as any);

    const progress = await utils.getDailyProgress();

    expect(progress).toEqual({ progress: 1, completed: true, streak: 2 });

    expect(setDocMock).toHaveBeenCalledWith(
      expect.any(Object),
      { currentStreak: 2, lastCompletedDate: todayStr },
      { merge: true }
    );

    const trainingCalls = docMock.mock.calls.filter(args => args.includes('trainingSessions'));
    expect(trainingCalls.length).toBe(0);
  });
});
