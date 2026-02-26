import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChessFreeDayModal from './chess-free-day-modal';
import { getChessFreeDayWindow, isDateKeyWithinChessFreeDayWindow } from '@/lib/chess-free-day';
import { updateUserSettings } from '@/lib/firebase';

const toastMock = vi.fn();

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/lib/firebase', () => ({
  updateUserSettings: vi.fn(),
}));
vi.mock('@/lib/chess-free-day', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/chess-free-day')>('@/lib/chess-free-day');
  return {
    ...actual,
    isDateKeyWithinChessFreeDayWindow: vi.fn(actual.isDateKeyWithinChessFreeDayWindow),
  };
});

function renderWithClient(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  };
}

describe('ChessFreeDayModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders date input with min/max window constraints', () => {
    renderWithClient(<ChessFreeDayModal open={true} onOpenChange={() => {}} />);
    const dateInput = screen.getByLabelText('Rest day');
    const { minDateKey, maxDateKey } = getChessFreeDayWindow();

    expect(dateInput.getAttribute('min')).toBe(minDateKey);
    expect(dateInput.getAttribute('max')).toBe(maxDateKey);
  });

  it('saves CFD date and invalidates user-settings query', async () => {
    vi.mocked(updateUserSettings).mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const { queryClient } = renderWithClient(
      <ChessFreeDayModal open={true} onOpenChange={onOpenChange} />,
    );
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { minDateKey } = getChessFreeDayWindow();

    fireEvent.change(screen.getByLabelText('Rest day'), { target: { value: minDateKey } });
    fireEvent.click(screen.getByRole('button', { name: 'Save CFD' }));

    await waitFor(() =>
      expect(updateUserSettings).toHaveBeenCalledWith({ chessFreeDayDate: minDateKey }),
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user-settings'] }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('blocks saving when selected date is outside the valid window', async () => {
    vi.mocked(updateUserSettings).mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    vi.mocked(isDateKeyWithinChessFreeDayWindow).mockReturnValue(false);
    renderWithClient(<ChessFreeDayModal open={true} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save CFD' }));

    await waitFor(() => expect(updateUserSettings).not.toHaveBeenCalled());
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Invalid date',
        variant: 'destructive',
      }),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
