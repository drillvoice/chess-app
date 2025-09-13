import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FirebaseAuth from './firebase-auth';
import { useToast } from '@/hooks/use-toast';

// Mock the hooks and Firebase modules
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(),
}));

vi.mock('@/lib/firebaseClient', () => ({
  getFirebaseAuth: vi.fn(),
}));

vi.mock('@/lib/firebase/core', () => ({
  ensureAuthentication: vi.fn(),
}));

vi.mock('@/lib/firebase/firestore-backup', () => ({
  backupAllSessionsToCloud: vi.fn(),
  getBackupStatus: vi.fn(),
  isBackupNeeded: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}));

describe('FirebaseAuth', () => {
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useToast as any).mockReturnValue({ toast: mockToast });
  });

  it('renders loading state initially', () => {
    render(<FirebaseAuth />);
    
    expect(screen.getByText('Initializing backup system...')).toBeInTheDocument();
    expect(screen.getByRole('generic')).toHaveClass('animate-pulse');
  });

  it('shows backup active state when authenticated', async () => {
    const mockAuth = { currentUser: { uid: 'test-uid' } };
    const mockUnsubscribe = vi.fn();
    const mockOnAuthStateChanged = vi.fn((auth, callback) => {
      // Simulate authenticated user
      callback({ uid: 'test-uid' });
      return mockUnsubscribe;
    });

    const { getFirebaseAuth } = await import('@/lib/firebaseClient');
    const { ensureAuthentication } = await import('@/lib/firebase/core');
    const { getBackupStatus } = await import('@/lib/firebase/firestore-backup');
    
    (getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (ensureAuthentication as any).mockResolvedValue(undefined);
    (getBackupStatus as any).mockResolvedValue({
      lastBackup: null,
      sessionCount: 0,
      needsBackup: true,
    });

    // Mock dynamic import
    vi.doMock('firebase/auth', () => ({
      onAuthStateChanged: mockOnAuthStateChanged,
    }));

    render(<FirebaseAuth />);

    await waitFor(() => {
      expect(screen.getByText('Cloud Backup Active')).toBeInTheDocument();
    });

    expect(screen.getByText(/automatically backed up weekly/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /backup now/i })).toBeInTheDocument();
  });

  it('shows initialization state when not authenticated', async () => {
    const mockAuth = { currentUser: null };
    const mockUnsubscribe = vi.fn();
    const mockOnAuthStateChanged = vi.fn((auth, callback) => {
      // Simulate no authenticated user
      callback(null);
      return mockUnsubscribe;
    });

    const { getFirebaseAuth } = await import('@/lib/firebaseClient');
    const { ensureAuthentication } = await import('@/lib/firebase/core');
    
    (getFirebaseAuth as any).mockResolvedValue(mockAuth);
    (ensureAuthentication as any).mockResolvedValue(undefined);

    // Mock dynamic import
    vi.doMock('firebase/auth', () => ({
      onAuthStateChanged: mockOnAuthStateChanged,
    }));

    render(<FirebaseAuth />);

    await waitFor(() => {
      expect(screen.getByText('Backup Initializing')).toBeInTheDocument();
    });

    expect(screen.getByText('Backup system is starting up...')).toBeInTheDocument();
  });
});