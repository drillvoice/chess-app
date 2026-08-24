import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { TagManager } from '@/components/ui/tag-manager';
import { toTagList } from '@/lib/storage/study-tags';
// Dynamic import for firebase to maintain code splitting
import { gameSessionSchema, type GameSession, type TrainingSession } from '@shared/schema';
import { buildCreateOptimisticSession, buildEditOptimisticSession } from './game-modal/helpers';
import { useDateField } from './game-modal/use-date-field';
import { useOpponentAutocomplete } from './game-modal/use-opponent-autocomplete';
import { OpponentField } from './game-modal/opponent-field';
import { DatePopover } from './game-modal/date-popover';
import {
  ColorField,
  ResultField,
  TimeControlField,
  PlatformField,
} from './game-modal/selection-fields';

interface GameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSession?: TrainingSession;
  isEditMode?: boolean;
  onClearEditingSession?: () => void;
}

export default function GameModal({
  open,
  onOpenChange,
  editingSession,
  isEditMode = false,
  onClearEditingSession,
}: GameModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedResult, setSelectedResult] = useState<'win' | 'loss' | 'draw' | null>(null);
  const [selectedColor, setSelectedColor] = useState<'white' | 'black' | null>(null);
  const [selectedTimeControl, setSelectedTimeControl] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<'lichess' | 'chess.com' | 'otb' | null>(
    null,
  );
  const [selectedMistakeTags, setSelectedMistakeTags] = useState<string[]>([]);
  const opponent = useOpponentAutocomplete();
  const { selectedDate, dateInput, isDateValid, setDate, handleDateInputChange } =
    useDateField(editingSession);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    trigger,
  } = useForm<GameSession>({
    resolver: zodResolver(gameSessionSchema),
    defaultValues: {
      type: 'game',
      gameResult:
        isEditMode && editingSession
          ? (editingSession.gameResult as 'win' | 'loss' | 'draw' | undefined)
          : undefined,
      gameComments: isEditMode && editingSession ? editingSession.gameComments || '' : '',
      mistakeTags: [],
      playerColor:
        isEditMode && editingSession
          ? (editingSession.playerColor as 'white' | 'black' | undefined)
          : undefined,
      platform:
        isEditMode && editingSession
          ? (editingSession.platform as 'lichess' | 'chess.com' | 'otb' | undefined)
          : undefined,
      timeControl:
        isEditMode && editingSession
          ? (editingSession.timeControl as 'bullet' | 'blitz' | 'rapid' | 'classical' | undefined)
          : undefined,
      opponentUsername: isEditMode && editingSession ? editingSession.opponentUsername || '' : '',
    },
  });

  const opponentUsernameField = register('opponentUsername');

  const mutation = useMutation({
    mutationFn: async (data: GameSession) => {
      const { createSession, updateSession } = await import('@/lib/firebase');
      if (isEditMode && editingSession) {
        // Preserve existing fields that shouldn't be overwritten
        const updateData = {
          ...data,
          needsReview: false,
          duration: editingSession.duration,
          // Only update platform/timeControl if they were actually changed
          platform: data.platform ?? editingSession.platform,
          timeControl: data.timeControl ?? editingSession.timeControl,
          // Update opponentUsername from form data
          opponentUsername: data.opponentUsername || editingSession.opponentUsername,
        };
        return await updateSession(editingSession.id, updateData);
      }
      return await createSession(data);
    },
    onMutate: async (newSession) => {
      // Close modal immediately for better UX
      onOpenChange(false);
      reset();
      setSelectedResult(null);
      setSelectedColor(null);
      setSelectedTimeControl(null);
      setSelectedPlatform(null);
      setSelectedMistakeTags([]);
      opponent.reset();
      setDate(new Date());

      // Show immediate feedback
      toast({
        title: isEditMode ? 'Updating...' : 'Saving...',
        description: `Game session is being ${isEditMode ? 'updated' : 'saved'}`,
      });

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['sessions'] });
      await queryClient.cancelQueries({ queryKey: ['statistics'] });

      // Snapshot previous values
      const previousSessions = queryClient.getQueryData<TrainingSession[]>(['sessions']);
      const previousStats = queryClient.getQueryData(['statistics']);

      // Prepare optimistic session
      if (isEditMode && editingSession) {
        const optimisticSession = buildEditOptimisticSession(editingSession, newSession);

        queryClient.setQueryData<TrainingSession[]>(['sessions'], (old = []) =>
          old.map((session) => (session.id === editingSession.id ? optimisticSession : session)),
        );

        return { previousSessions, previousStats };
      } else {
        const tempId = -Date.now(); // Use negative ID to distinguish from real sessions
        const optimisticSession = buildCreateOptimisticSession(newSession, tempId);

        queryClient.setQueryData<TrainingSession[]>(['sessions'], (old = []) => [
          optimisticSession,
          ...old,
        ]);

        return { previousSessions, previousStats, tempId };
      }
    },
    onSuccess: (result, variables, context) => {
      // Remove temporary session if it exists
      if (context?.tempId) {
        queryClient.setQueryData<TrainingSession[]>(['sessions'], (old = []) =>
          old.filter((session) => session.id !== context.tempId),
        );
      }

      // Show success notification
      toast({
        title: 'Success',
        description: isEditMode
          ? 'Game session updated successfully!'
          : 'Game session logged successfully!',
      });

      // Refresh data to show the real session
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-goal'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-activity'] });
      queryClient.invalidateQueries({ queryKey: ['pending-review'] });
      onClearEditingSession?.();
    },
    onError: (error: any, _newSession, context) => {
      // Remove temporary session if it exists
      if (context?.tempId) {
        queryClient.setQueryData<TrainingSession[]>(['sessions'], (old = []) =>
          old.filter((session) => session.id !== context.tempId),
        );
      }

      // Check if it's a timeout error but session might have been saved
      if (error.message?.includes('timeout')) {
        toast({
          title: 'Slow Connection',
          description: 'Session may have been saved. Please check your activity to confirm.',
          variant: 'destructive',
        });
        // Refresh data to check if the session was actually saved
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      } else {
        if (context?.previousSessions) {
          queryClient.setQueryData(['sessions'], context.previousSessions);
        }
        if (context?.previousStats) {
          queryClient.setQueryData(['statistics'], context.previousStats);
        }
        toast({
          title: 'Error',
          description: error.message || 'Failed to log game session',
          variant: 'destructive',
        });
      }
      onClearEditingSession?.();
    },
  });

  useEffect(() => {
    if (isEditMode && editingSession) {
      const gameResult = editingSession.gameResult as 'win' | 'loss' | 'draw' | null;
      const playerColor = editingSession.playerColor as 'white' | 'black' | null;
      const timeControl = editingSession.timeControl;
      const platform = editingSession.platform;
      const opponentUsername = editingSession.opponentUsername || '';

      // Set visual state
      setSelectedResult(gameResult);
      setSelectedColor(playerColor);
      setSelectedTimeControl(timeControl);
      setSelectedPlatform(platform as 'lichess' | 'chess.com' | 'otb' | null);
      setSelectedMistakeTags(
        toTagList(editingSession.mistakeTags, editingSession.id, 'mistakeTags'),
      );
      opponent.reset(opponentUsername);
      setDate(new Date(editingSession.date));

      // Set form values properly with validation
      if (gameResult) {
        setValue('gameResult', gameResult, { shouldValidate: true });
      }
      if (playerColor) {
        setValue('playerColor', playerColor, { shouldValidate: true });
      }
      if (timeControl) {
        setValue('timeControl', timeControl as any, { shouldValidate: true });
      }
      if (platform) {
        setValue('platform', platform as any, { shouldValidate: true });
      }
      // Load existing comments for any game being edited
      if (editingSession.gameComments) {
        setValue('gameComments', editingSession.gameComments, { shouldValidate: true });
      }
      // Load existing opponent name
      if (opponentUsername) {
        setValue('opponentUsername', opponentUsername, { shouldValidate: true });
      }
    } else {
      setSelectedMistakeTags([]);
      setDate(new Date());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSession, isEditMode, setValue]);

  // Mirror the locally-held tag selection into the form so zod validates it
  // (same pattern the study modal uses for studyTags).
  useEffect(() => {
    setValue('mistakeTags', selectedMistakeTags, { shouldValidate: true });
  }, [selectedMistakeTags, setValue]);

  const onSubmit = (data: GameSession) => {
    if (selectedDate > new Date()) {
      toast({
        title: 'Invalid date',
        description: 'Date cannot be in the future',
        variant: 'destructive',
      });
      return;
    }

    // Add selected date and mistake tags to the session data
    const sessionData = {
      ...data,
      mistakeTags: selectedMistakeTags,
      date: selectedDate,
    };
    mutation.mutate(sessionData);
  };

  const handleResultSelect = (result: 'win' | 'loss' | 'draw') => {
    setSelectedResult(result);
    setValue('gameResult', result, { shouldValidate: true });
    trigger('gameResult');
  };

  const handleColorSelect = (color: 'white' | 'black') => {
    setSelectedColor(color);
    setValue('playerColor', color, { shouldValidate: true });
    trigger('playerColor');
  };

  const handleTimeControlSelect = (timeControl: string) => {
    if (selectedTimeControl === timeControl) {
      // Deselect if clicking the same time control
      setSelectedTimeControl(null);
      setValue('timeControl', undefined, { shouldValidate: true });
    } else {
      setSelectedTimeControl(timeControl);
      setValue('timeControl', timeControl as any, { shouldValidate: true });
    }
    trigger('timeControl');
  };

  const handlePlatformSelect = (platform: 'lichess' | 'chess.com' | 'otb') => {
    if (selectedPlatform === platform) {
      // Deselect if clicking the same platform
      setSelectedPlatform(null);
      setValue('platform', undefined, { shouldValidate: true });
      // Clear opponent name when deselecting OTB
      if (platform === 'otb') {
        opponent.reset();
        setValue('opponentUsername', '', { shouldValidate: true });
      }
    } else {
      setSelectedPlatform(platform);
      setValue('platform', platform, { shouldValidate: true });
      // Clear opponent name when switching away from OTB
      if (selectedPlatform === 'otb' && platform !== 'otb') {
        opponent.reset();
        setValue('opponentUsername', '', { shouldValidate: true });
      }
    }
    trigger('platform');
  };

  const handleModalChange = (open: boolean) => {
    if (!open) {
      // Only reset if not in edit mode or if we're closing after editing
      if (!isEditMode) {
        reset({
          type: 'game',
          gameResult: undefined,
          gameComments: '',
          mistakeTags: [],
          playerColor: undefined,
          platform: undefined,
          timeControl: undefined,
          opponentUsername: '',
        });
        setSelectedResult(null);
        setSelectedColor(null);
        setSelectedTimeControl(null);
        setSelectedPlatform(null);
        setSelectedMistakeTags([]);
        opponent.reset();
      }
      if (!mutation.isPending) {
        onClearEditingSession?.();
      }
      setDate(editingSession?.date ? new Date(editingSession.date) : new Date());
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleModalChange}>
      <DialogContent className="mobile-modal sm:max-w-md">
        <DialogHeader className="relative flex items-center justify-center pb-2">
          <DatePopover
            selectedDate={selectedDate}
            dateInput={dateInput}
            onDateInputChange={handleDateInputChange}
          />
          <DialogTitle className="text-xl font-bold text-gray-800">Log game</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
            {editingSession?.openingName && (
              <div>
                <Label className="mb-1 block text-sm font-medium text-gray-700">Opening</Label>
                <p className="text-sm text-gray-600">
                  {editingSession.openingEco ? `${editingSession.openingEco} · ` : ''}
                  {editingSession.openingName}
                </p>
              </div>
            )}
            <ColorField
              selected={selectedColor}
              onSelect={handleColorSelect}
              error={errors.playerColor?.message}
            />

            <ResultField
              selected={selectedResult}
              onSelect={handleResultSelect}
              error={errors.gameResult?.message}
            />

            <TimeControlField
              selected={selectedTimeControl}
              onSelect={handleTimeControlSelect}
              error={errors.timeControl?.message}
            />

            <PlatformField
              selected={selectedPlatform}
              onSelect={handlePlatformSelect}
              error={errors.platform?.message}
            />

            {/* Opponent name field - only shown for OTB games */}
            {selectedPlatform === 'otb' && (
              <OpponentField
                autocomplete={opponent}
                field={opponentUsernameField}
                setValue={setValue}
                error={errors.opponentUsername?.message}
              />
            )}

            <div>
              <Label htmlFor="gameComments" className="text-sm font-medium text-gray-700">
                Comments
              </Label>
              <Textarea
                id="gameComments"
                placeholder="Great endgame technique..."
                className="mt-1"
                rows={2}
                {...register('gameComments')}
              />
            </div>

            <div>
              <TagManager
                vocabulary="mistake"
                selectedTags={selectedMistakeTags}
                onTagsChange={setSelectedMistakeTags}
                label="Mistakes"
                placeholder="e.g. hung a piece"
                emptyMessage="No mistake tags yet."
                maxTags={20}
                selectedClassName="border-rose-300 bg-rose-50 text-rose-800"
              />
              {errors.mistakeTags && (
                <p className="mt-1 text-sm text-red-600">{errors.mistakeTags.message}</p>
              )}
            </div>
          </div>

          <div className="flex space-x-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="modal-button flex-1"
              onClick={() => handleModalChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="modal-button flex-1 bg-[#059669] hover:bg-emerald-700"
              disabled={mutation.isPending || !isDateValid}
            >
              {mutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
