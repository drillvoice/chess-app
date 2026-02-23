import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useDailyGoalsSettings, validateGoalInput } from './use-daily-goals-settings';
import { DailyGoalSettings } from '@shared/schema';
import * as firestore from '@/lib/firebase/firestore';
import { useToast } from '@/hooks/use-toast';

// Mock dependencies
vi.mock('@/lib/firebase/firestore', () => ({
  getDailyGoalSettings: vi.fn(),
  setDailyGoalSettings: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
    dismiss: vi.fn(),
    toasts: [],
  })),
}));

const mockToast = vi.fn();
const mockGetDailyGoalSettings = vi.mocked(firestore.getDailyGoalSettings);
const mockSetDailyGoalSettings = vi.mocked(firestore.setDailyGoalSettings);

// Test wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  Wrapper.displayName = 'Wrapper';

  return Wrapper;
}

describe('useDailyGoalsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useToast).mockReturnValue({ toast: mockToast, dismiss: vi.fn(), toasts: [] });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with default values when no settings exist', async () => {
      mockGetDailyGoalSettings.mockResolvedValue(null);

      const { result } = renderHook(() => useDailyGoalsSettings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.settings).toBeNull();
      expect(result.current.isCustomized).toBe(false);
      expect(result.current.hasAnyActiveGoals).toBe(false);
      expect(result.current.formData).toEqual({
        tacticsMinutes: 0,
        gamesCount: 0,
        studyMinutes: 0,
      });
    });

    it('should initialize with existing settings', async () => {
      const mockSettings: DailyGoalSettings = {
        tacticsMinutes: 30,
        gamesCount: 2,
        studyMinutes: 15,
        isCustomized: true,
        autoTracking: false,
        lastModified: new Date(),
      };
      mockGetDailyGoalSettings.mockResolvedValue(mockSettings);

      const { result } = renderHook(() => useDailyGoalsSettings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.settings).toEqual(mockSettings);
      expect(result.current.isCustomized).toBe(true);
      expect(result.current.hasAnyActiveGoals).toBe(true);
      expect(result.current.formData).toEqual({
        tacticsMinutes: 30,
        gamesCount: 2,
        studyMinutes: 15,
      });
    });
  });

  describe('Form Management', () => {
    it('should update form data', async () => {
      mockGetDailyGoalSettings.mockResolvedValue(null);

      const { result } = renderHook(() => useDailyGoalsSettings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setFormData({ tacticsMinutes: 45 });
      });

      expect(result.current.formData.tacticsMinutes).toBe(45);
      expect(result.current.formData.gamesCount).toBe(0);
      expect(result.current.formData.studyMinutes).toBe(0);
    });

    it('should reset form to current settings', async () => {
      const mockSettings: DailyGoalSettings = {
        tacticsMinutes: 30,
        gamesCount: 2,
        studyMinutes: 15,
        isCustomized: true,
        autoTracking: false,
      };
      mockGetDailyGoalSettings.mockResolvedValue(mockSettings);

      const { result } = renderHook(() => useDailyGoalsSettings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Modify form data
      act(() => {
        result.current.setFormData({ tacticsMinutes: 99 });
      });

      expect(result.current.formData.tacticsMinutes).toBe(99);

      // Reset form
      act(() => {
        result.current.resetForm();
      });

      expect(result.current.formData).toEqual({
        tacticsMinutes: 30,
        gamesCount: 2,
        studyMinutes: 15,
      });
    });
  });

  describe('Validation', () => {
    it('should validate form data correctly', async () => {
      mockGetDailyGoalSettings.mockResolvedValue(null);

      const { result } = renderHook(() => useDailyGoalsSettings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Valid data
      act(() => {
        result.current.setFormData({
          tacticsMinutes: 30,
          gamesCount: 5,
          studyMinutes: 20,
        });
      });

      expect(result.current.validation.isValid).toBe(true);
      expect(result.current.validation.tacticsMinutes.isValid).toBe(true);
      expect(result.current.validation.gamesCount.isValid).toBe(true);
      expect(result.current.validation.studyMinutes.isValid).toBe(true);

      // Invalid data
      act(() => {
        result.current.setFormData({
          tacticsMinutes: 150, // exceeds max
          gamesCount: -1, // below min
          studyMinutes: 30.5, // not integer
        });
      });

      expect(result.current.validation.isValid).toBe(false);
      expect(result.current.validation.tacticsMinutes.isValid).toBe(false);
      expect(result.current.validation.gamesCount.isValid).toBe(false);
      expect(result.current.validation.studyMinutes.isValid).toBe(false);
    });
  });

  describe('Save Operations', () => {
    it('should save valid settings successfully', async () => {
      mockGetDailyGoalSettings.mockResolvedValue(null);
      mockSetDailyGoalSettings.mockResolvedValue();

      const { result } = renderHook(() => useDailyGoalsSettings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setFormData({
          tacticsMinutes: 30,
          gamesCount: 2,
          studyMinutes: 15,
        });
      });

      await act(async () => {
        await result.current.saveSettings();
      });

      expect(mockSetDailyGoalSettings).toHaveBeenCalledWith({
        tacticsMinutes: 30,
        gamesCount: 2,
        studyMinutes: 15,
        isCustomized: true,
        autoTracking: false,
        lastModified: expect.any(Date),
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Goals updated',
        description: 'Your daily goals have been saved successfully.',
      });
    });

    it('should not save invalid settings', async () => {
      mockGetDailyGoalSettings.mockResolvedValue(null);

      const { result } = renderHook(() => useDailyGoalsSettings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setFormData({
          tacticsMinutes: 150, // invalid
          gamesCount: 2,
          studyMinutes: 15,
        });
      });

      await act(async () => {
        await result.current.saveSettings();
      });

      expect(mockSetDailyGoalSettings).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Invalid input',
        description: 'Tactics minutes cannot exceed 99',
        variant: 'destructive',
      });
    });

    it('should enable custom goals', async () => {
      mockGetDailyGoalSettings.mockResolvedValue(null);
      mockSetDailyGoalSettings.mockResolvedValue();

      const { result } = renderHook(() => useDailyGoalsSettings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.enableCustomGoals();
      });

      expect(mockSetDailyGoalSettings).toHaveBeenCalledWith({
        tacticsMinutes: undefined,
        gamesCount: undefined,
        studyMinutes: undefined,
        isCustomized: true,
        autoTracking: false,
        lastModified: expect.any(Date),
      });
    });

    it('should disable custom goals', async () => {
      mockGetDailyGoalSettings.mockResolvedValue(null);
      mockSetDailyGoalSettings.mockResolvedValue();

      const { result } = renderHook(() => useDailyGoalsSettings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.disableCustomGoals();
      });

      expect(mockSetDailyGoalSettings).toHaveBeenCalledWith({
        isCustomized: false,
        autoTracking: false,
        lastModified: expect.any(Date),
      });
    });
  });
});

