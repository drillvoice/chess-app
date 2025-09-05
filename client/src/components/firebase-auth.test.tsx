import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

vi.mock('@/lib/firebaseClient', () => ({
  getFirebaseAuth: vi.fn(),
  getFirestoreDb: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  Timestamp: { now: () => new Date(), fromDate: () => new Date() },
}));

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
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
  getRedirectResult: vi.fn(() => Promise.resolve(null)),
  signInAnonymously: vi.fn(),
}));

vi.mock('@/lib/cache-utils', () => ({
  SessionsCache: { remove: vi.fn(), set: vi.fn() },
}));

vi.mock('@/lib/offline-storage', () => ({
  offlineStorage: {
    clear: vi.fn(),
    getSessions: vi.fn().mockResolvedValue([]),
    setSessions: vi.fn(),
    mergeSessions: vi.fn(),
    getLastSyncedTimestamp: vi.fn(),
    setLastSyncedTimestamp: vi.fn(),
    markAsUnsynced: vi.fn(),
    markAsSynced: vi.fn(),
    incrementSyncRetries: vi.fn(),
  },
}));

vi.mock('@/hooks/useSyncStatus', () => ({
  __esModule: true,
  default: () => ({
    data: { unsyncedCount: 0, lastSynced: new Date(), lastAttempt: null },
    refetch: vi.fn(),
  }),
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

import FirebaseAuth from './firebase-auth';
import * as firebaseUtils from '@/lib/firebase';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('FirebaseAuth sign-out', () => {
  it('preserves local data and resets currentUserId', async () => {
    const mockAuth: any = { currentUser: { uid: 'user123' } };
    const firebaseClient = await import('@/lib/firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    let authChange: any;
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
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
    vi.spyOn(firebaseUtils, 'stopSessionSync').mockImplementation(() => {});

    renderWithClient(<FirebaseAuth />);
    const signOutButton = await screen.findByRole('button', { name: /disable cloud sync/i });
    fireEvent.click(signOutButton);

    await waitFor(() => {
      expect(firebaseUtils.getCurrentUserId()).toBeNull();
      expect(cacheModule.SessionsCache.remove).not.toHaveBeenCalled();
      expect(offlineModule.offlineStorage.clear).not.toHaveBeenCalled();
      expect(firebaseUtils.stopSessionSync).toHaveBeenCalled();
    });
  });
});

describe('FirebaseAuth sign-in', () => {
  it('shows success toast when verification succeeds', async () => {
    const mockAuth: any = { currentUser: null };
    const firebaseClient = await import('@/lib/firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(mockAuth.currentUser);
      return () => {};
    });

    vi.spyOn(firebaseUtils, 'startAuthFlow').mockResolvedValue();
    vi.spyOn(firebaseUtils, 'refreshAuthState').mockResolvedValue();
    vi.spyOn(firebaseUtils, 'verifyDataPresence').mockResolvedValue(true);
    vi.spyOn(firebaseUtils, 'startSessionSync').mockResolvedValue();

    renderWithClient(<FirebaseAuth />);
    const signInButton = await screen.findByRole('button', { name: /enable cloud sync/i });
    fireEvent.click(signInButton);

    await waitFor(() => expect(firebaseUtils.verifyDataPresence).toHaveBeenCalled());
    expect(firebaseUtils.startSessionSync).toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Connected' }));
  });

  it('shows descriptive toast when verification fails', async () => {
    const mockAuth: any = { currentUser: null };
    const firebaseClient = await import('@/lib/firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(mockAuth.currentUser);
      return () => {};
    });

    vi.spyOn(firebaseUtils, 'startAuthFlow').mockResolvedValue();
    vi.spyOn(firebaseUtils, 'refreshAuthState').mockResolvedValue();
    vi.spyOn(firebaseUtils, 'verifyDataPresence').mockResolvedValue(false);
    vi.spyOn(firebaseUtils, 'startSessionSync').mockResolvedValue();

    renderWithClient(<FirebaseAuth />);
    const signInButton = await screen.findByRole('button', { name: /enable cloud sync/i });
    fireEvent.click(signInButton);

    await waitFor(() => expect(firebaseUtils.verifyDataPresence).toHaveBeenCalled());
    expect(firebaseUtils.startSessionSync).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Verification Failed' }),
    );
  });

  it('falls back to redirect when popup is blocked', async () => {
    const mockAuth: any = { currentUser: null };
    const firebaseClient = await import('@/lib/firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(mockAuth.currentUser);
      return () => {};
    });

    const popupError = { code: 'auth/popup-blocked' } as any;
    const startAuthFlowSpy = vi
      .spyOn(firebaseUtils, 'startAuthFlow')
      .mockRejectedValueOnce(popupError)
      .mockResolvedValueOnce();
    vi.spyOn(firebaseUtils, 'refreshAuthState').mockResolvedValue();
    vi.spyOn(firebaseUtils, 'verifyDataPresence').mockResolvedValue(true);
    vi.spyOn(firebaseUtils, 'startSessionSync').mockResolvedValue();

    renderWithClient(<FirebaseAuth />);
    const signInButton = await screen.findByRole('button', { name: /enable cloud sync/i });
    fireEvent.click(signInButton);

    await waitFor(() => expect(startAuthFlowSpy).toHaveBeenCalledTimes(2));
    expect(startAuthFlowSpy.mock.calls[1][0]).toBe(true);
    expect(sessionStorage.getItem('redirectAuth')).toBe('true');
    expect(firebaseUtils.startSessionSync).toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Connected' }));
  });
});

describe('FirebaseAuth redirect handling', () => {
  it('handles redirect result and shows success toast', async () => {
    const mockAuth: any = { currentUser: { uid: 'user123' } };
    const firebaseClient = await import('@/lib/firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(mockAuth.currentUser);
      return () => {};
    });
    (authModule.getRedirectResult as any).mockResolvedValue({});

    vi.spyOn(firebaseUtils, 'refreshAuthState').mockResolvedValue();
    vi.spyOn(firebaseUtils, 'verifyDataPresence').mockResolvedValue(true);
    vi.spyOn(firebaseUtils, 'startSessionSync').mockResolvedValue();

    renderWithClient(<FirebaseAuth />);

    await waitFor(() => expect(firebaseUtils.verifyDataPresence).toHaveBeenCalled());
    expect(firebaseUtils.startSessionSync).toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Connected' }));
  });

  it('shows failure toast when verification fails after redirect', async () => {
    const mockAuth: any = { currentUser: { uid: 'user123' } };
    const firebaseClient = await import('@/lib/firebaseClient');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (firebaseClient.getFirestoreDb as any).mockResolvedValue({});

    const authModule = await import('firebase/auth');
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(mockAuth.currentUser);
      return () => {};
    });
    (authModule.getRedirectResult as any).mockResolvedValue(null);
    sessionStorage.setItem('redirectAuth', 'true');

    vi.spyOn(firebaseUtils, 'refreshAuthState').mockResolvedValue();
    vi.spyOn(firebaseUtils, 'verifyDataPresence').mockResolvedValue(false);
    vi.spyOn(firebaseUtils, 'startSessionSync').mockResolvedValue();

    renderWithClient(<FirebaseAuth />);

    await waitFor(() => expect(firebaseUtils.verifyDataPresence).toHaveBeenCalled());
    expect(firebaseUtils.startSessionSync).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Verification Failed' }),
    );
  });
});
