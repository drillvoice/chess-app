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
  getAllSessions: vi.fn().mockResolvedValue([
    {
      id: 1,
      type: 'game',
      platform: 'otb',
      opponentUsername: 'John Smith',
      date: new Date('2024-10-01'),
    },
    {
      id: 2,
      type: 'game',
      platform: 'otb',
      opponentUsername: 'Jane Doe',
      date: new Date('2024-10-02'),
    },
    {
      id: 3,
      type: 'game',
      platform: 'lichess',
      opponentUsername: 'lichessPlayer',
      date: new Date('2024-10-03'),
    },
  ]),
}));

function renderWithClient(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  // Pre-populate the cache with mock sessions for autocomplete
  queryClient.setQueryData(
    ['sessions'],
    [
      {
        id: 1,
        type: 'game',
        platform: 'otb',
        opponentUsername: 'John Smith',
        date: new Date('2024-10-01'),
      },
      {
        id: 2,
        type: 'game',
        platform: 'otb',
        opponentUsername: 'Jane Doe',
        date: new Date('2024-10-02'),
      },
      {
        id: 3,
        type: 'game',
        platform: 'lichess',
        opponentUsername: 'lichessPlayer',
        date: new Date('2024-10-03'),
      },
    ],
  );

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

describe('GameModal opponent name tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows opponent name field only when OTB platform is selected', async () => {
    renderWithClient(<GameModal open={true} onOpenChange={() => {}} />);

    // Opponent name field should not be visible initially
    expect(screen.queryByLabelText(/opponent name/i)).toBeNull();

    // Select OTB platform
    fireEvent.click(screen.getByRole('button', { name: 'Over the Board' }));

    // Opponent name field should now be visible
    await waitFor(() => {
      expect(screen.getByLabelText(/opponent name/i)).toBeTruthy();
    });

    // Select a different platform
    fireEvent.click(screen.getByRole('button', { name: 'Lichess' }));

    // Opponent name field should be hidden again
    await waitFor(() => {
      expect(screen.queryByLabelText(/opponent name/i)).toBeNull();
    });
  });

  it('includes opponent name when creating OTB game session', async () => {
    renderWithClient(<GameModal open={true} onOpenChange={() => {}} />);

    // Fill in required fields
    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    fireEvent.click(screen.getByRole('button', { name: 'Win' }));
    fireEvent.click(screen.getByRole('button', { name: 'Over the Board' }));

    // Enter opponent name
    const opponentInput = await screen.findByLabelText(/opponent name/i);
    fireEvent.change(opponentInput, { target: { value: 'Alex Johnson' } });

    // Save the session
    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    await waitFor(() => expect(createSession).toHaveBeenCalled());
    const submitted = vi.mocked(createSession).mock.calls[0][0];
    expect(submitted.opponentUsername).toBe('Alex Johnson');
    expect(submitted.platform).toBe('otb');
  });

  it('clears opponent name when switching away from OTB platform', async () => {
    renderWithClient(<GameModal open={true} onOpenChange={() => {}} />);

    // Select OTB and enter opponent name
    fireEvent.click(screen.getByRole('button', { name: 'Over the Board' }));
    const opponentInput = await screen.findByLabelText(/opponent name/i);
    fireEvent.change(opponentInput, { target: { value: 'Test Opponent' } });

    // Verify the value is set
    expect((opponentInput as HTMLInputElement).value).toBe('Test Opponent');

    // Switch to a different platform
    fireEvent.click(screen.getByRole('button', { name: 'Lichess' }));

    // Switch back to OTB
    fireEvent.click(screen.getByRole('button', { name: 'Over the Board' }));

    // Opponent name should be cleared
    const newOpponentInput = await screen.findByLabelText(/opponent name/i);
    expect((newOpponentInput as HTMLInputElement).value).toBe('');
  });

  it('provides autocomplete suggestions for opponent names', async () => {
    renderWithClient(<GameModal open={true} onOpenChange={() => {}} />);

    // Select OTB platform
    fireEvent.click(screen.getByRole('button', { name: 'Over the Board' }));

    // Wait for opponent name field to appear
    const opponentInput = await screen.findByLabelText(/opponent name/i);

    // Check that the datalist exists with previous opponent names
    const datalist = document.getElementById('opponent-names');
    expect(datalist).toBeTruthy();

    // Check that the datalist contains the mocked opponent names
    const options = datalist?.querySelectorAll('option');
    expect(options).toHaveLength(3); // John Smith, Jane Doe, lichessPlayer

    const optionValues = Array.from(options || []).map((opt) => opt.value);
    expect(optionValues).toContain('John Smith');
    expect(optionValues).toContain('Jane Doe');
    expect(optionValues).toContain('lichessPlayer');
  });

  it('allows optional opponent name for OTB games', async () => {
    renderWithClient(<GameModal open={true} onOpenChange={() => {}} />);

    // Fill in required fields
    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    fireEvent.click(screen.getByRole('button', { name: 'Win' }));
    fireEvent.click(screen.getByRole('button', { name: 'Over the Board' }));

    // Don't enter opponent name - leave it empty

    // Save the session
    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    await waitFor(() => expect(createSession).toHaveBeenCalled());
    const submitted = vi.mocked(createSession).mock.calls[0][0];
    expect(submitted.platform).toBe('otb');
    // Opponent name should be empty or undefined
    expect(submitted.opponentUsername).toBeFalsy();
  });
});