describe('validateGoalInput', () => {
  it('should validate empty input as 0', () => {
    const result = validateGoalInput('', 'tacticsMinutes');
    expect(result).toEqual({
      isValid: true,
      numericValue: 0,
    });
  });

  it('should validate valid numeric input', () => {
    const result = validateGoalInput('30', 'tacticsMinutes');
    expect(result).toEqual({
      isValid: true,
      numericValue: 30,
    });
  });

  it('should reject non-numeric input', () => {
    const result = validateGoalInput('abc', 'tacticsMinutes');
    expect(result).toEqual({
      isValid: false,
      numericValue: 0,
      error: 'Please enter a valid number',
    });
  });

  it('should reject input exceeding limits', () => {
    const result = validateGoalInput('150', 'tacticsMinutes');
    expect(result).toEqual({
      isValid: false,
      numericValue: 150,
      error: 'Tactics minutes cannot exceed 99',
    });
  });

  it('should reject negative input', () => {
    const result = validateGoalInput('-5', 'gamesCount');
    expect(result).toEqual({
      isValid: false,
      numericValue: -5,
      error: 'Games count must be at least 0',
    });
  });

  it('should validate different goal types correctly', () => {
    // Tactics minutes
    const tacticsResult = validateGoalInput('99', 'tacticsMinutes');
    expect(tacticsResult.isValid).toBe(true);

    // Games count
    const gamesResult = validateGoalInput('99', 'gamesCount');
    expect(gamesResult.isValid).toBe(true);

    // Study minutes
    const studyResult = validateGoalInput('99', 'studyMinutes');
    expect(studyResult.isValid).toBe(true);
  });
});
