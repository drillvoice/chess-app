import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DailyGoalsMVP from './daily-goals-mvp';

// Mock the hooks
vi.mock('@/hooks/use-daily-goals', () => ({
  useDailyGoals: vi.fn(),
}));

vi.mock('@/hooks/use-daily-goals-settings', () => ({
  useDailyGoalsSettings: vi.fn(),
}));

vi.mock('@/components/modals/goal-settings-modal', () => ({
  GoalSettingsModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => 
    isOpen ? <div data-testid="goal-settings-modal">Settings Modal</div> : null,
}));

describe('DailyGoalsMVP - Progress Visualization', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('Progress Bar Display', () => {
    it('should display progress bars for active goals', async () => {
      // Mock settings with active goals
      const mockSettings = {
        tacticsMinutes: 30,
        gamesCount: 2,
        studyMinutes: 15,
        isCustomized: true,
        lastModified: new Date(),
      };

      // Mock progress data
      const mockProgress = {
        tactics: { current: 20, target: 30, percentage: 67, isComplete: false },
        games: { current: 1, target: 2, percentage: 50, isComplete: false },
        study: { current: 10, target: 15, percentage: 67, isComplete: false },
        hasAnyProgress: true,
        totalCompleted: 0,
        totalGoals: 3,
      };

      const mockUseDailyGoals = vi.mocked(await import('@/hooks/use-daily-goals')).useDailyGoals;
      const mockUseDailyGoalsSettings = vi.mocked(await import('@/hooks/use-daily-goals-settings')).useDailyGoalsSettings;

      mockUseDailyGoals.mockReturnValue({
        checklist: { tactics: false, game: false, study: false, date: new Date().toISOString() },
        toggleItem: vi.fn(),
        completedCount: 0,
        allComplete: false,
        todaySessions: [],
      });

      mockUseDailyGoalsSettings.mockReturnValue({
        settings: mockSettings,
        isCustomized: true,
        progress: mockProgress,
        isProgressLoading: false,
        isLoading: false,
        error: null,
        formData: { tacticsMinutes: 30, gamesCount: 2, studyMinutes: 15 },
        setFormData: vi.fn(),
        resetForm: vi.fn(),
        validation: { tacticsMinutes: { isValid: true }, gamesCount: { isValid: true }, studyMinutes: { isValid: true }, isValid: true },
        hasAnyActiveGoals: true,
        saveSettings: vi.fn(),
        enableCustomGoals: vi.fn(),
        disableCustomGoals: vi.fn(),
        isSaving: false,
      });

      render(<DailyGoalsMVP />, { wrapper });

      await waitFor(() => {
        expect(screen.getByText("Today's training goals")).toBeTruthy();
      });

      // Check that progress bars are displayed
      expect(screen.getByText('Practice tactics for 30 minutes')).toBeTruthy();
      expect(screen.getByText('Play 2 games')).toBeTruthy();
      expect(screen.getByText('Study for 15 minutes')).toBeTruthy();

      // Check progress values are shown
      expect(screen.getByText('20/30')).toBeTruthy();
      expect(screen.getByText('1/2')).toBeTruthy();
      expect(screen.getByText('10/15')).toBeTruthy();

      // Check progress bars exist (they should have role="progressbar")
      const progressBars = screen.getAllByRole('progressbar');
      expect(progressBars).toHaveLength(3);
    });
  });
});
