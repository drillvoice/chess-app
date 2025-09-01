import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('@/components/lazy-components', () => ({
  WeeklyActivityChart: () => null,
  DataManagement: () => <div>Data Management</div>,
}));

vi.mock('@/components/data-management', () => ({
  default: () => <div>Data Management</div>,
  DataManagementContent: () => <div>Data Management Content</div>,
}));

vi.mock('@/components/lichess-settings', () => ({
  default: () => <div>Lichess Settings</div>,
  LichessSettingsContent: () => <div>Lichess Settings Content</div>,
}));

vi.mock('@/lib/firebase', () => ({
  getStatistics: async () => ({ totalHours: 0, totalSessions: 0, tacticsRating: 0, winRate: 0 }),
  getAllSessions: async () => [],
}));

vi.mock('@/lib/offline-storage', () => ({
  offlineStorage: {
    getSessions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: [], isLoading: false })),
  useMutation: vi.fn(() => ({ mutate: vi.fn() })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

import Navigation from '@/components/layout/navigation';
import Activity from '@/pages/activity';
import Account from '@/pages/account';

describe('data management location', () => {
  afterEach(() => cleanup());

  it('shows account tab in navigation', () => {
    render(<Navigation />);
    expect(screen.getByRole('button', { name: /account/i })).toBeInTheDocument();
  });

  it('shows info tab in navigation', () => {
    render(<Navigation />);
    expect(screen.getByRole('button', { name: /info/i })).toBeInTheDocument();
  });

  it('renders data management only on account page', async () => {
    render(<Activity />);
    expect(screen.queryByText(/data management/i)).not.toBeInTheDocument();
    cleanup();
    render(<Account />);
    expect(await screen.findByText(/data management/i)).toBeInTheDocument();
  });
});

describe('account accordion behavior', () => {
  afterEach(() => cleanup());

  it('allows multiple sections open and independent collapse', async () => {
    render(<Account />);

    const lichessTrigger = screen.getByRole('button', {
      name: /lichess integration/i,
    });
    const dataTrigger = screen.getByRole('button', {
      name: /data management/i,
    });

    // Initially, no section content is visible
    expect(
      screen.queryByText('Lichess Settings Content'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Data Management Content'),
    ).not.toBeInTheDocument();

    // Open first section
    fireEvent.click(lichessTrigger);
    expect(
      await screen.findByText('Lichess Settings Content'),
    ).toBeVisible();

    // Open second section; first remains open
    fireEvent.click(dataTrigger);
    expect(
      await screen.findByText('Data Management Content'),
    ).toBeVisible();
    expect(screen.getByText('Lichess Settings Content')).toBeVisible();

    // Collapse first section; second stays open
    fireEvent.click(lichessTrigger);
    expect(
      screen.queryByText('Lichess Settings Content'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Data Management Content')).toBeVisible();

    // Collapse second section
    fireEvent.click(dataTrigger);
    expect(
      screen.queryByText('Data Management Content'),
    ).not.toBeInTheDocument();
  });
});
