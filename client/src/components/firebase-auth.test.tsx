import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FirebaseAuth from './firebase-auth';

// Mock Firebase client
vi.mock('@/lib/firebaseClient', () => ({
  getFirebaseAuth: vi.fn(),
  getFirestoreDb: vi.fn(),
}));

// Mock Firebase utils
vi.mock('@/lib/firebase', () => ({
  ensureAuthentication: vi.fn(),
}));

// Mock Firebase auth
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderWithClient(ui: React.ReactElement) {
  return render(ui, { wrapper: createWrapper() });
}

describe('FirebaseAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    const firebaseClient = require('@/lib/firebaseClient');
    firebaseClient.getFirebaseAuth.mockResolvedValue({ currentUser: null });
    firebaseClient.getFirestoreDb.mockResolvedValue({});

    const authModule = require('firebase/auth');
    authModule.onAuthStateChanged.mockImplementation((_auth: any, cb: any) => {
      // Don't call callback immediately to simulate loading
      return () => {};
    });

    renderWithClient(<FirebaseAuth />);
    expect(screen.getByText('Initializing backup system...')).toBeInTheDocument();
  });

  it('shows backup active when user is authenticated', async () => {
    const mockUser = { uid: 'anonymous123', isAnonymous: true };
    const mockAuth = { currentUser: mockUser };
    
    const firebaseClient = require('@/lib/firebaseClient');
    firebaseClient.getFirebaseAuth.mockResolvedValue(mockAuth);
    firebaseClient.getFirestoreDb.mockResolvedValue({});

    const authModule = require('firebase/auth');
    authModule.onAuthStateChanged.mockImplementation((_auth: any, cb: any) => {
      cb(mockUser);
      return () => {};
    });

    const firebaseUtils = require('@/lib/firebase');
    firebaseUtils.ensureAuthentication.mockResolvedValue();

    renderWithClient(<FirebaseAuth />);
    
    await waitFor(() => {
      expect(screen.getByText('Cloud Backup Active')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Your training data is automatically backed up to the cloud for this device.')).toBeInTheDocument();
  });

  it('shows local storage only when no user is authenticated', async () => {
    const mockAuth = { currentUser: null };
    
    const firebaseClient = require('@/lib/firebaseClient');
    firebaseClient.getFirebaseAuth.mockResolvedValue(mockAuth);
    firebaseClient.getFirestoreDb.mockResolvedValue({});

    const authModule = require('firebase/auth');
    authModule.onAuthStateChanged.mockImplementation((_auth: any, cb: any) => {
      cb(null);
      return () => {};
    });

    const firebaseUtils = require('@/lib/firebase');
    firebaseUtils.ensureAuthentication.mockResolvedValue();

    renderWithClient(<FirebaseAuth />);
    
    await waitFor(() => {
      expect(screen.getByText('Local Storage Only')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Backup system is initializing...')).toBeInTheDocument();
  });

  it('handles Firebase initialization errors gracefully', async () => {
    const firebaseClient = require('@/lib/firebaseClient');
    firebaseClient.getFirebaseAuth.mockRejectedValue(new Error('Firebase init failed'));

    renderWithClient(<FirebaseAuth />);
    
    await waitFor(() => {
      expect(screen.getByText('Local Storage Only')).toBeInTheDocument();
    });
  });
});