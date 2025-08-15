import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
// Dynamic import for firebase-utils to maintain code splitting
import { goalSessionSchema, type GoalSession, type TrainingSession } from '@shared/schema';

interface GoalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSession?: TrainingSession;
  isEditMode?: boolean;
}

export default function GoalModal({
  open,
  onOpenChange,
  editingSession,
  isEditMode = false,
}: GoalModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<GoalSession>({
    resolver: zodResolver(goalSessionSchema),
    defaultValues:
      isEditMode && editingSession
        ? {
            type: 'goal',
            goalTitle: editingSession.goalTitle || '',
            goalDescription: editingSession.goalDescription || '',
          }
        : {
            type: 'goal',
            goalTitle: '',
            goalDescription: '',
          },
  });

  const mutation = useMutation({
    mutationFn: async (data: GoalSession) => {
      const { createSession, updateSession } = await import('@/lib/firebase-utils');
      if (isEditMode && editingSession) {
        return await updateSession(editingSession.id, data);
      }
      return await createSession(data);
    },
    onMutate: async (newSession) => {
      // Close modal immediately for better UX
      onOpenChange(false);
      reset();

      // Show immediate feedback
      toast({
        title: isEditMode ? 'Updating...' : 'Saving...',
        description: `Weekly goal is being ${isEditMode ? 'updated' : 'saved'}`,
      });

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['sessions'] });
      await queryClient.cancelQueries({ queryKey: ['statistics'] });

      // Snapshot previous values
      const previousSessions = queryClient.getQueryData<TrainingSession[]>(['sessions']);
      const previousStats = queryClient.getQueryData(['statistics']);

      if (isEditMode && editingSession) {
        const optimisticSession: TrainingSession = {
          id: editingSession.id,
          type: 'goal',
          date: newSession.date!,
          duration: null,
          pointsGained: null,
          finalScore: null,
          tacticsNotes: null,
          gameResult: null,
          gameType: null,
          gameComments: null,
          playerColor: null,
          platform: null,
          timeControl: null,
          studyType: null,
          studyNotes: null,
          goalTitle: newSession.goalTitle,
          goalDescription: newSession.goalDescription || null,
          goalWeekStart: newSession.goalWeekStart ?? editingSession.goalWeekStart,
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
          type: 'goal',
          date: new Date(),
          duration: null,
          pointsGained: null,
          finalScore: null,
          tacticsNotes: null,
          gameResult: null,
          gameType: null,
          gameComments: null,
          playerColor: null,
          platform: null,
          timeControl: null,
          studyType: null,
          studyNotes: null,
          goalTitle: newSession.goalTitle,
          goalDescription: newSession.goalDescription || null,
          goalWeekStart: newSession.goalWeekStart ?? new Date(),
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
          ? 'Weekly goal updated successfully!'
          : 'Weekly goal set successfully!',
      });

      // Refresh data in background
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-goal'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-activity'] });
    },
    onError: (error: any, _newSession, context) => {
      // Check if it's a timeout error but session might have been saved
      if (error.message?.includes('timeout')) {
        toast({
          title: 'Slow Connection',
          description: 'Goal may have been saved. Please check your activity to confirm.',
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
          description: error.message || 'Failed to set weekly goal',
          variant: 'destructive',
        });
      }
    },
  });

  const onSubmit = (data: GoalSession) => {
    // Add current date and goal week start to the session data
    const sessionData = {
      ...data,
      date: isEditMode && editingSession ? editingSession.date : new Date(),
      goalWeekStart:
        isEditMode && editingSession ? (editingSession.goalWeekStart ?? undefined) : new Date(),
    };
    mutation.mutate(sessionData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mobile-modal sm:max-w-md">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-bold text-gray-800">Set Weekly Goal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto p-2">
            <div>
              <Label htmlFor="goalTitle" className="text-sm font-medium text-gray-700">
                Goal Title
              </Label>
              <Input
                id="goalTitle"
                placeholder="Improve endgame technique"
                className="mt-1"
                {...register('goalTitle')}
                onFocus={(e) => e.target.select()}
              />
              {errors.goalTitle && (
                <p className="mt-1 text-sm text-red-600">{errors.goalTitle.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="goalDescription" className="text-sm font-medium text-gray-700">
                Description (optional)
              </Label>
              <Textarea
                id="goalDescription"
                placeholder="Focus on king and pawn endgames, practice basic techniques..."
                className="mt-1"
                rows={2}
                {...register('goalDescription')}
                onFocus={(e) => e.target.select()}
              />
            </div>
          </div>

          <div className="flex space-x-3 pt-3">
            <Button
              type="button"
              variant="outline"
              className="modal-button flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="modal-button flex-1 bg-purple-600 hover:bg-purple-700"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving...' : 'Set Goal'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
