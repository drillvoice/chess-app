import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDailyGoalsSettings } from './use-daily-goals-settings';
import { DailyGoalSettings } from '@shared/schema';

// Mock Firebase functions
vi.mock('@/lib/firebase/firestore', () => ({
  getDailyGoalSettings: vi.fn(),
  setDailyGoalSettings: vi.fn(),
  getTodaySessions: vi.fn(),
}));

// Mock toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock utils
vi.mock('@/lib/utils', () => ({
  validateTacticsMinutes: vi.fn(() => ({ isValid: true })),
  validateGamesCount: vi.fn(() => ({ isValid: true })),
  validateStudyMinutes: vi.fn(() => ({ isValid: true })),
  hasActiveGoals: vi.fn(() => true),
  calculateDailyGoalsProgress: vi.fn(),
}));

const mockFirebase = await import('@/lib/firebase/firestore');
const mockUtils = await import('@/lib/utils');

describe('useDailyGoalsSettings - Progress Calculation Engine', () => {
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
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('Progress Calculation Integration', () => {
    it('should calculate progress when settings and sessions exist', async () => {
      // Mock settings
      const mockSettings: DailyGoalSettings = {
        tacticsMinutes: 30,
        gamesCount: 2,
        studyMinutes: 15,
        isCustomized: true,
        lastModified: new Date(),
      };

      // Mock today's sessions
      const mockTodaySessions = [
        {
          id: 1,
          type: 'tactics',
          duration: 20,
          date: new Date(),
        },
        {
          id: 2,
          type: 'game',
          date: new Date(),
        },
        {
          id: 3,
          type: 'study',
          duration: 10,
          date: new Date(),
        },
      ];

      // Mock progress calculation
      const mockProgress = {
        tactics: { current: 20, target: 30, percentage: 67, isComplete: false },
        games: { current: 1, target: 2, percentage: 50, isComplete: false },
        study: { current: 10, target: 15, percentage: 67, isComplete: false },
        hasAnyProgress: true,
        totalCompleted: 0,
        totalGoals: 3,
      };

      vi.mocked(mockFirebase.getDailyGoalSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockFirebase.getTodaySessions).mockResolvedValue(mockTodaySessions);
      vi.mocked(mockUtils.calculateDailyGoalsProgress).mockReturnValue(mockProgress);

      const { result } = renderHook(() => useDailyGoalsSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.progress).toEqual(mockProgress);
      expect(result.current.isProgressLoading).toBe(false);
      expect(mockUtils.calculateDailyGoalsProgress).toHaveBeenCalledWith(mockSettings, mockTodaySessions);
    });

    it('should handle empty sessions gracefully', async () => {
      const mockSettings: DailyGoalSettings = {
        tacticsMinutes: 30,
        gamesCount: 2,
        studyMinutes: 15,
        isCustomized: true,
        lastModified: new Date(),
      };

      const mockProgress = {
        tactics: { current: 0, target: 30, percentage: 0, isComplete: false },
        games: { current: 0, target: 2, percentage: 0, isComplete: false },
        study: { current: 0, target: 15, percentage: 0, isComplete: false },
        hasAnyProgress: false,
        totalCompleted: 0,
        totalGoals: 3,
      };

      vi.mocked(mockFirebase.getDailyGoalSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockFirebase.getTodaySessions).mockResolvedValue([]);
      vi.mocked(mockUtils.calculateDailyGoalsProgress).mockReturnValue(mockProgress);

      const { result } = renderHook(() => useDailyGoalsSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.progress).toEqual(mockProgress);
      expect(result.current.progress.hasAnyProgress).toBe(false);
    });

    it('should handle null settings gracefully', async () => {
      const mockProgress = {
        tactics: { current: 0, target: 0, percentage: 0, isComplete: false },
        games: { current: 0, target: 0, percentage: 0, isComplete: false },
        study: { current: 0, target: 0, percentage: 0, isComplete: false },
        hasAnyProgress: false,
        totalCompleted: 0,
        totalGoals: 0,
      };

      vi.mocked(mockFirebase.getDailyGoalSettings).mockResolvedValue(null);
      vi.mocked(mockFirebase.getTodaySessions).mockResolvedValue([]);
      vi.mocked(mockUtils.calculateDailyGoalsProgress).mockReturnValue(mockProgress);

      const { result } = renderHook(() => useDailyGoalsSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.progress).toEqual(mockProgress);
      expect(mockUtils.calculateDailyGoalsProgress).toHaveBeenCalledWith(null, []);
    });

    it('should show completed goals correctly', async () => {
      const mockSettings: DailyGoalSettings = {
        tacticsMinutes: 20,
        gamesCount: 1,
        studyMinutes: 10,
        isCustomized: true,
        lastModified: new Date(),
      };

      const mockTodaySessions = [
        {
          id: 1,
          type: 'tactics',
          duration: 25, // Exceeds target
          date: new Date(),
        },
        {
          id: 2,
          type: 'game',
          date: new Date(),
        },
        {
          id: 3,
          type: 'study',
          duration: 15, // Exceeds target
          date: new Date(),
        },
      ];

      const mockProgress = {
        tactics: { current: 25, target: 20, percentage: 100, isComplete: true },
        games: { current: 1, target: 1, percentage: 100, isComplete: true },
        study: { current: 15, target: 10, percentage: 100, isComplete: true },
        hasAnyProgress: true,
        totalCompleted: 3,
        totalGoals: 3,
      };

      vi.mocked(mockFirebase.getDailyGoalSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockFirebase.getTodaySessions).mockResolvedValue(mockTodaySessions);
      vi.mocked(mockUtils.calculateDailyGoalsProgress).mockReturnValue(mockProgress);

      const { result } = renderHook(() => useDailyGoalsSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.progress.totalCompleted).toBe(3);
      expect(result.current.progress.totalGoals).toBe(3);
      expect(result.current.progress.tactics.isComplete).toBe(true);
      expect(result.current.progress.games.isComplete).toBe(true);
      expect(result.current.progress.study.isComplete).toBe(true);
    });

    it('should handle loading states correctly', async () => {
      vi.mocked(mockFirebase.getDailyGoalSettings).mockImplementation(() => new Promise(() => {}));
      vi.mocked(mockFirebase.getTodaySessions).mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useDailyGoalsSettings(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isProgressLoading).toBe(true);
    });

    it('should refetch progress when sessions change', async () => {
      const mockSettings: DailyGoalSettings = {
        tacticsMinutes: 30,
        gamesCount: 2,
        studyMinutes: 15,
        isCustomized: true,
        lastModified: new Date(),
      };

      vi.mocked(mockFirebase.getDailyGoalSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockFirebase.getTodaySessions).mockResolvedValue([]);

      const { result } = renderHook(() => useDailyGoalsSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify that both queries are called
      expect(mockFirebase.getDailyGoalSettings).toHaveBeenCalled();
      expect(mockFirebase.getTodaySessions).toHaveBeenCalled();
    });
  });
});
