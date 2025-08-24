import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const hasChanges = useMemo(() => {
    const tacticsChanged = localFormData.tacticsMinutes !== formData.tacticsMinutes.toString();
    const gamesChanged = localFormData.gamesCount !== formData.gamesCount.toString();
    const studyChanged = localFormData.studyMinutes !== formData.studyMinutes.toString();
    return tacticsChanged || gamesChanged || studyChanged;
  }, [localFormData, formData]);

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
               className={`w-20 ${validation.tacticsMinutes.isValid ? '' : 'border-red-500'}`}
             />
           </div>
           {!validation.tacticsMinutes.isValid && (
             <p className="text-sm text-red-500 -mt-2">
               {validation.tacticsMinutes.error}
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
               className={`w-20 ${validation.gamesCount.isValid ? '' : 'border-red-500'}`}
             />
           </div>
           {!validation.gamesCount.isValid && (
             <p className="text-sm text-red-500 -mt-2">
               {validation.gamesCount.error}
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
               className={`w-20 ${validation.studyMinutes.isValid ? '' : 'border-red-500'}`}
             />
           </div>
           {!validation.studyMinutes.isValid && (
             <p className="text-sm text-red-500 -mt-2">
               {validation.studyMinutes.error}
             </p>
           )}

                     {/* Help Text */}
           <div className="text-xs text-muted-foreground space-y-1">
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
