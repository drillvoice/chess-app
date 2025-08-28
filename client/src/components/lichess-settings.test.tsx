import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/firebase', () => ({
  getUserSettings: vi.fn().mockResolvedValue({ lichessUsername: 'old' }),
  updateUserSettings: vi.fn().mockResolvedValue(undefined),
  SettingsError: class extends Error {},
}));

vi.mock('@/lib/lichess-sync', () => ({
  restartLichessSync: vi.fn(),
}));

import { LichessSettingsContent } from './lichess-settings';

describe('LichessSettings', () => {
  it('triggers save when Enter is pressed', async () => {
    const firebaseModule = await import('@/lib/firebase');
    render(<LichessSettingsContent />);

    const input = await screen.findByPlaceholderText(/enter your lichess username/i);
    fireEvent.change(input, { target: { value: 'new' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

    await waitFor(() => {
      expect(firebaseModule.updateUserSettings).toHaveBeenCalledWith({ lichessUsername: 'new' });
    });
  });
});
