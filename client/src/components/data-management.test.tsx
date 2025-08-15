import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('./firebase-auth', () => ({
  default: () => <div />,
}));

vi.mock('@/lib/cache-utils', () => ({
  SessionsCache: { remove: vi.fn() },
}));

vi.mock('@/lib/offline-storage', () => ({
  offlineStorage: { clear: vi.fn() },
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

import DataManagement from './data-management';

describe('DataManagement clear local data', () => {
  it('clears local caches when invoked', async () => {
    const queryClient = new QueryClient();
    const cacheModule = await import('@/lib/cache-utils');
    const offlineModule = await import('@/lib/offline-storage');
    render(
      <QueryClientProvider client={queryClient}>
        <DataManagement />
      </QueryClientProvider>,
    );
    const clearButton = await screen.findByRole('button', { name: /clear local data/i });
    fireEvent.click(clearButton);
    await waitFor(() => {
      expect(cacheModule.SessionsCache.remove).toHaveBeenCalled();
      expect(offlineModule.offlineStorage.clear).toHaveBeenCalled();
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cleared' }));
    });
  });
});
