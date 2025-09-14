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
}));
vi.mock('@/hooks/use-toast');

const mockUseToast = vi.mocked(useToast);
const mockUseDailyGoalsSettings = vi.mocked(dailyGoalsHook.useDailyGoalsSettings);

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

describe('GoalSettingsModal', () => {
  const mockClose = vi.fn();

  const defaultMockHook: dailyGoalsHook.UseDailyGoalsSettingsReturn = {
    settings: null,
    isLoading: false,
    error: null,
    formData: {
      tacticsMinutes: 30,
      gamesCount: 2,
      studyMinutes: 15,
      autoTracking: false,
    },
    setFormData: vi.fn(),
    resetForm: vi.fn(),
    validation: {
      tacticsMinutes: { isValid: true },
      gamesCount: { isValid: true },
      studyMinutes: { isValid: true },
      isValid: true,
    },
    isCustomized: false,
    hasAnyActiveGoals: false,
    saveSettings: vi.fn(),
    enableCustomGoals: vi.fn(),
    disableCustomGoals: vi.fn(),
    isSaving: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToast.mockReturnValue({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] });
    mockUseDailyGoalsSettings.mockReturnValue(defaultMockHook);
  });

  afterEach(() => {
    cleanup();
  });

  it('should render modal when open', () => {
    render(<GoalSettingsModal isOpen={true} onClose={mockClose} />, { wrapper: createWrapper() });

    expect(screen.getByText('Daily goal settings')).toBeTruthy();
    expect(screen.getByText('Tactics training (minutes)')).toBeTruthy();
    expect(screen.getByText('Games played (count)')).toBeTruthy();
    expect(screen.getByText('Study time (minutes)')).toBeTruthy();
  });

  it('should not render modal when closed', () => {
    render(<GoalSettingsModal isOpen={false} onClose={mockClose} />, { wrapper: createWrapper() });

    expect(screen.queryByText('Daily goal settings')).toBeNull();
  });

  it('should display current form values', () => {
    render(<GoalSettingsModal isOpen={true} onClose={mockClose} />, { wrapper: createWrapper() });

    const tacticsInput = screen.getByLabelText('Tactics training (minutes)') as HTMLInputElement;
    const gamesInput = screen.getByLabelText('Games played (count)') as HTMLInputElement;
    const studyInput = screen.getByLabelText('Study time (minutes)') as HTMLInputElement;

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

    render(<GoalSettingsModal isOpen={true} onClose={mockClose} />, { wrapper: createWrapper() });

    const tacticsInput = screen.getByLabelText('Tactics training (minutes)');
    fireEvent.change(tacticsInput, { target: { value: '45' } });

    await waitFor(() => {
      expect(mockSetFormData).toHaveBeenCalledWith({ tacticsMinutes: 45 });
    });
  });

  it('should show validation errors for invalid input', async () => {
    render(<GoalSettingsModal isOpen={true} onClose={mockClose} />, { wrapper: createWrapper() });

    // Enter an invalid value (over 99)
    const tacticsInput = screen.getByLabelText('Tactics training (minutes)');
    fireEvent.change(tacticsInput, { target: { value: '150' } });

    await waitFor(() => {
      expect(screen.getByText('Maximum value is 99')).toBeTruthy();
    });
  });

  it('should disable save button when form is invalid', async () => {
    render(<GoalSettingsModal isOpen={true} onClose={mockClose} />, { wrapper: createWrapper() });

    // Enter an invalid value to make form invalid
    const tacticsInput = screen.getByLabelText('Tactics training (minutes)');
    fireEvent.change(tacticsInput, { target: { value: '150' } });

    await waitFor(() => {
      const saveButton = screen.getByText('Save Goals') as HTMLButtonElement;
      expect(saveButton.disabled).toBe(true);
    });
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

    render(<GoalSettingsModal isOpen={true} onClose={mockClose} />, { wrapper: createWrapper() });

    // Save button should be enabled even without changes
    const saveButton = screen.getByText('Save Goals') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalled();
    });

    expect(mockClose).toHaveBeenCalled();
  });

  it('should enable save button when study time changes from 0 to non-zero', async () => {
    const mockSaveSettings = vi.fn().mockResolvedValue(undefined);
    mockUseDailyGoalsSettings.mockReturnValue({
      ...defaultMockHook,
      formData: {
        tacticsMinutes: 0,
        gamesCount: 0,
        studyMinutes: 0,
        autoTracking: false,
      },
      setFormData: vi.fn(),
      resetForm: vi.fn(),
      saveSettings: mockSaveSettings,
    });

    render(<GoalSettingsModal isOpen={true} onClose={mockClose} />, { wrapper: createWrapper() });

    // Change study time from 0 to 15
    const studyInput = screen.getByLabelText('Study time (minutes)');
    fireEvent.change(studyInput, { target: { value: '15' } });

    const saveButton = screen.getByText('Save Goals') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
  });

  it('should call resetForm and close when cancel is clicked', () => {
    const mockResetForm = vi.fn();
    mockUseDailyGoalsSettings.mockReturnValue({
      ...defaultMockHook,
      resetForm: mockResetForm,
    });

    render(<GoalSettingsModal isOpen={true} onClose={mockClose} />, { wrapper: createWrapper() });

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

    render(<GoalSettingsModal isOpen={true} onClose={mockClose} />, { wrapper: createWrapper() });

    expect(screen.getByText('Saving...')).toBeTruthy();
  });

  it('should show help text', () => {
    render(<GoalSettingsModal isOpen={true} onClose={mockClose} />, { wrapper: createWrapper() });

    expect(screen.getByText('• Set goals to 0 to disable that goal type')).toBeTruthy();
    expect(screen.getByText('• Maximum value for any goal is 99')).toBeTruthy();
    expect(screen.getByText('• Goals persist across days until changed')).toBeTruthy();
  });

  it('should enable save button even without changes', () => {
    render(<GoalSettingsModal isOpen={true} onClose={mockClose} />, { wrapper: createWrapper() });

    // Save button should be enabled from the start (no changes needed)
    const saveButton = screen.getByText('Save Goals') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
  });

  it('should prevent saving when value exceeds 99', async () => {
    render(<GoalSettingsModal isOpen={true} onClose={mockClose} />, { wrapper: createWrapper() });

    // Enter a value above 99 (like in the user's screenshot)
    const studyInput = screen.getByLabelText('Study time (minutes)');
    fireEvent.change(studyInput, { target: { value: '999' } });

    await waitFor(() => {
      // Should show validation error
      expect(screen.getByText('Maximum value is 99')).toBeTruthy();

      // Should show red border on input
      expect(studyInput.className).toContain('border-red-500');

      // Save button should be disabled
      const saveButton = screen.getByText('Save Goals') as HTMLButtonElement;
      expect(saveButton.disabled).toBe(true);
    });
  });
});
