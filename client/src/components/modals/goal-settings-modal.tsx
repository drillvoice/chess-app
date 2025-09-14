import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings } from 'lucide-react';

import { useDailyGoalsSettings } from '@/hooks/use-daily-goals-settings';
import { DAILY_GOAL_LIMITS } from '@/lib/utils';

interface GoalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Validation function
function validateGoalInput(
  value: string,
  type: 'tacticsMinutes' | 'gamesCount' | 'studyMinutes',
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
      error: 'Please enter a valid number',
    };
  }

  // Validate based on type
  const limits =
    type === 'gamesCount'
      ? DAILY_GOAL_LIMITS.gamesCount
      : type === 'tacticsMinutes'
        ? DAILY_GOAL_LIMITS.tacticsMinutes
        : DAILY_GOAL_LIMITS.studyMinutes;

  if (numericValue < limits.min || numericValue > limits.max) {
    return {
      isValid: false,
      numericValue,
      error: `Maximum value is ${limits.max}`,
    };
  }

  return { isValid: true, numericValue, error: undefined };
}

export function GoalSettingsModal({ isOpen, onClose }: GoalSettingsModalProps) {
  const { formData, setFormData, resetForm, saveSettings, isSaving, isLoading } =
    useDailyGoalsSettings();

  // Local form state
  const [localFormData, setLocalFormData] = useState({
    tacticsMinutes: '',
    gamesCount: '',
    studyMinutes: '',
    autoTracking: false,
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
        autoTracking: formData.autoTracking || false,
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
    value: string,
  ) => {
    setLocalFormData((prev) => ({ ...prev, [field]: value }));

    // Validate input
    const validationResult = validateGoalInput(value, field);

    // Update validation state
    setLocalValidation((prev) => ({
      ...prev,
      [field]: {
        isValid: validationResult.isValid,
        error: validationResult.error,
      },
    }));

    // Update form data if valid
    if (validationResult.isValid) {
      setFormData({ [field]: validationResult.numericValue });
    }
  };

  // Handle auto-tracking toggle
  const handleAutoTrackingChange = (checked: boolean) => {
    setLocalFormData((prev) => ({ ...prev, autoTracking: checked }));
    setFormData({ autoTracking: checked });
  };

  // Check if form is valid
  const isFormValid = useMemo(() => {
    return (
      localValidation.tacticsMinutes.isValid &&
      localValidation.gamesCount.isValid &&
      localValidation.studyMinutes.isValid
    );
  }, [localValidation]);

  // Handle save
  const handleSave = async () => {
    try {
      await saveSettings();
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="mobile-modal sm:max-w-md overflow-y-auto w-[calc(100vw-1rem)] sm:w-auto mx-auto !fixed !top-2 sm:!top-1/2 !left-1/2 !-translate-x-1/2 !translate-y-0 sm:!-translate-y-1/2 max-h-[calc(100vh-1rem)] sm:max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Daily goal settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tactics Goal */}
          <div className="flex items-center space-x-3">
            <Label htmlFor="tactics-minutes" className="min-w-0 flex-1 text-sm font-medium">
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
            />
          </div>
          {!localValidation.tacticsMinutes.isValid && (
            <p className="-mt-2 text-sm text-red-500">{localValidation.tacticsMinutes.error}</p>
          )}

          {/* Games Goal */}
          <div className="flex items-center space-x-3">
            <Label htmlFor="games-count" className="min-w-0 flex-1 text-sm font-medium">
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
            />
          </div>
          {!localValidation.gamesCount.isValid && (
            <p className="-mt-2 text-sm text-red-500">{localValidation.gamesCount.error}</p>
          )}

          {/* Study Goal */}
          <div className="flex items-center space-x-3">
            <Label htmlFor="study-minutes" className="min-w-0 flex-1 text-sm font-medium">
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
            />
          </div>
          {!localValidation.studyMinutes.isValid && (
            <p className="-mt-2 text-sm text-red-500">{localValidation.studyMinutes.error}</p>
          )}

          {/* Auto-tracking Toggle */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="auto-tracking"
                checked={localFormData.autoTracking}
                onCheckedChange={handleAutoTrackingChange}
              />
              <Label htmlFor="auto-tracking" className="flex-1">
                <div className="font-medium">Auto-track daily goals</div>
                <div className="text-sm text-muted-foreground">
                  Automatically mark goals as complete when sessions are logged
                </div>
              </Label>
            </div>
          </div>

          {/* Help Text */}
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>• Set goals to 0 to disable that goal type</p>
            <p>• Maximum value for any goal is 99</p>
            <p>• Goals persist across days until changed</p>
            {localFormData.autoTracking && (
              <p>• Auto-tracking will show progress and mark goals complete automatically</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !isFormValid}>
              {isSaving ? 'Saving...' : 'Save Goals'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
