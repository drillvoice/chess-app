import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings, Plus, X } from 'lucide-react';
import { normalizeStudyTagKey, studyTagSchema } from '@shared/schema';

import { useDailyGoalsSettings } from '@/hooks/use-daily-goals-settings';
import { useStudyPreferences, updateStudyPreferences } from '@/hooks/use-study-preferences';
import { MAX_TAG_GOALS } from '@/lib/daily-goals-model';
import { DAILY_GOAL_LIMITS } from '@/lib/utils';

interface GoalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NEW_TAG_OPTION = '__create-new-tag__';

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

function validateTagTarget(value: string): { numericValue?: number; error?: string } {
  const numericValue = parseInt(value, 10);
  if (isNaN(numericValue)) return { error: 'Please enter a valid number' };
  if (numericValue < 1 || numericValue > 99) return { error: 'Target must be between 1 and 99' };
  return { numericValue };
}

export function GoalSettingsModal({ isOpen, onClose }: GoalSettingsModalProps) {
  const {
    formData,
    setFormData,
    resetForm,
    saveSettings,
    isSaving,
    isLoading,
    autoTrackingEnabled,
    setAutoTrackingEnabled,
    addTagGoal,
    removeTagGoal,
    updateTagGoalTarget,
  } = useDailyGoalsSettings();

  const { preferences, refetch: refetchPreferences } = useStudyPreferences();

  // Local form state
  const [localFormData, setLocalFormData] = useState({
    tacticsMinutes: '',
    gamesCount: '',
    studyMinutes: '',
    autoTracking: false,
  });

  // Local validation state
  const [localValidation, setLocalValidation] = useState({
    tacticsMinutes: { isValid: true, error: undefined as string | undefined },
    gamesCount: { isValid: true, error: undefined as string | undefined },
    studyMinutes: { isValid: true, error: undefined as string | undefined },
  });

  // Per-tag-goal target drafts so invalid intermediate input doesn't corrupt state
  const [tagTargetDrafts, setTagTargetDrafts] = useState<Record<string, string>>({});
  const [tagTargetErrors, setTagTargetErrors] = useState<Record<string, string | undefined>>({});

  // "Add custom goal" state
  const [selectedTag, setSelectedTag] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('1');
  const [addGoalError, setAddGoalError] = useState<string | undefined>(undefined);
  const [isAddingGoal, setIsAddingGoal] = useState(false);

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen && !isLoading) {
      setLocalFormData({
        tacticsMinutes: (formData.tacticsMinutes || 0).toString(),
        gamesCount: (formData.gamesCount || 0).toString(),
        studyMinutes: (formData.studyMinutes || 0).toString(),
        autoTracking: autoTrackingEnabled,
      });

      // Reset validation
      setLocalValidation({
        tacticsMinutes: { isValid: true, error: undefined },
        gamesCount: { isValid: true, error: undefined },
        studyMinutes: { isValid: true, error: undefined },
      });
      setTagTargetDrafts({});
      setTagTargetErrors({});
      setSelectedTag('');
      setNewTagName('');
      setNewGoalTarget('1');
      setAddGoalError(undefined);
    }
  }, [isOpen, isLoading, formData, autoTrackingEnabled]);

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
    setAutoTrackingEnabled(checked);
  };

  const handleTagTargetChange = (goalId: string, value: string) => {
    setTagTargetDrafts((prev) => ({ ...prev, [goalId]: value }));
    const { numericValue, error } = validateTagTarget(value);
    setTagTargetErrors((prev) => ({ ...prev, [goalId]: error }));
    if (numericValue !== undefined) {
      updateTagGoalTarget(goalId, numericValue);
    }
  };

  const handleRemoveTagGoal = (goalId: string) => {
    removeTagGoal(goalId);
    setTagTargetDrafts((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([key]) => key !== goalId)),
    );
    setTagTargetErrors((prev) => ({ ...prev, [goalId]: undefined }));
  };

  const customTags = useMemo(() => preferences?.customTags ?? [], [preferences]);
  const tagConfigs = preferences?.tagConfigs ?? {};

  const usedTagKeys = useMemo(
    () => new Set(formData.tagGoals.map((goal) => normalizeStudyTagKey(goal.tag))),
    [formData.tagGoals],
  );
  const availableTags = customTags.filter((tag) => !usedTagKeys.has(normalizeStudyTagKey(tag)));

  const unitLabelFor = (tag: string): string =>
    tagConfigs[normalizeStudyTagKey(tag)]?.unitLabel ?? 'sessions';

  const handleAddGoal = async () => {
    setAddGoalError(undefined);

    const { numericValue: target, error: targetError } = validateTagTarget(newGoalTarget);
    if (target === undefined) {
      setAddGoalError(targetError);
      return;
    }

    const isCreatingTag = selectedTag === NEW_TAG_OPTION;
    const tag = isCreatingTag ? newTagName.trim() : selectedTag;
    if (!tag) {
      setAddGoalError(isCreatingTag ? 'Enter a name for the new tag' : 'Choose a tag');
      return;
    }

    const tagValidation = studyTagSchema.safeParse(tag);
    if (!tagValidation.success) {
      setAddGoalError(tagValidation.error.issues[0]?.message ?? 'Invalid tag');
      return;
    }

    if (formData.tagGoals.length >= MAX_TAG_GOALS) {
      setAddGoalError(`You can have at most ${MAX_TAG_GOALS} custom goals`);
      return;
    }

    if (usedTagKeys.has(normalizeStudyTagKey(tag))) {
      setAddGoalError('There is already a goal for this tag');
      return;
    }

    setIsAddingGoal(true);
    try {
      // Creating a brand-new tag registers it in study preferences first so
      // it's available when logging "Other study" sessions.
      if (isCreatingTag && preferences) {
        const alreadyExists = customTags.some(
          (existing) => normalizeStudyTagKey(existing) === normalizeStudyTagKey(tag),
        );
        if (!alreadyExists) {
          if (customTags.length >= 10) {
            setAddGoalError('You can have at most 10 study tags — remove one first');
            return;
          }
          await updateStudyPreferences({
            ...preferences,
            customTags: [...customTags, tag],
            lastModified: new Date(),
          });
          await refetchPreferences();
        }
      }

      if (!addTagGoal(tag, target)) {
        setAddGoalError('Could not add this goal');
        return;
      }

      setSelectedTag('');
      setNewTagName('');
      setNewGoalTarget('1');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create tag';
      setAddGoalError(message);
    } finally {
      setIsAddingGoal(false);
    }
  };

  // Check if form is valid
  const isFormValid = useMemo(() => {
    return (
      localValidation.tacticsMinutes.isValid &&
      localValidation.gamesCount.isValid &&
      localValidation.studyMinutes.isValid &&
      Object.values(tagTargetErrors).every((error) => !error)
    );
  }, [localValidation, tagTargetErrors]);

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
      <DialogContent className="mobile-modal max-h-[90vh] overflow-y-auto sm:max-w-md">
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

          {/* Custom tag goals */}
          <div className="space-y-3 border-t pt-4">
            <div>
              <div className="font-medium">Custom goals</div>
              <div className="text-sm text-muted-foreground">
                Track a daily goal against an &quot;Other study&quot; tag (e.g. Chessable, Anki).
              </div>
            </div>

            {formData.tagGoals.map((goal) => {
              const tagKey = normalizeStudyTagKey(goal.tag);
              const isMissingTag = !customTags.some((tag) => normalizeStudyTagKey(tag) === tagKey);
              const error = tagTargetErrors[goal.id];
              return (
                <div key={goal.id} className="space-y-1">
                  <div className="flex items-center space-x-3">
                    <Label
                      htmlFor={`tag-goal-${goal.id}`}
                      className="min-w-0 flex-1 text-sm font-medium"
                    >
                      {goal.tag}{' '}
                      <span className="font-normal text-muted-foreground">
                        ({unitLabelFor(goal.tag)})
                      </span>
                    </Label>
                    <Input
                      id={`tag-goal-${goal.id}`}
                      type="number"
                      min="1"
                      max="99"
                      value={tagTargetDrafts[goal.id] ?? goal.target.toString()}
                      onChange={(e) => handleTagTargetChange(goal.id, e.target.value)}
                      className={`w-20 ${error ? 'border-red-500' : ''}`}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveTagGoal(goal.id)}
                      className="h-8 w-8 p-0"
                      aria-label={`Remove ${goal.tag} goal`}
                    >
                      <X className="h-4 w-4 text-gray-500" />
                    </Button>
                  </div>
                  {error && <p className="text-sm text-red-500">{error}</p>}
                  {isMissingTag && (
                    <p className="text-xs text-muted-foreground">
                      This tag is no longer in your tag list — sessions logged with it still count.
                    </p>
                  )}
                </div>
              );
            })}

            {/* Add goal controls */}
            {formData.tagGoals.length < MAX_TAG_GOALS && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Select value={selectedTag} onValueChange={setSelectedTag}>
                    <SelectTrigger className="flex-1" aria-label="Tag for new goal">
                      <SelectValue placeholder="Choose a tag…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTags.map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          {tag} ({unitLabelFor(tag)})
                        </SelectItem>
                      ))}
                      <SelectItem value={NEW_TAG_OPTION}>+ New tag…</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    max="99"
                    value={newGoalTarget}
                    onChange={(e) => setNewGoalTarget(e.target.value)}
                    className="w-20"
                    aria-label="Target for new goal"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddGoal}
                    disabled={!selectedTag || isAddingGoal}
                    className="h-9 px-2"
                    aria-label="Add custom goal"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {selectedTag === NEW_TAG_OPTION && (
                  <Input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="New tag name (e.g. step method)"
                    maxLength={25}
                    aria-label="New tag name"
                  />
                )}
                {addGoalError && <p className="text-sm text-red-500">{addGoalError}</p>}
              </div>
            )}
          </div>

          {/* Auto-tracking Toggle */}
          <div className="space-y-3 border-t pt-4">
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
            <p>
              • Custom goals use the tag&apos;s configured unit (set in Account → Tag
              configuration), or count sessions
            </p>
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
