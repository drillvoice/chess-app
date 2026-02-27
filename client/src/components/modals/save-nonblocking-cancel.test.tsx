import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GameModal from './game-modal';
import GoalModal from './goal-modal';
import StudyModal from './study-modal';
import TacticsModal from './tactics-modal';
import { createSession } from '@/lib/firebase';

const toastMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/lib/firebase', () => ({
  createSession: vi.fn(),
  updateSession: vi.fn(),
  getAllSessions: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/components/ui/tag-manager', () => ({
  TagManager: () => <div data-testid="tag-manager" />,
}));

function createQueryClientWithHangingCancels(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  vi.spyOn(queryClient, 'cancelQueries').mockImplementation(
    () => new Promise<unknown>(() => {}),
  );

  return queryClient;
}

function renderWithClient(ui: React.ReactNode, queryClient: QueryClient) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('modal saves are not blocked by in-flight query cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastMock.mockReset();
    vi.mocked(createSession).mockResolvedValue({ id: 1 } as any);
  });

  it('allows tactics save to proceed when cancelQueries never resolves', async () => {
    const queryClient = createQueryClientWithHangingCancels();
    renderWithClient(<TacticsModal open={true} onOpenChange={() => {}} />, queryClient);

    fireEvent.click(screen.getByRole('button', { name: '5m' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });
  });

  it('allows study save to proceed when cancelQueries never resolves', async () => {
    const queryClient = createQueryClientWithHangingCancels();
    renderWithClient(<StudyModal open={true} onOpenChange={() => {}} />, queryClient);

    fireEvent.change(screen.getByLabelText('Duration (minutes)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });
  });

  it('allows goal save to proceed when cancelQueries never resolves', async () => {
    const queryClient = createQueryClientWithHangingCancels();
    renderWithClient(<GoalModal open={true} onOpenChange={() => {}} />, queryClient);

    fireEvent.change(screen.getByLabelText('Goal title'), {
      target: { value: 'Practice endgame fundamentals' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set goal' }));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });
  });

  it('allows game save to proceed when cancelQueries never resolves', async () => {
    const queryClient = createQueryClientWithHangingCancels();
    renderWithClient(<GameModal open={true} onOpenChange={() => {}} />, queryClient);

    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    fireEvent.click(screen.getByRole('button', { name: 'Win' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });
  });
});
