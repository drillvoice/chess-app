import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
// Dynamic import for firebase to maintain code splitting
import { studySessionSchema, type StudySession, type TrainingSession } from '@shared/schema';

interface StudyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSession?: TrainingSession;
  isEditMode?: boolean;
}

export default function StudyModal({
  open,
  onOpenChange,
  editingSession,
  isEditMode = false,
}: StudyModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<StudySession>({
    resolver: zodResolver(studySessionSchema),
    defaultValues:
      isEditMode && editingSession
        ? {
            type: 'study',
            duration: editingSession.duration || 0,
            studyType: editingSession.studyType as
              | 'video'
              | 'book'
              | 'analysis'
              | 'chessable'
              | 'coaching'
              | 'online-course'
              | undefined,
            studyNotes: editingSession.studyNotes || '',
          }
        : {
            type: 'study',
            duration: 0,
            studyType: undefined,
            studyNotes: '',
          },
  });

  const mutation = useMutation({
    mutationFn: async (data: StudySession) => {
      const { createSession, updateSession } = await import('@/lib/firebase');
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
        description: `Study session is being ${isEditMode ? 'updated' : 'saved'}`,
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
          type: 'study',
          date: editingSession.date,
          duration: newSession.duration,
          pointsGained: null,
          finalScore: null,
          tacticsNotes: null,
          gameResult: null,
          gameType: null,
          gameComments: null,
          playerColor: null,
          platform: null,
          timeControl: null,
          opponentUsername: null,
          studyType: newSession.studyType || null,
          studyTags: null, // TODO: Will be updated in Chunk 4 to use actual studyTags
          studyNotes: newSession.studyNotes || null,
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
          type: 'study',
          date: new Date(),
          duration: newSession.duration,
          pointsGained: null,
          finalScore: null,
          tacticsNotes: null,
          gameResult: null,
          gameType: null,
          gameComments: null,
          playerColor: null,
          platform: null,
          timeControl: null,
          opponentUsername: null,
          studyType: newSession.studyType || null,
          studyTags: null, // TODO: Will be updated in Chunk 4 to use actual studyTags
          studyNotes: newSession.studyNotes || null,
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
          ? 'Study session updated successfully!'
          : 'Study session logged successfully!',
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
          description: error.message || 'Failed to log study session',
          variant: 'destructive',
        });
      }
    },
  });

  useEffect(() => {
    if (isEditMode && editingSession) {
      setValue('studyType', editingSession.studyType as any, {
        shouldValidate: true,
      });
    }
  }, [editingSession, isEditMode, setValue]);

  const onSubmit = (data: StudySession) => {
    // Add current date to the session data
    const sessionData = {
      ...data,
      date: isEditMode && editingSession ? editingSession.date : new Date(),
    };
    mutation.mutate(sessionData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mobile-modal sm:max-w-md">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-bold text-gray-800">Other study</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto p-2">
            <div>
              <Label htmlFor="studyType" className="text-sm font-medium text-gray-700">
                Study type
              </Label>
              <Select
                value={watch('studyType')}
                onValueChange={(value) =>
                  setValue('studyType', value as any, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select study type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="analysis">Analysis</SelectItem>
                  <SelectItem value="book">Book</SelectItem>
                  <SelectItem value="chessable">Chessable</SelectItem>
                  <SelectItem value="coaching">Coaching session</SelectItem>
                  <SelectItem value="online-course">Online course</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                </SelectContent>
              </Select>
              {errors.studyType && (
                <p className="mt-1 text-sm text-red-600">{errors.studyType.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="duration" className="text-sm font-medium text-gray-700">
                Duration (minutes)
              </Label>
              <Input
                id="duration"
                type="number"
                className="mt-1"
                {...register('duration', { valueAsNumber: true })}
                onFocus={(e) => e.target.select()}
              />
              {errors.duration && (
                <p className="mt-1 text-sm text-red-600">{errors.duration.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="studyNotes" className="text-sm font-medium text-gray-700">
                Notes (optional)
              </Label>
              <Textarea
                id="studyNotes"
                className="mt-1"
                rows={2}
                {...register('studyNotes')}
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
              className="modal-button flex-1 bg-[#F59E0B] hover:bg-amber-600"
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
