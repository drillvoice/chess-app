import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useDailyGoalsSettings, validateGoalInput } from '@/hooks/use-daily-goals-settings';
import { Settings } from 'lucide-react';

interface GoalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GoalSettingsModal({ isOpen, onClose }: GoalSettingsModalProps) {
  const {
    formData,
    setFormData,
    resetForm,
    validation,
    saveSettings,
    isSaving,
    isLoading,
  } = useDailyGoalsSettings();

  // Local form state for real-time validation
  const [localFormData, setLocalFormData] = useState({
    tacticsMinutes: '',
    gamesCount: '',
    studyMinutes: '',
  });

  // Initialize local form data when modal opens
  useEffect(() => {
    if (isOpen && !isLoading) {
      setLocalFormData({
        tacticsMinutes: formData.tacticsMinutes.toString(),
        gamesCount: formData.gamesCount.toString(),
        studyMinutes: formData.studyMinutes.toString(),
      });
    }
  }, [isOpen, isLoading, formData]);

  // Handle input changes with real-time validation
  const handleInputChange = (
    field: 'tacticsMinutes' | 'gamesCount' | 'studyMinutes',
    value: string
  ) => {
    setLocalFormData(prev => ({ ...prev, [field]: value }));
    
    // Validate and update form data
    const validation = validateGoalInput(value, field);
    if (validation.isValid) {
      setFormData({ [field]: validation.numericValue });
    }
  };

  // Handle save
  const handleSave = async () => {
    try {
      await saveSettings();
      onClose();
    } catch (error) {
      // Error handling is done in the hook via toast
      console.error('Failed to save settings:', error);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    resetForm();
    onClose();
  };

  // Check if form has changes
  const hasChanges = 
    localFormData.tacticsMinutes !== formData.tacticsMinutes.toString() ||
    localFormData.gamesCount !== formData.gamesCount.toString() ||
    localFormData.studyMinutes !== formData.studyMinutes.toString();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Daily Goal Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Tactics Goal */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="tactics-minutes" className="text-sm font-medium">
                  Tactics Training (minutes)
                </Label>
                <Input
                  id="tactics-minutes"
                  type="number"
                  min="0"
                  max="99"
                  placeholder="0"
                  value={localFormData.tacticsMinutes}
                  onChange={(e) => handleInputChange('tacticsMinutes', e.target.value)}
                  className={validation.tacticsMinutes.isValid ? '' : 'border-red-500'}
                />
                {!validation.tacticsMinutes.isValid && (
                  <p className="text-sm text-red-500">
                    {validation.tacticsMinutes.error}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Games Goal */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="games-count" className="text-sm font-medium">
                  Games Played (count)
                </Label>
                <Input
                  id="games-count"
                  type="number"
                  min="0"
                  max="99"
                  placeholder="0"
                  value={localFormData.gamesCount}
                  onChange={(e) => handleInputChange('gamesCount', e.target.value)}
                  className={validation.gamesCount.isValid ? '' : 'border-red-500'}
                />
                {!validation.gamesCount.isValid && (
                  <p className="text-sm text-red-500">
                    {validation.gamesCount.error}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Study Goal */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="study-minutes" className="text-sm font-medium">
                  Study Time (minutes)
                </Label>
                <Input
                  id="study-minutes"
                  type="number"
                  min="0"
                  max="99"
                  placeholder="0"
                  value={localFormData.studyMinutes}
                  onChange={(e) => handleInputChange('studyMinutes', e.target.value)}
                  className={validation.studyMinutes.isValid ? '' : 'border-red-500'}
                />
                {!validation.studyMinutes.isValid && (
                  <p className="text-sm text-red-500">
                    {validation.studyMinutes.error}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Help Text */}
          <div className="text-sm text-muted-foreground">
            <p>• Set goals to 0 to disable that goal type</p>
            <p>• Maximum value for any goal is 99</p>
            <p>• Goals persist across days until changed</p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !validation.isValid || !hasChanges}
            >
              {isSaving ? 'Saving...' : 'Save Goals'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
