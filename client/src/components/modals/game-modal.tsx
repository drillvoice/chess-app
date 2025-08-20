import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
// Dynamic import for firebase to maintain code splitting
import { gameSessionSchema, type GameSession, type TrainingSession } from '@shared/schema';
import { Trophy, X, Clock, Square, Zap, Hourglass, Clock3, Monitor, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSession?: TrainingSession;
  isEditMode?: boolean;
}

export default function GameModal({
  open,
  onOpenChange,
  editingSession,
  isEditMode = false,
}: GameModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedResult, setSelectedResult] = useState<'win' | 'loss' | 'draw' | null>(null);
  const [selectedColor, setSelectedColor] = useState<'white' | 'black' | null>(null);
  const [selectedTimeControl, setSelectedTimeControl] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  const {
  register,
  handleSubmit,
  formState: { errors },
  reset,
  setValue,
  watch,
  trigger,
} = useForm<GameSession>({
  resolver: zodResolver(gameSessionSchema),
  defaultValues: {
    type: 'game',
    gameResult: isEditMode && editingSession ? 
      (editingSession.gameResult as 'win' | 'loss' | 'draw' | undefined) : undefined,
    gameComments: isEditMode && editingSession ? 
      (editingSession.gameComments || '') : '',
    playerColor: isEditMode && editingSession ? 
      (editingSession.playerColor as 'white' | 'black' | undefined) : undefined,
    platform: isEditMode && editingSession ? 
      (editingSession.platform as 'lichess' | 'chess.com' | 'otb' | undefined) : undefined,
    timeControl: isEditMode && editingSession ? 
      (editingSession.timeControl as 'bullet' | 'blitz' | 'rapid' | 'classical' | undefined) : undefined,
  },
});

  const mutation = useMutation({
    mutationFn: async (data: GameSession) => {
      const { createSession, updateSession } = await import('@/lib/firebase');
      if (isEditMode && editingSession) {
        return await updateSession(editingSession.id, { ...data, needsReview: false });
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
        const optimisticSession: TrainingSession = {
          id: editingSession.id,
          type: 'game',
          date: editingSession.date,
          duration: null,
          pointsGained: null,
          finalScore: null,
          tacticsNotes: null,
          gameResult: newSession.gameResult,
          gameType: null,
          gameComments: newSession.gameComments || null,
          playerColor: newSession.playerColor,
          platform: newSession.platform ?? null,
          timeControl: newSession.timeControl ?? null,
          studyType: null,
          studyNotes: null,
          goalTitle: null,
          goalDescription: null,
          goalWeekStart: null,
          needsReview: false,
        };

        queryClient.setQueryData<TrainingSession[]>(['sessions'], (old = []) =>
          old.map((session) => (session.id === editingSession.id ? optimisticSession : session)),
        );

        return { previousSessions, previousStats };
      } else {
        const tempId = Date.now();
        const optimisticSession: TrainingSession = {
          id: tempId,
          type: 'game',
          date: new Date(),
          duration: null,
          pointsGained: null,
          finalScore: null,
          tacticsNotes: null,
          gameResult: newSession.gameResult,
          gameType: null,
          gameComments: newSession.gameComments || null,
          playerColor: newSession.playerColor,
          platform: newSession.platform ?? null,
          timeControl: newSession.timeControl ?? null,
          studyType: null,
          studyNotes: null,
          goalTitle: null,
          goalDescription: null,
          goalWeekStart: null,
          needsReview: false,
        };

        queryClient.setQueryData<TrainingSession[]>(['sessions'], (old = []) => [
          optimisticSession,
          ...old,
        ]);

        return { previousSessions, previousStats };
      }
    },
    onSuccess: () => {
      // Show success notification
      toast({
        title: 'Success',
        description: isEditMode
          ? 'Game session updated successfully!'
          : 'Game session logged successfully!',
      });

      // Refresh data in background
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-goal'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-activity'] });
      queryClient.invalidateQueries({ queryKey: ['pending-review'] });
    },
    onError: (error: any, _newSession, context) => {
      // Check if it's a timeout error but session might have been saved
      if (error.message?.includes('timeout')) {
        toast({
          title: 'Slow Connection',
          description: 'Session may have been saved. Please check your activity to confirm.',
          variant: 'destructive',
        });
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
    },
  });

  useEffect(() => {
  if (isEditMode && editingSession) {
    const gameResult = editingSession.gameResult as 'win' | 'loss' | 'draw' | null;
    const playerColor = editingSession.playerColor as 'white' | 'black' | null;
    const timeControl = editingSession.timeControl;
    const platform = editingSession.platform;
    
    // Set visual state
    setSelectedResult(gameResult);
    setSelectedColor(playerColor);
    setSelectedTimeControl(timeControl);
    setSelectedPlatform(platform);
    
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
    if (editingSession.gameComments) {
      setValue('gameComments', editingSession.gameComments, { shouldValidate: true });
    }
  }
}, [editingSession, isEditMode, setValue]);

  const onSubmit = (data: GameSession) => {
    // Add current date to the session data
    const sessionData = {
      ...data,
      date: isEditMode && editingSession ? editingSession.date : new Date(),
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

  const handlePlatformSelect = (platform: string) => {
    if (selectedPlatform === platform) {
      // Deselect if clicking the same platform
      setSelectedPlatform(null);
      setValue('platform', undefined, { shouldValidate: true });
    } else {
      setSelectedPlatform(platform);
      setValue('platform', platform as any, { shouldValidate: true });
    }
    trigger('platform');
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

  const handleModalChange = (open: boolean) => {
  if (!open) {
    // Only reset if not in edit mode or if we're closing after editing
    if (!isEditMode) {
      reset({
        type: 'game',
        gameResult: undefined,
        gameComments: '',
        playerColor: undefined,
        platform: undefined,
        timeControl: undefined,
      });
      setSelectedResult(null);
      setSelectedColor(null);
      setSelectedTimeControl(null);
      setSelectedPlatform(null);
    }
  }
  onOpenChange(open);
};

  return (
    <Dialog open={open} onOpenChange={handleModalChange}>
      <DialogContent className="mobile-modal sm:max-w-md">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xl font-bold text-gray-800">Log Game</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-2">
            {/* Colour Section */}
            <div className="flex items-center space-x-3">
              <Label className="text-sm font-medium text-gray-700 w-16">Colour</Label>
              <div className="flex gap-2 flex-1">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-8 items-center justify-center space-x-2 px-3',
                    selectedColor === 'white'
                      ? 'border-gray-800 bg-gray-100 text-gray-800 ring-2 ring-gray-800'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                  )}
                  onClick={() => handleColorSelect('white')}
                >
                  <Square className="h-3 w-3 fill-white stroke-gray-800" />
                  <span className="text-sm">White</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-8 items-center justify-center space-x-2 px-3',
                    selectedColor === 'black'
                      ? 'border-gray-800 bg-gray-800 text-white ring-2 ring-gray-800'
                      : 'border-gray-300 bg-gray-800 text-white hover:bg-gray-700',
                  )}
                  onClick={() => handleColorSelect('black')}
                >
                  <Square className="h-3 w-3 fill-gray-800" />
                  <span className="text-sm">Black</span>
                </Button>
              </div>
            </div>
            {errors.playerColor && (
              <p className="text-sm text-red-600">{errors.playerColor.message}</p>
            )}

            {/* Result Section */}
            <div className="flex items-center space-x-3">
              <Label className="text-sm font-medium text-gray-700 w-16">Result</Label>
              <div className="flex gap-2 flex-1">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-8 items-center justify-center space-x-2 px-3',
                    selectedResult === 'win'
                      ? 'border-green-500 bg-green-50 text-green-800 ring-2 ring-green-500'
                      : 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100',
                  )}
                  onClick={() => handleResultSelect('win')}
                >
                  <Trophy className="h-3 w-3" />
                  <span className="text-sm">Win</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-8 items-center justify-center space-x-2 px-3',
                    selectedResult === 'draw'
                      ? 'border-gray-500 bg-gray-50 text-gray-800 ring-2 ring-gray-500'
                      : 'border-gray-300 bg-gray-50 text-gray-800 hover:bg-gray-100',
                  )}
                  onClick={() => handleResultSelect('draw')}
                >
                  <Square className="h-3 w-3" />
                  <span className="text-sm">Draw</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-8 items-center justify-center space-x-2 px-3',
                    selectedResult === 'loss'
                      ? 'border-red-500 bg-red-50 text-red-800 ring-2 ring-red-500'
                      : 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100',
                  )}
                  onClick={() => handleResultSelect('loss')}
                >
                  <X className="h-3 w-3" />
                  <span className="text-sm">Loss</span>
                </Button>
              </div>
            </div>
            {errors.gameResult && (
              <p className="text-sm text-red-600">{errors.gameResult.message}</p>
            )}

            {/* Platform Section */}
            <div className="flex items-center space-x-3">
              <Label className="text-sm font-medium text-gray-700 w-16">Platform</Label>
              <div className="flex gap-2 flex-1">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-8 items-center justify-center px-3',
                    selectedPlatform === 'lichess'
                      ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                  )}
                  onClick={() => handlePlatformSelect('lichess')}
                >
                  <span className="text-sm">Lichess</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-8 items-center justify-center px-3',
                    selectedPlatform === 'chess.com'
                      ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                  )}
                  onClick={() => handlePlatformSelect('chess.com')}
                >
                  <span className="text-sm">Chess.com</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-8 items-center justify-center px-3',
                    selectedPlatform === 'otb'
                      ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                  )}
                  onClick={() => handlePlatformSelect('otb')}
                >
                  <span className="text-sm">OTB</span>
                </Button>
              </div>
            </div>
            {errors.platform && (
              <p className="text-sm text-red-600">{errors.platform.message}</p>
            )}

            {/* Time Control Section */}
            <div>
              <Label className="mb-2 block text-sm font-medium text-gray-700">
                <Clock className="inline h-4 w-4 mr-1" />
                Time Control (optional)
              </Label>
              <div className="flex gap-2">
                {[
                  { value: 'bullet', label: 'Bullet', icon: '•' },
                  { value: 'blitz', label: 'Blitz', icon: Zap },
                  { value: 'rapid', label: 'Rapid', icon: Hourglass },
                  { value: 'classical', label: 'Classical', icon: Clock3 }
                ].map((tc) => (
                  <Button
                    key={tc.value}
                    type="button"
                    variant="outline"
                    className={cn(
                      'flex h-8 items-center justify-center space-x-2 px-3',
                      selectedTimeControl === tc.value
                        ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                    )}
                    onClick={() => handleTimeControlSelect(tc.value)}
                  >
                    {typeof tc.icon === 'string' ? (
                      <span className="text-sm font-bold">{tc.icon}</span>
                    ) : (
                      <tc.icon className="h-3 w-3" />
                    )}
                    <span className="text-sm">{tc.label}</span>
                  </Button>
                ))}
              </div>
              {errors.timeControl && (
                <p className="mt-1 text-sm text-red-600">{errors.timeControl.message}</p>
              )}
            </div>

            {/* Comments Section */}
            <div>
              <Label htmlFor="gameComments" className="text-sm font-medium text-gray-700">
                Comments (optional)
              </Label>
              <Textarea
                id="gameComments"
                placeholder="Great endgame technique..."
                className="mt-1"
                rows={3}
                {...register('gameComments')}
              />
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
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
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
