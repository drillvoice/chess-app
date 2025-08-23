import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { GoalSettingsModal } from './goal-settings-modal';
import * as dailyGoalsHook from '@/hooks/use-daily-goals-settings';
import { useToast } from '@/hooks/use-toast';

// Mock dependencies
vi.mock('@/hooks/use-daily-goals-settings', () => ({
  useDailyGoalsSettings: vi.fn(),
  validateGoalInput: vi.fn(),
}));
vi.mock('@/hooks/use-toast');

const mockUseToast = vi.mocked(useToast);
const mockUseDailyGoalsSettings = vi.mocked(dailyGoalsHook.useDailyGoalsSettings);
const mockValidateGoalInput = vi.mocked(dailyGoalsHook.validateGoalInput);

// Test wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('GoalSettingsModal', () => {
  const mockClose = vi.fn();
  
  const defaultMockHook = {
    formData: {
      tacticsMinutes: 30,
      gamesCount: 2,
      studyMinutes: 15,
    },
    setFormData: vi.fn(),
    resetForm: vi.fn(),
    validation: {
      tacticsMinutes: { isValid: true },
      gamesCount: { isValid: true },
      studyMinutes: { isValid: true },
      isValid: true,
    },
    saveSettings: vi.fn(),
    isSaving: false,
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToast.mockReturnValue({ toast: vi.fn() });
    mockUseDailyGoalsSettings.mockReturnValue(defaultMockHook);
    mockValidateGoalInput.mockReturnValue({ isValid: true, numericValue: 45 });
  });

  afterEach(() => {
    cleanup();
  });

  it('should render modal when open', () => {
    render(
      <GoalSettingsModal isOpen={true} onClose={mockClose} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Daily Goal Settings')).toBeTruthy();
    expect(screen.getByText('Tactics Training (minutes)')).toBeTruthy();
    expect(screen.getByText('Games Played (count)')).toBeTruthy();
    expect(screen.getByText('Study Time (minutes)')).toBeTruthy();
  });

  it('should not render modal when closed', () => {
    render(
      <GoalSettingsModal isOpen={false} onClose={mockClose} />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByText('Daily Goal Settings')).toBeNull();
  });

  it('should display current form values', () => {
    render(
      <GoalSettingsModal isOpen={true} onClose={mockClose} />,
      { wrapper: createWrapper() }
    );

    const tacticsInput = screen.getByLabelText('Tactics Training (minutes)') as HTMLInputElement;
    const gamesInput = screen.getByLabelText('Games Played (count)') as HTMLInputElement;
    const studyInput = screen.getByLabelText('Study Time (minutes)') as HTMLInputElement;

    expect(tacticsInput.value).toBe('30');
    expect(gamesInput.value).toBe('2');
    expect(studyInput.value).toBe('15');
  });

  it('should handle input changes', async () => {
    const mockSetFormData = vi.fn();
    mockUseDailyGoalsSettings.mockReturnValue({
      ...defaultMockHook,
      setFormData: mockSetFormData,
    });

    render(
      <GoalSettingsModal isOpen={true} onClose={mockClose} />,
      { wrapper: createWrapper() }
    );

    const tacticsInput = screen.getByLabelText('Tactics Training (minutes)');
    fireEvent.change(tacticsInput, { target: { value: '45' } });

    await waitFor(() => {
      expect(mockValidateGoalInput).toHaveBeenCalledWith('45', 'tacticsMinutes');
      expect(mockSetFormData).toHaveBeenCalledWith({ tacticsMinutes: 45 });
    });
  });

  it('should show validation errors for invalid input', () => {
    mockUseDailyGoalsSettings.mockReturnValue({
      ...defaultMockHook,
      validation: {
        tacticsMinutes: { isValid: false, error: 'Tactics minutes cannot exceed 99' },
        gamesCount: { isValid: true },
        studyMinutes: { isValid: true },
        isValid: false,
      },
    });

    render(
      <GoalSettingsModal isOpen={true} onClose={mockClose} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Tactics minutes cannot exceed 99')).toBeTruthy();
  });

  it('should disable save button when form is invalid', () => {
    mockUseDailyGoalsSettings.mockReturnValue({
      ...defaultMockHook,
      validation: {
        tacticsMinutes: { isValid: false, error: 'Invalid input' },
        gamesCount: { isValid: true },
        studyMinutes: { isValid: true },
        isValid: false,
      },
    });

    render(
      <GoalSettingsModal isOpen={true} onClose={mockClose} />,
      { wrapper: createWrapper() }
    );

    const saveButton = screen.getByText('Save Goals');
    expect(saveButton.disabled).toBe(true);
  });

  it('should call saveSettings when save button is clicked', async () => {
    const mockSaveSettings = vi.fn().mockResolvedValue(undefined);
    mockUseDailyGoalsSettings.mockReturnValue({
      ...defaultMockHook,
      saveSettings: mockSaveSettings,
      validation: {
        tacticsMinutes: { isValid: true },
        gamesCount: { isValid: true },
        studyMinutes: { isValid: true },
        isValid: true,
      },
    });

    render(
      <GoalSettingsModal isOpen={true} onClose={mockClose} />,
      { wrapper: createWrapper() }
    );

    // Simulate making a change to trigger the save button
    const tacticsInput = screen.getByLabelText('Tactics Training (minutes)');
    fireEvent.change(tacticsInput, { target: { value: '50' } });

    const saveButton = screen.getByText('Save Goals');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalled();
    });
    
    expect(mockClose).toHaveBeenCalled();
  });

  it('should call resetForm and close when cancel is clicked', () => {
    const mockResetForm = vi.fn();
    mockUseDailyGoalsSettings.mockReturnValue({
      ...defaultMockHook,
      resetForm: mockResetForm,
    });

    render(
      <GoalSettingsModal isOpen={true} onClose={mockClose} />,
      { wrapper: createWrapper() }
    );

    const cancelButton = screen.getAllByText('Cancel')[0];
    fireEvent.click(cancelButton);

    expect(mockResetForm).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it('should show loading state when saving', () => {
    mockUseDailyGoalsSettings.mockReturnValue({
      ...defaultMockHook,
      isSaving: true,
    });

    render(
      <GoalSettingsModal isOpen={true} onClose={mockClose} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Saving...')).toBeTruthy();
  });

  it('should show help text', () => {
    render(
      <GoalSettingsModal isOpen={true} onClose={mockClose} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('• Set goals to 0 to disable that goal type')).toBeTruthy();
    expect(screen.getByText('• Maximum value for any goal is 99')).toBeTruthy();
    expect(screen.getByText('• Goals persist across days until changed')).toBeTruthy();
  });
});
