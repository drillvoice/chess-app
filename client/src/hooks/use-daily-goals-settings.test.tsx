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
  hasActiveGoals: vi.fn((settings) => {
    if (!settings) return false;
    return (
      (settings.tacticsMinutes > 0) ||
      (settings.gamesCount > 0) ||
      (settings.studyMinutes > 0)
    );
  }),
  calculateDailyGoalsProgress: vi.fn(() => ({
    tactics: { current: 0, target: 0, percentage: 0, isComplete: false },
    games: { current: 0, target: 0, percentage: 0, isComplete: false },
    study: { current: 0, target: 0, percentage: 0, isComplete: false },
    hasAnyProgress: false,
    totalCompleted: 0,
    totalGoals: 0,
  })),
}));

describe('useDailyGoalsSettings - Integration & Polish', () => {
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

  describe('Progress Preservation', () => {
    it('should preserve progress when goals are modified', async () => {
      const mockSettings: DailyGoalSettings = {
        tacticsMinutes: 30,
        gamesCount: 2,
        studyMinutes: 15,
        isCustomized: true,
        lastModified: new Date(),
      };

      const { getDailyGoalSettings, getTodaySessions, setDailyGoalSettings } = await import('@/lib/firebase/firestore');
      const { calculateDailyGoalsProgress } = await import('@/lib/utils');

      vi.mocked(getDailyGoalSettings).mockResolvedValue(mockSettings);
      vi.mocked(getTodaySessions).mockResolvedValue([]);
      vi.mocked(setDailyGoalSettings).mockResolvedValue();
      vi.mocked(calculateDailyGoalsProgress).mockReturnValue({
        tactics: { current: 30, target: 30, percentage: 100, isComplete: true },
        games: { current: 1, target: 2, percentage: 50, isComplete: false },
        study: { current: 0, target: 15, percentage: 0, isComplete: false },
        hasAnyProgress: true,
        totalCompleted: 1,
        totalGoals: 3,
      });

      const { result } = renderHook(() => useDailyGoalsSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.settings).toBeTruthy();
      });

      // Wait for form data to be initialized
      await waitFor(() => {
        expect(result.current.formData.tacticsMinutes).toBe(30);
      });

      // Modify goals (increase tactics from 30 to 40)
      result.current.setFormData({ tacticsMinutes: 40 });

      // Wait for form data to be updated
      await waitFor(() => {
        expect(result.current.formData.tacticsMinutes).toBe(40);
      });

      // Save settings - should work without any warnings
      await result.current.saveSettings();

      // Verify that the save was successful (no confirmation dialogs)
      expect(setDailyGoalSettings).toHaveBeenCalledWith({
        tacticsMinutes: 40,
        gamesCount: 2,
        studyMinutes: 15,
        isCustomized: true,
        lastModified: expect.any(Date),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const { getDailyGoalSettings } = await import('@/lib/firebase/firestore');
      
      vi.mocked(getDailyGoalSettings).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useDailyGoalsSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.settings).toBeNull();
    });

    it('should handle save errors with user-friendly messages', async () => {
      const mockSettings: DailyGoalSettings = {
        tacticsMinutes: 30,
        gamesCount: 2,
        studyMinutes: 15,
        isCustomized: true,
        lastModified: new Date(),
      };

      const { getDailyGoalSettings, setDailyGoalSettings } = await import('@/lib/firebase/firestore');
      
      vi.mocked(getDailyGoalSettings).mockResolvedValue(mockSettings);
      vi.mocked(setDailyGoalSettings).mockRejectedValue(new Error('Database connection failed'));

      const { result } = renderHook(() => useDailyGoalsSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.settings).toBeTruthy();
      });

      // Try to save settings - this should handle the error gracefully
      try {
        await result.current.saveSettings();
      } catch (error) {
        // Error is expected and should be handled by the mutation
        expect(error).toBeTruthy();
      }

      // Should handle the error gracefully
      expect(result.current.isSaving).toBe(false);
    });

    it('should handle progress calculation errors', async () => {
      const mockSettings: DailyGoalSettings = {
        tacticsMinutes: 30,
        gamesCount: 2,
        studyMinutes: 15,
        isCustomized: true,
        lastModified: new Date(),
      };

      const { getDailyGoalSettings, getTodaySessions } = await import('@/lib/firebase/firestore');
      const { calculateDailyGoalsProgress } = await import('@/lib/utils');

      vi.mocked(getDailyGoalSettings).mockResolvedValue(mockSettings);
      vi.mocked(getTodaySessions).mockResolvedValue([]);
      vi.mocked(calculateDailyGoalsProgress).mockImplementation(() => {
        throw new Error('Progress calculation failed');
      });

      const { result } = renderHook(() => useDailyGoalsSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.settings).toBeTruthy();
      });

      // Should return default progress on error
      expect(result.current.progress).toEqual({
        tactics: { current: 0, target: 0, percentage: 0, isComplete: false },
        games: { current: 0, target: 0, percentage: 0, isComplete: false },
        study: { current: 0, target: 0, percentage: 0, isComplete: false },
        hasAnyProgress: false,
        totalCompleted: 0,
        totalGoals: 0,
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null settings gracefully', async () => {
      const { getDailyGoalSettings } = await import('@/lib/firebase/firestore');
      
      vi.mocked(getDailyGoalSettings).mockResolvedValue(null);

      const { result } = renderHook(() => useDailyGoalsSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.settings).toBeNull();
      });

      expect(result.current.isCustomized).toBe(false);
      expect(result.current.hasAnyActiveGoals).toBe(false);
      expect(result.current.formData).toEqual({
        tacticsMinutes: 0,
        gamesCount: 0,
        studyMinutes: 0,
      });
    });

    it('should handle settings with undefined values', async () => {
      const mockSettings: DailyGoalSettings = {
        isCustomized: true,
        lastModified: new Date(),
      };

      const { getDailyGoalSettings } = await import('@/lib/firebase/firestore');
      
      vi.mocked(getDailyGoalSettings).mockResolvedValue(mockSettings);

      const { result } = renderHook(() => useDailyGoalsSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.settings).toBeTruthy();
      });

      expect(result.current.formData).toEqual({
        tacticsMinutes: 0,
        gamesCount: 0,
        studyMinutes: 0,
      });
    });

    it('should handle disable custom goals confirmation', async () => {
      const mockSettings: DailyGoalSettings = {
        tacticsMinutes: 30,
        gamesCount: 2,
        studyMinutes: 15,
        isCustomized: true,
        lastModified: new Date(),
      };

      const { getDailyGoalSettings, setDailyGoalSettings } = await import('@/lib/firebase/firestore');
      
      vi.mocked(getDailyGoalSettings).mockResolvedValue(mockSettings);
      vi.mocked(setDailyGoalSettings).mockResolvedValue();

      // Mock window.confirm to return false (user cancels)
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      const { result } = renderHook(() => useDailyGoalsSettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.settings).toBeTruthy();
      });

      // Try to disable custom goals
      await result.current.disableCustomGoals();

      // Should show confirmation dialog
      expect(confirmSpy).toHaveBeenCalledWith(
        "This will disable all custom goals and return to the default system. Continue?"
      );

      // Should not call setDailyGoalSettings if user cancels
      expect(setDailyGoalSettings).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });
  });
});
