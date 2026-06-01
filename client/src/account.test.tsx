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

vi.mock('@/components/firebase-auth', () => ({
  default: () => <div>Cloud Sync Content</div>,
}));

vi.mock('@/components/tag-configuration', () => ({
  default: () => <div>Tag Configuration Content</div>,
  TagConfigurationContent: () => <div>Tag Configuration Content</div>,
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
  QueryClient: class {
    setQueryData = vi.fn();
    getQueryData = vi.fn();
    invalidateQueries = vi.fn();
    cancelQueries = vi.fn();
  },
  QueryClientProvider: ({ children }: { children: unknown }) => children,
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
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
  });

  it('shows OTB tab in navigation', () => {
    render(<Navigation />);
    expect(screen.getByRole('button', { name: /otb/i })).toBeInTheDocument();
  });

  it('keeps nav buttons accessible on narrow screens while showing compact labels', () => {
    render(<Navigation />);

    const activityButton = screen.getByRole('button', { name: /activity/i });
    expect(activityButton).toHaveAttribute('aria-label', 'Activity');
    expect(activityButton).toHaveTextContent('Activity');
    expect(screen.getByRole('img', { name: /pawn star chess log/i }).closest('a')).toHaveClass(
      'hidden',
      'sm:block',
    );
  });
  it('renders data management only on account page', async () => {
    render(<Activity />);
    expect(screen.queryByText(/data management/i)).not.toBeInTheDocument();
    cleanup();
    render(<Account />);
    fireEvent.click(screen.getByRole('button', { name: /developer options/i }));
    expect(await screen.findByRole('button', { name: /^data management$/i })).toBeInTheDocument();
  });
});

describe('account accordion behavior', () => {
  afterEach(() => cleanup());

  it('allows multiple sections open and independent collapse', async () => {
    render(<Account />);

    const lichessTrigger = screen.getByRole('button', {
      name: /lichess integration/i,
    });
    const cloudTrigger = screen.getByRole('button', {
      name: /cloud sync/i,
    });
    const tagConfigTrigger = screen.getByRole('button', {
      name: /tag configuration/i,
    });
    const developerOptionsTrigger = screen.getByRole('button', {
      name: /developer options/i,
    });

    // Initially, no section content is visible
    expect(screen.queryByText('Lichess Settings Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Tag Configuration Content')).not.toBeInTheDocument();

    // Open first section
    fireEvent.click(lichessTrigger);
    expect(await screen.findByText('Lichess Settings Content')).toBeVisible();

    // Open second section; first remains open
    fireEvent.click(cloudTrigger);
    expect(await screen.findByText('Cloud Sync Content')).toBeVisible();
    expect(screen.getByText('Lichess Settings Content')).toBeVisible();

    fireEvent.click(tagConfigTrigger);
    expect(await screen.findByText('Tag Configuration Content')).toBeVisible();

    fireEvent.click(developerOptionsTrigger);
    const nestedDataManagement = screen.getByRole('button', { name: /data management/i });
    fireEvent.click(nestedDataManagement);
    expect(await screen.findByText('Data Management Content')).toBeVisible();

    // Collapse first section; second stays open
    fireEvent.click(lichessTrigger);
    expect(screen.queryByText('Lichess Settings Content')).not.toBeInTheDocument();
    expect(screen.getByText('Data Management Content')).toBeVisible();
  });

  it('renders top-level settings sections in the correct order', () => {
    render(<Account />);
    const labels = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.trim() ?? '')
      .filter((label) =>
        ['Lichess integration', 'Cloud sync', 'Tag configuration', 'Developer options'].includes(
          label,
        ),
      );

    expect(labels).toEqual([
      'Lichess integration',
      'Cloud sync',
      'Tag configuration',
      'Developer options',
    ]);
  });

  it('shows data management, enhanced backup, and debug tools only under developer options', () => {
    render(<Account />);

    expect(screen.queryByRole('button', { name: /^data management$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /developer options/i }));

    expect(screen.getByRole('button', { name: /^data management$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enhanced backup/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /database debug tools/i })).toBeInTheDocument();
  });
});
