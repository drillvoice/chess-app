import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

vi.mock('@/lib/firebaseClient', () => ({
  getFirebaseAuth: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  getRedirectResult: vi.fn(() => Promise.resolve(null)),
  signOut: vi.fn(),
}));

vi.mock('@/hooks/useSyncStatus', () => ({
  __esModule: true,
  useSyncStatus: vi.fn(() => ({
    data: {
      unsyncedCount: 0,
      lastSynced: new Date(),
      lastAttempt: null,
      state: 'synced',
      lastError: null,
    },
  })),
  SyncState: { Disabled: 'disabled', Pending: 'pending', Syncing: 'syncing', Synced: 'synced' },
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/lib/firebase', () => ({
  startAuthFlow: vi.fn(),
  refreshAuthState: vi.fn(),
  stopSessionSync: vi.fn(),
  forceUploadAllLocalSessionsToCloud: vi.fn(),
  initializeCloudSyncForCurrentUser: vi.fn().mockResolvedValue(null),
  acknowledgeAccountSwitch: vi.fn(),
  getPendingAccountSwitch: vi.fn(() => null),
}));

import FirebaseAuth from './firebase-auth';

function renderWithClient() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <FirebaseAuth />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FirebaseAuth', () => {
  it('shows Google sign-in action when user is not authenticated', async () => {
    const firebaseClient = await import('@/lib/firebaseClient');
    const authModule = await import('firebase/auth');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue({ currentUser: null });
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(null);
      return () => {};
    });

    renderWithClient();
    expect(await screen.findByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  it('starts sign-in flow when button is clicked', async () => {
    const firebaseClient = await import('@/lib/firebaseClient');
    const authModule = await import('firebase/auth');
    const firebaseUtils = await import('@/lib/firebase');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue({ currentUser: null });
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb(null);
      return () => {};
    });

    renderWithClient();
    fireEvent.click(await screen.findByRole('button', { name: /sign in with google/i }));

    await waitFor(() => expect(firebaseUtils.startAuthFlow).toHaveBeenCalled());
  });

  it('shows disable button when user is authenticated', async () => {
    const firebaseClient = await import('@/lib/firebaseClient');
    const authModule = await import('firebase/auth');
    (firebaseClient.getFirebaseAuth as any).mockResolvedValue({
      currentUser: { uid: 'user123', isAnonymous: false, email: 'test@example.com' },
    });
    (authModule.onAuthStateChanged as any).mockImplementation((_auth: any, cb: any) => {
      cb({ uid: 'user123', isAnonymous: false, email: 'test@example.com' });
      return () => {};
    });

    renderWithClient();
    expect(await screen.findByRole('button', { name: /disable cloud sync/i })).toBeInTheDocument();
    expect(await screen.findByText(/test@example.com/i)).toBeInTheDocument();
  });
});
