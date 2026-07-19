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

type BuiltinField = 'tacticsMinutes' | 'gamesCount' | 'studyMinutes';

const BUILTIN_GOALS: { field: BuiltinField; inputId: string; label: string }[] = [
  { field: 'tacticsMinutes', inputId: 'tactics-minutes', label: 'Tactics training (minutes)' },
  { field: 'gamesCount', inputId: 'games-count', label: 'Games played (count)' },
  { field: 'studyMinutes', inputId: 'study-minutes', label: 'Study time (minutes)' },
];

// Select option values for adding a built-in goal back
const builtinOption = (field: BuiltinField) => `__builtin-${field}__`;
const BUILTIN_OPTION_FIELDS = new Map<string, BuiltinField>(
  BUILTIN_GOALS.map(({ field }) => [builtinOption(field), field]),
);

// Validation function
function validateGoalInput(
  value: string,
  type: BuiltinField,
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

  const { preferences } = useStudyPreferences();

  // Local form state
  const [localFormData, setLocalFormData] = useState({
    tacticsMinutes: '',
    gamesCount: '',
    studyMinutes: '',
    autoTracking: false,
  });

  // Which built-in goals are shown as rows. Removal hides the row and zeroes
  // the value; membership (not the live input value) drives visibility so a
  // row doesn't vanish while the user is clearing the input to retype.
  const [activeBuiltins, setActiveBuiltins] = useState<Set<BuiltinField>>(new Set());

  // Local validation state
  const [localValidation, setLocalValidation] = useState({
    tacticsMinutes: { isValid: true, error: undefined as string | undefined },
    gamesCount: { isValid: true, error: undefined as string | undefined },
    studyMinutes: { isValid: true, error: undefined as string | undefined },
  });

  // Per-tag-goal target drafts so invalid intermediate input doesn't corrupt state
  const [tagTargetDrafts, setTagTargetDrafts] = useState<Record<string, string>>({});
  const [tagTargetErrors, setTagTargetErrors] = useState<Record<string, string | undefined>>({});

  // "Add goal" state
  const [selectedOption, setSelectedOption] = useState('');
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
      setActiveBuiltins(
        new Set(
          BUILTIN_GOALS.filter(({ field }) => (formData[field] || 0) > 0).map((g) => g.field),
        ),
      );

      // Reset validation
      setLocalValidation({
        tacticsMinutes: { isValid: true, error: undefined },
        gamesCount: { isValid: true, error: undefined },
        studyMinutes: { isValid: true, error: undefined },
      });
      setTagTargetDrafts({});
      setTagTargetErrors({});
      setSelectedOption('');
      setNewTagName('');
      setNewGoalTarget('1');
      setAddGoalError(undefined);
    }
  }, [isOpen, isLoading, formData, autoTrackingEnabled]);

  // Handle input changes
  const handleInputChange = (field: BuiltinField, value: string) => {
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

  const handleRemoveBuiltin = (field: BuiltinField) => {
    // 0 is persisted explicitly, which both hides the goal from the widget
    // and propagates the removal to the cloud under merge writes.
    setFormData({ [field]: 0 });
    setLocalFormData((prev) => ({ ...prev, [field]: '0' }));
    setLocalValidation((prev) => ({ ...prev, [field]: { isValid: true, error: undefined } }));
    setActiveBuiltins((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
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
  const inactiveBuiltins = BUILTIN_GOALS.filter(({ field }) => !activeBuiltins.has(field));

  const unitLabelFor = (tag: string): string =>
    tagConfigs[normalizeStudyTagKey(tag)]?.unitLabel ?? 'sessions';

  const handleAddGoal = async () => {
    setAddGoalError(undefined);

    const { numericValue: target, error: targetError } = validateTagTarget(newGoalTarget);
    if (target === undefined) {
      setAddGoalError(targetError);
      return;
    }

    // Re-adding a built-in goal
    const builtinField = BUILTIN_OPTION_FIELDS.get(selectedOption);
    if (builtinField) {
      setFormData({ [builtinField]: target });
      setLocalFormData((prev) => ({ ...prev, [builtinField]: target.toString() }));
      setActiveBuiltins((prev) => new Set(prev).add(builtinField));
      setSelectedOption('');
      setNewGoalTarget('1');
      return;
    }

    const isCreatingTag = selectedOption === NEW_TAG_OPTION;
    const tag = isCreatingTag ? newTagName.trim() : selectedOption;
    if (!tag) {
      setAddGoalError(isCreatingTag ? 'Enter a name for the new tag' : 'Choose a goal');
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
        }
      }

      if (!addTagGoal(tag, target)) {
        setAddGoalError('Could not add this goal');
        return;
      }

      setSelectedOption('');
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

  const hasAnyGoalRows = activeBuiltins.size > 0 || formData.tagGoals.length > 0;

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
          {!hasAnyGoalRows && (
            <p className="text-sm text-muted-foreground">
              No goals yet — add one below. Goals can be built-in (tactics, games, study time) or
              tied to an &quot;Other study&quot; tag (e.g. Chessable, Anki).
            </p>
          )}

          {/* Built-in goal rows */}
          {BUILTIN_GOALS.filter(({ field }) => activeBuiltins.has(field)).map(
            ({ field, inputId, label }) => (
              <React.Fragment key={field}>
                <div className="flex items-center space-x-3">
                  <Label htmlFor={inputId} className="min-w-0 flex-1 text-sm font-medium">
                    {label}
                  </Label>
                  <Input
                    id={inputId}
                    type="number"
                    min="0"
                    max="99"
                    placeholder="0"
                    value={localFormData[field]}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                    className={`w-20 ${localValidation[field].isValid ? '' : 'border-red-500'}`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveBuiltin(field)}
                    className="h-8 w-8 p-0"
                    aria-label={`Remove ${label} goal`}
                  >
                    <X className="h-4 w-4 text-gray-500" />
                  </Button>
                </div>
                {!localValidation[field].isValid && (
                  <p className="-mt-2 text-sm text-red-500">{localValidation[field].error}</p>
                )}
              </React.Fragment>
            ),
          )}

          {/* Custom tag goal rows */}
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
          <div className="space-y-2 border-t pt-4">
            <div className="font-medium">Add a goal</div>
            <div className="flex items-center space-x-2">
              <Select value={selectedOption} onValueChange={setSelectedOption}>
                <SelectTrigger className="flex-1" aria-label="Goal to add">
                  <SelectValue placeholder="Choose a goal…" />
                </SelectTrigger>
                <SelectContent>
                  {inactiveBuiltins.map(({ field, label }) => (
                    <SelectItem key={field} value={builtinOption(field)}>
                      {label}
                    </SelectItem>
                  ))}
                  {formData.tagGoals.length < MAX_TAG_GOALS && (
                    <>
                      {availableTags.map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          {tag} ({unitLabelFor(tag)})
                        </SelectItem>
                      ))}
                      <SelectItem value={NEW_TAG_OPTION}>+ New tag…</SelectItem>
                    </>
                  )}
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
                disabled={!selectedOption || isAddingGoal}
                className="h-9 px-2"
                aria-label="Add goal"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {selectedOption === NEW_TAG_OPTION && (
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
            <p>• Remove a goal with the × button to hide it from your daily list</p>
            <p>• Maximum value for any goal is 99</p>
            <p>• Goals persist across days until changed</p>
            <p>
              • Tag goals use the tag&apos;s configured unit (set in Account → Tag configuration),
              or count sessions
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
