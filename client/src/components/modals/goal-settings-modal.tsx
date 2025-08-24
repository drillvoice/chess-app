import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, AlertTriangle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { useDailyGoalsSettings } from '@/hooks/use-daily-goals-settings';
import { DailyGoalSettings } from '@shared/schema';
import { DAILY_GOAL_LIMITS } from '@/lib/utils';

interface GoalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Validation function
function validateGoalInput(
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
  const limits = type === 'gamesCount' ? DAILY_GOAL_LIMITS.gamesCount : 
                 type === 'tacticsMinutes' ? DAILY_GOAL_LIMITS.tacticsMinutes : 
                 DAILY_GOAL_LIMITS.studyMinutes;
  
  if (numericValue < limits.min || numericValue > limits.max) {
    return { 
      isValid: false, 
      numericValue, 
      error: `Maximum value is ${limits.max}` 
    };
  }

  return { isValid: true, numericValue, error: undefined };
}

export function GoalSettingsModal({ isOpen, onClose }: GoalSettingsModalProps) {
  const {
    formData,
    setFormData,
    resetForm,
    saveSettings,
    isSaving,
    isLoading,
    error,
  } = useDailyGoalsSettings();

  // Local form state
  const [localFormData, setLocalFormData] = useState({
    tacticsMinutes: '',
    gamesCount: '',
    studyMinutes: '',
  });

  // Local validation state
  const [localValidation, setLocalValidation] = useState({
    tacticsMinutes: { isValid: true, error: undefined },
    gamesCount: { isValid: true, error: undefined },
    studyMinutes: { isValid: true, error: undefined },
  });

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen && !isLoading) {
      setLocalFormData({
        tacticsMinutes: (formData.tacticsMinutes || 0).toString(),
        gamesCount: (formData.gamesCount || 0).toString(),
        studyMinutes: (formData.studyMinutes || 0).toString(),
      });
      
      // Reset validation
      setLocalValidation({
        tacticsMinutes: { isValid: true, error: undefined },
        gamesCount: { isValid: true, error: undefined },
        studyMinutes: { isValid: true, error: undefined },
      });
    }
  }, [isOpen, isLoading, formData]);

  // Handle input changes
  const handleInputChange = (
    field: 'tacticsMinutes' | 'gamesCount' | 'studyMinutes',
    value: string
  ) => {
    setLocalFormData(prev => ({ ...prev, [field]: value }));
    
    // Validate input
    const validationResult = validateGoalInput(value, field);
    
    // Update validation state
    setLocalValidation(prev => ({
      ...prev,
      [field]: {
        isValid: validationResult.isValid,
        error: validationResult.error,
      }
    }));
    
    // Update form data if valid
    if (validationResult.isValid) {
      setFormData({ [field]: validationResult.numericValue });
    }
  };

  // Check if form is valid
  const isFormValid = useMemo(() => {
    return localValidation.tacticsMinutes.isValid &&
           localValidation.gamesCount.isValid &&
           localValidation.studyMinutes.isValid;
  }, [localValidation]);

  // Check if there are any active goals
  const hasActiveGoals = useMemo(() => {
    const tactics = parseInt(localFormData.tacticsMinutes) || 0;
    const games = parseInt(localFormData.gamesCount) || 0;
    const study = parseInt(localFormData.studyMinutes) || 0;
    return tactics > 0 || games > 0 || study > 0;
  }, [localFormData]);

  // Handle save
  const handleSave = async () => {
    try {
      await saveSettings();
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
      // Error handling is done in the hook via toast notifications
    }
  };

  // Handle cancel
  const handleCancel = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Daily goal settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Failed to load settings. Please try refreshing the page.
              </AlertDescription>
            </Alert>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-sm text-gray-500 mt-2">Loading settings...</p>
            </div>
          )}

          {/* Form Fields */}
          {!isLoading && (
            <>
              {/* Tactics Goal */}
              <div className="flex items-center space-x-3">
                <Label htmlFor="tactics-minutes" className="text-sm font-medium min-w-0 flex-1">
                  Tactics training (minutes)
                </Label>
                <Input
                  id="tactics-minutes"
                  type="number"
                  min="0"
                  max="99"
                  placeholder="0"
                  value={localFormData.tacticsMinutes}
                  onChange={(e) => handleInputChange('tacticsMinutes', e.target.value)}
                  className={`w-20 ${localValidation.tacticsMinutes.isValid ? '' : 'border-red-500'}`}
                  disabled={isSaving}
                />
              </div>
              {!localValidation.tacticsMinutes.isValid && (
                <p className="text-sm text-red-500 -mt-2">
                  {localValidation.tacticsMinutes.error}
                </p>
              )}

              {/* Games Goal */}
              <div className="flex items-center space-x-3">
                <Label htmlFor="games-count" className="text-sm font-medium min-w-0 flex-1">
                  Games played (count)
                </Label>
                <Input
                  id="games-count"
                  type="number"
                  min="0"
                  max="99"
                  placeholder="0"
                  value={localFormData.gamesCount}
                  onChange={(e) => handleInputChange('gamesCount', e.target.value)}
                  className={`w-20 ${localValidation.gamesCount.isValid ? '' : 'border-red-500'}`}
                  disabled={isSaving}
                />
              </div>
              {!localValidation.gamesCount.isValid && (
                <p className="text-sm text-red-500 -mt-2">
                  {localValidation.gamesCount.error}
                </p>
              )}

              {/* Study Goal */}
              <div className="flex items-center space-x-3">
                <Label htmlFor="study-minutes" className="text-sm font-medium min-w-0 flex-1">
                  Study time (minutes)
                </Label>
                <Input
                  id="study-minutes"
                  type="number"
                  min="0"
                  max="99"
                  placeholder="0"
                  value={localFormData.studyMinutes}
                  onChange={(e) => handleInputChange('studyMinutes', e.target.value)}
                  className={`w-20 ${localValidation.studyMinutes.isValid ? '' : 'border-red-500'}`}
                  disabled={isSaving}
                />
              </div>
              {!localValidation.studyMinutes.isValid && (
                <p className="text-sm text-red-500 -mt-2">
                  {localValidation.studyMinutes.error}
                </p>
              )}

              {/* No Active Goals Warning */}
              {!hasActiveGoals && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    All goals are set to 0. The daily goals component will be hidden until you set at least one active goal.
                  </AlertDescription>
                </Alert>
              )}

              {/* Help Text */}
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Set goals to 0 to disable that goal type</p>
                <p>• Maximum value for any goal is 99</p>
                <p>• Goals persist across days until changed</p>
                <p>• Progress is preserved when modifying goals</p>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving || isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || isLoading || !isFormValid}
            >
              {isSaving ? 'Saving...' : 'Save Goals'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
