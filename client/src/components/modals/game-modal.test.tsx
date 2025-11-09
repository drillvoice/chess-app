import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

  it('shows opponent suggestions only after typing and only for OTB names', async () => {
    renderWithClient(<GameModal open={true} onOpenChange={() => {}} />);

    // Select OTB platform
    fireEvent.click(screen.getByRole('button', { name: 'Over the Board' }));

    // Wait for opponent name field to appear
    const opponentInput = await screen.findByLabelText(/opponent name/i);

    // Should not show suggestions until a user types
    expect(document.getElementById('opponent-name-suggestions')).toBeNull();

    // Type a partial name to trigger suggestions
    fireEvent.focus(opponentInput);
    fireEvent.change(opponentInput, { target: { value: 'J' } });

    await waitFor(() => {
      expect(document.getElementById('opponent-name-suggestions')).toBeTruthy();
    });
    const listbox = document.getElementById('opponent-name-suggestions') as HTMLElement;
    const options = within(listbox).getAllByRole('option', { hidden: true });
    const optionValues = options.map((option) => option.textContent?.trim());

    expect(optionValues).toHaveLength(2); // John Smith, Jane Doe (not lichessPlayer)
    expect(optionValues).toEqual(expect.arrayContaining(['John Smith', 'Jane Doe']));
    expect(optionValues).not.toContain('lichessPlayer');
  });

  it('renders a chip when selecting an opponent suggestion', async () => {
    renderWithClient(<GameModal open={true} onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Over the Board' }));

    const opponentInput = await screen.findByLabelText(/opponent name/i);
    fireEvent.focus(opponentInput);
    fireEvent.change(opponentInput, { target: { value: 'John Smith' } });
    fireEvent.blur(opponentInput);

    await waitFor(() => {
      expect(screen.getByTestId('opponent-name-chip').textContent).toContain('John Smith');
    });
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
