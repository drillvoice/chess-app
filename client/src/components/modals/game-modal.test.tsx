import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { format } from 'date-fns';

import GameModal from './game-modal';
import { createSession } from '@/lib/firebase';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/firebase', () => ({
  createSession: vi.fn(),
  updateSession: vi.fn(),
}));

function renderWithClient(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('GameModal date selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses selected date when creating session', async () => {
    renderWithClient(<GameModal open={true} onOpenChange={() => {}} />);

    // satisfy required fields
    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    fireEvent.click(screen.getByRole('button', { name: 'Win' }));

    fireEvent.click(screen.getByRole('button', { name: format(new Date(), 'EEE d MMM') }));
    const newDate = '2024-05-15';
    const dateInput = await screen.findByLabelText('Select date');
    fireEvent.change(dateInput, { target: { value: newDate } });
    const localDate = new Date(2024, 4, 15);
    fireEvent.click(screen.getByRole('button', { name: format(localDate, 'EEE d MMM') }));

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(createSession).toHaveBeenCalled());
    const submitted = vi.mocked(createSession).mock.calls[0][0];
    expect(submitted.date).toEqual(localDate);
  });

  it('disables saving for future dates', async () => {
    renderWithClient(<GameModal open={true} onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    fireEvent.click(screen.getByRole('button', { name: 'Win' }));

    fireEvent.click(screen.getByRole('button', { name: format(new Date(), 'EEE d MMM') }));
    const dateInput = await screen.findByLabelText('Select date');
    fireEvent.change(dateInput, { target: { value: '2999-01-01' } });

    const saveButton = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(saveButton);
    expect(createSession).not.toHaveBeenCalled();
  });
});
