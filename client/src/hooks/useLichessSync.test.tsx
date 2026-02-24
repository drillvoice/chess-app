import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockGetUserSettings = vi.fn();
const mockStartLichessSync = vi.fn();
const mockGetFirebaseAuth = vi.fn();
const mockOnAuthStateChanged = vi.fn();

vi.mock('@/lib/firebase', () => ({
  getUserSettings: mockGetUserSettings,
}));

vi.mock('@/lib/lichess-sync', () => ({
  startLichessSync: mockStartLichessSync,
}));

vi.mock('@/lib/firebaseClient', () => ({
  getFirebaseAuth: mockGetFirebaseAuth,
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
}));

describe('useLichessSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserSettings.mockResolvedValue({ lichessUsername: 'LocalUser' });
    mockGetFirebaseAuth.mockResolvedValue({ currentUser: null });
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, cb: (user: unknown) => void) => {
      cb(null);
      return vi.fn();
    });
    mockStartLichessSync.mockReturnValue(vi.fn());
  });

  it('starts sync from locally cached username without cloud auth', async () => {
    const { useLichessSync } = await import('./useLichessSync');

    renderHook(() => useLichessSync());

    await waitFor(() => {
      expect(mockStartLichessSync).toHaveBeenCalledWith('localuser');
    });
  });
});
