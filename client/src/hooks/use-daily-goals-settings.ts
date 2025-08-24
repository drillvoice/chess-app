import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DailyGoalSettings } from '@shared/schema';
import { 
  validateTacticsMinutes, 
  validateGamesCount, 
  validateStudyMinutes,
  hasActiveGoals,
  GoalValidationResult,
  calculateDailyGoalsProgress,
  DailyGoalsProgress
} from '@/lib/utils';
import { getDailyGoalSettings, setDailyGoalSettings, getTodaySessions } from '@/lib/firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export interface DailyGoalsFormData {
  tacticsMinutes: number;
  gamesCount: number;
  studyMinutes: number;
}

export interface DailyGoalsValidation {
  tacticsMinutes: GoalValidationResult;
  gamesCount: GoalValidationResult;
  studyMinutes: GoalValidationResult;
  isValid: boolean;
}

export interface UseDailyGoalsSettingsReturn {
  // Current settings
  settings: DailyGoalSettings | null;
  isLoading: boolean;
  error: Error | null;
  
  // Form state
  formData: DailyGoalsFormData;
  setFormData: (data: Partial<DailyGoalsFormData>) => void;
  resetForm: () => void;
  
  // Validation
  validation: DailyGoalsValidation;
  
  // State helpers
  isCustomized: boolean;
  hasAnyActiveGoals: boolean;
  
  // Progress calculation
  progress: DailyGoalsProgress;
  isProgressLoading: boolean;
  
  // Actions
  saveSettings: () => Promise<void>;
  enableCustomGoals: () => Promise<void>;
  disableCustomGoals: () => Promise<void>;
  isSaving: boolean;
}

const DEFAULT_FORM_DATA: DailyGoalsFormData = {
  tacticsMinutes: 0,
  gamesCount: 0,
  studyMinutes: 0,
};

