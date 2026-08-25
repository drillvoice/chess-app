import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { TrainingSession } from '@shared/schema';
import Home from './home';

const pendingReview = vi.hoisted(() => ({ current: [] as TrainingSession[] }));
// Mutations are registered in render order: the per-row archive, then archive-all.
const mutateFns = vi.hoisted(() => [] as Array<ReturnType<typeof vi.fn>>);

function pendingGame(id: number): TrainingSession {
  return {
    id,
    type: 'game',
    date: new Date(2026, 0, id),
    gameResult: 'win',
    playerColor: 'white',
    platform: 'lichess',
    needsReview: true,
  } as unknown as TrainingSession;
}

vi.mock('@/components/lazy-components', () => ({
  TacticsModal: () => null,
  GameModal: () => null,
  StudyModal: () => null,
  GoalModal: () => null,
}));

vi.mock('@/components/daily-goals-mvp', () => ({
  default: () => null,
}));

vi.mock('@/components/install-prompt', () => ({
  default: () => null,
}));

vi.mock('@/components/cloud-backup-reminder', () => ({
  default: () => null,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(({ queryKey }) => {
    if (queryKey[0] === 'statistics') {
      return {
        data: {
          totalHours: 0,
          totalSessions: 0,
          tacticsRating: 0,
          winRate: 0,
          todayTotalTime: 0,
          todaySessions: 0,
        },
        isLoading: false,
      };
    }

    return {
      data: queryKey[0] === 'pending-review' ? pendingReview.current : undefined,
      isLoading: false,
    };
  }),
  useMutation: vi.fn(() => {
    const mutate = vi.fn();
    mutateFns.push(mutate);
    return { mutate, isPending: false };
  }),
  useQueryClient: vi.fn(() => ({
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  })),
}));

describe('Home cards', () => {
  beforeEach(() => {
    pendingReview.current = [];
    mutateFns.length = 0;
  });

  it('does not render an OTB Board card on home', () => {
    render(<Home />);
    expect(screen.queryByRole('link', { name: /OTB Board/i })).not.toBeInTheDocument();
  });

  it('offers no bulk archive for a handful of pending games', () => {
    pendingReview.current = [1, 2, 3].map(pendingGame);
    render(<Home />);

    expect(screen.queryByRole('button', { name: /Archive all/i })).not.toBeInTheDocument();
  });

  it('archives the whole queue in one click once it grows past a handful', () => {
    pendingReview.current = [1, 2, 3, 4, 5].map(pendingGame);
    render(<Home />);

    // The card is rendered twice, once for each breakpoint's layout slot.
    const buttons = screen.getAllByRole('button', { name: /Archive all \(5\)/i });
    fireEvent.click(buttons[0]);

    const everyCall = mutateFns.flatMap((fn) => fn.mock.calls);
    expect(everyCall).toContainEqual([[1, 2, 3, 4, 5]]);
  });
});
