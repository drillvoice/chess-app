import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Home from './home';

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

    return { data: queryKey[0] === 'pending-review' ? [] : undefined, isLoading: false };
  }),
  useMutation: vi.fn(() => ({ mutate: vi.fn() })),
  useQueryClient: vi.fn(() => ({
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  })),
}));

describe('Home cards', () => {
  it('does not render an OTB Board card on home', () => {
    render(<Home />);
    expect(screen.queryByRole('link', { name: /OTB Board/i })).not.toBeInTheDocument();
  });
});