export function useDailyGoalsSettings(): UseDailyGoalsSettingsReturn {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Form state
  const [formData, setFormDataState] = useState<DailyGoalsFormData>(DEFAULT_FORM_DATA);
  
  // Query for current settings
  const {
    data: settings,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['daily-goal-settings'],
    queryFn: getDailyGoalSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      // Retry up to 2 times for network errors, but not for validation errors
      if (failureCount < 2 && error.message.includes('network')) {
        return true;
      }
      return false;
    },
    retryDelay: 1000, // 1 second delay between retries
  });

  // Query for today's sessions for progress calculation
  const {
    data: todaySessions = [],
    isLoading: isProgressLoading,
    error: sessionsError,
  } = useQuery({
    queryKey: ['today-sessions'],
    queryFn: getTodaySessions,
    staleTime: 30 * 1000, // 30 seconds - more frequent updates for progress
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      // Retry up to 2 times for network errors
      if (failureCount < 2 && error.message.includes('network')) {
        return true;
      }
      return false;
    },
    retryDelay: 1000, // 1 second delay between retries
  });

  // Calculate progress based on settings and today's sessions
  const progress: DailyGoalsProgress = useMemo(() => {
    try {
      return calculateDailyGoalsProgress(settings || null, todaySessions);
    } catch (error) {
      console.error('Error calculating progress:', error);
      // Return default progress on error
      return {
        tactics: { current: 0, target: 0, percentage: 0, isComplete: false },
        games: { current: 0, target: 0, percentage: 0, isComplete: false },
        study: { current: 0, target: 0, percentage: 0, isComplete: false },
        hasAnyProgress: false,
        totalCompleted: 0,
        totalGoals: 0,
      };
    }
  }, [settings, todaySessions]);

  // Initialize form data and track original settings when settings load
  useEffect(() => {
    if (settings) {
      const newFormData = {
        tacticsMinutes: settings.tacticsMinutes || 0,
        gamesCount: settings.gamesCount || 0,
        studyMinutes: settings.studyMinutes || 0,
      };
      setFormDataState(newFormData);
    }
  }, [settings]);

  // Validation state
  const validation: DailyGoalsValidation = useMemo(() => ({
    tacticsMinutes: validateTacticsMinutes(formData.tacticsMinutes),
    gamesCount: validateGamesCount(formData.gamesCount),
    studyMinutes: validateStudyMinutes(formData.studyMinutes),
    get isValid() {
      return this.tacticsMinutes.isValid && this.gamesCount.isValid && this.studyMinutes.isValid;
    },
  }), [formData.tacticsMinutes, formData.gamesCount, formData.studyMinutes]);

  // Computed state
  const isCustomized = settings?.isCustomized || false;
  const hasAnyActiveGoals = settings ? hasActiveGoals(settings) : false;

  // Form helpers
  const setFormData = useCallback((data: Partial<DailyGoalsFormData>) => {
    setFormDataState(prev => ({ ...prev, ...data }));
  }, []);

  const resetForm = useCallback(() => {
    if (settings) {
      setFormDataState({
        tacticsMinutes: settings.tacticsMinutes || 0,
        gamesCount: settings.gamesCount || 0,
        studyMinutes: settings.studyMinutes || 0,
      });
    } else {
      setFormDataState(DEFAULT_FORM_DATA);
    }
  }, [settings]);

  // Save settings mutation with enhanced error handling
  const saveMutation = useMutation({
    mutationFn: async (newSettings: DailyGoalSettings) => {
      try {
        await setDailyGoalSettings(newSettings);
      } catch (error) {
        // Log the error for debugging
        console.error('Failed to save daily goal settings:', error);
        
        // Re-throw with a user-friendly message
        if (error instanceof Error) {
          throw new Error(`Failed to save goals: ${error.message}`);
        }
        throw new Error('Failed to save goals. Please check your connection and try again.');
      }
    },
    onSuccess: (_, newSettings) => {
      // Invalidate queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['daily-goal-settings'] });
      queryClient.invalidateQueries({ queryKey: ['today-sessions'] });
      
      // Show success message
      const hasActiveGoalsInSettings = hasActiveGoals(newSettings);
      if (hasActiveGoalsInSettings) {
        toast({
          title: "Goals updated",
          description: "Your daily goals have been saved successfully.",
        });
      } else {
        toast({
          title: "Goals cleared",
          description: "All daily goals have been disabled.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error saving goals",
        description: error.message || "Failed to save your daily goals. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Action functions with enhanced validation and error handling
  const saveSettings = useCallback(async () => {
    if (!validation.isValid) {
      // Show validation errors
      const errors = [
        validation.tacticsMinutes.error,
        validation.gamesCount.error,
        validation.studyMinutes.error,
      ].filter(Boolean);
      
      toast({
        title: "Invalid input",
        description: errors.join(', '),
        variant: "destructive",
      });
      return;
    }

    const newSettings: DailyGoalSettings = {
      tacticsMinutes: formData.tacticsMinutes || undefined,
      gamesCount: formData.gamesCount || undefined,
      studyMinutes: formData.studyMinutes || undefined,
      isCustomized: true,
      lastModified: new Date(),
    };

    await saveMutation.mutateAsync(newSettings);
  }, [formData, validation, saveMutation, toast]);

  const enableCustomGoals = useCallback(async () => {
    const newSettings: DailyGoalSettings = {
      tacticsMinutes: formData.tacticsMinutes || undefined,
      gamesCount: formData.gamesCount || undefined,
      studyMinutes: formData.studyMinutes || undefined,
      isCustomized: true,
      lastModified: new Date(),
    };

    await saveMutation.mutateAsync(newSettings);
  }, [formData, saveMutation]);

  const disableCustomGoals = useCallback(async () => {
    const confirmed = window.confirm(
      "This will disable all custom goals and return to the default system. Continue?"
    );
    if (!confirmed) {
      return;
    }

    const newSettings: DailyGoalSettings = {
      isCustomized: false,
      lastModified: new Date(),
    };

    await saveMutation.mutateAsync(newSettings);
  }, [saveMutation]);

  return {
    // Current settings
    settings: settings || null,
    isLoading,
    error: error || sessionsError,
    
    // Form state
    formData,
    setFormData,
    resetForm,
    
    // Validation
    validation,
    
    // State helpers
    isCustomized,
    hasAnyActiveGoals,
    
    // Progress calculation
    progress,
    isProgressLoading,
    
    // Actions
    saveSettings,
    enableCustomGoals,
    disableCustomGoals,
    isSaving: saveMutation.isPending,
  };
}

// Input validation helpers for real-time form validation
export function validateGoalInput(
  value: string,
  type: 'tacticsMinutes' | 'gamesCount' | 'studyMinutes'
): { isValid: boolean; numericValue: number; error?: string } {
  // Allow empty string (will be treated as 0)
  if (value === '') {
    return { isValid: true, numericValue: 0 };
  }

  // Check if it's a valid number
  const numericValue = parseInt(value, 10);
  if (isNaN(numericValue)) {
    return { 
      isValid: false, 
      numericValue: 0, 
      error: 'Please enter a valid number' 
    };
  }

  // Validate based on type
  let validationResult: GoalValidationResult;
  switch (type) {
    case 'tacticsMinutes':
      validationResult = validateTacticsMinutes(numericValue);
      break;
    case 'gamesCount':
      validationResult = validateGamesCount(numericValue);
      break;
    case 'studyMinutes':
      validationResult = validateStudyMinutes(numericValue);
      break;
    default:
      return { isValid: false, numericValue: 0, error: 'Invalid goal type' };
  }

  return {
    isValid: validationResult.isValid,
    numericValue,
    error: validationResult.error,
  };
}
