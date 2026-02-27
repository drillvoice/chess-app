import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { TagManager } from '@/components/ui/tag-manager';
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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<StudySession>({
    resolver: zodResolver(studySessionSchema),
    defaultValues:
      isEditMode && editingSession
        ? {
            type: 'study',
            duration: editingSession.duration || 0,
            studyTags: editingSession.studyTags ? JSON.parse(editingSession.studyTags) : [],
            studyNotes: editingSession.studyNotes || '',
          }
        : {
            type: 'study',
            duration: 0,
            studyTags: [],
            studyNotes: '',
          },
  });

  const mutation = useMutation({
    mutationFn: async (data: StudySession) => {
      const { createSession, updateSession } = await import('@/lib/firebase');
      if (isEditMode && editingSession) {
        return await updateSession(editingSession.id, data as any);
      }
      return await createSession(data as any);
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

      // Don't block save on query cancellation; fire-and-forget keeps the UI responsive.
      void queryClient.cancelQueries({ queryKey: ['sessions'] });
      void queryClient.cancelQueries({ queryKey: ['statistics'] });

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
          puzzlesAttempted: null,
          puzzlesCorrect: null,
          tacticsNotes: null,
          gameResult: null,
          gameType: null,
          gameComments: null,
          playerColor: null,
          platform: null,
          timeControl: null,
          opponentUsername: null,
          studyType: newSession.studyType || null,
          studyTags: JSON.stringify(selectedTags),
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
        // Add a temporary "saving" session that will be replaced when the real session is created
        const tempId = -Date.now(); // Use negative ID to distinguish from real sessions
        const optimisticSession: TrainingSession = {
          id: tempId,
          type: 'study',
          date: new Date(),
          duration: newSession.duration,
          pointsGained: null,
          finalScore: null,
          puzzlesAttempted: null,
          puzzlesCorrect: null,
          tacticsNotes: null,
          gameResult: null,
          gameType: null,
          gameComments: null,
          playerColor: null,
          platform: null,
          timeControl: null,
          opponentUsername: null,
          studyType: newSession.studyType || null,
          studyTags: JSON.stringify(selectedTags),
          studyNotes: newSession.studyNotes || null,
          goalTitle: null,
          goalDescription: null,
          goalWeekStart: null,
          needsReview: false,
          // Add a flag to identify this as a pending session
          _pending: true,
        } as any;

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
          ? 'Study session updated successfully!'
          : 'Study session logged successfully!',
      });

      // Refresh data to show the real session
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-goal'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-activity'] });
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
          description: error.message || 'Failed to log study session',
          variant: 'destructive',
        });
      }
    },
  });

  useEffect(() => {
    if (isEditMode && editingSession) {
      // Set selected tags from editing session
      const tags = editingSession.studyTags ? JSON.parse(editingSession.studyTags) : [];
      setSelectedTags(tags);
    } else {
      // Reset selected tags for new sessions
      setSelectedTags([]);
    }
  }, [editingSession, isEditMode]);

  // Reset form and tags when modal closes
  useEffect(() => {
    if (!open) {
      reset();
      setSelectedTags([]);
    }
  }, [open, reset]);

  const onSubmit = (data: StudySession) => {
    // Add current date and selected tags to the session data
    const sessionData = {
      ...data,
      studyTags: selectedTags,
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
            <TagManager
              selectedTags={selectedTags}
              onTagsChange={setSelectedTags}
              label="Study tags"
              placeholder="Add a study tag..."
            />

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
                Notes
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
