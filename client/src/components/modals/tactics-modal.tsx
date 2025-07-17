import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
// Dynamic import for firebase-utils to maintain code splitting
import { tacticsSessionSchema, type TacticsSession, type TrainingSession } from "@shared/schema";

interface TacticsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSession?: TrainingSession;
  isEditMode?: boolean;
}

export default function TacticsModal({ open, onOpenChange, editingSession, isEditMode = false }: TacticsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<TacticsSession>({
    resolver: zodResolver(tacticsSessionSchema),
    defaultValues: isEditMode && editingSession ? {
      type: "tactics",
      duration: editingSession.duration || 0,
      pointsGained: editingSession.pointsGained || 0,
      finalScore: editingSession.finalScore || 0,
      tacticsNotes: editingSession.tacticsNotes || "",
    } : {
      type: "tactics",
      duration: 0,
      pointsGained: 0,
      finalScore: 0,
      tacticsNotes: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: TacticsSession) => {
      const { createSession } = await import("@/lib/firebase-utils");
      return await createSession(data);
    },
    onMutate: async (newSession) => {
      // Close modal immediately for better UX - don't wait for server
      onOpenChange(false);
      reset();
      
      // Show immediate feedback
      toast({
        title: "Saving...",
        description: "Tactics session is being saved",
      });

      // Optimistic update: update caches immediately
      const tempId = Date.now();
      const optimisticSession = {
        ...newSession,
        id: tempId,
        date: new Date()
      };

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["sessions"] });
      await queryClient.cancelQueries({ queryKey: ["statistics"] });

      // Snapshot previous values
      const previousSessions = queryClient.getQueryData<TrainingSession[]>(["sessions"]);
      const previousStats = queryClient.getQueryData(["statistics"]);

      // Optimistically update sessions
      queryClient.setQueryData<TrainingSession[]>(["sessions"], (old = []) => [
        optimisticSession,
        ...old
      ]);

      return { previousSessions, previousStats };
    },
    onSuccess: () => {
      // Show success notification
      toast({
        title: "Success",
        description: "Tactics session logged successfully!",
      });
      
      // Refresh data in background
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["statistics"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-goal"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-activity"] });
    },
    onError: (error: any, newSession, context) => {
      // Check if it's a timeout error but session might have been saved
      if (error.message?.includes('timeout')) {
        toast({
          title: "Slow Connection",
          description: "Session may have been saved. Please check your history to confirm.",
          variant: "destructive",
        });
        // Don't rollback on timeout - session might have been saved
      } else {
        // Rollback optimistic updates on real errors
        if (context?.previousSessions) {
          queryClient.setQueryData(["sessions"], context.previousSessions);
        }
        if (context?.previousStats) {
          queryClient.setQueryData(["statistics"], context.previousStats);
        }
        
        toast({
          title: "Error",
          description: error.message || "Failed to log tactics session",
          variant: "destructive",
        });
      }
    },
  });

  const onSubmit = (data: TacticsSession) => {
    // Add current date to the session data
    const sessionData = {
      ...data,
      date: new Date()
    };
    mutation.mutate(sessionData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-bold text-gray-800">
            Log Tactics Session
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {/* Duration on its own row */}
          <div>
            <Label htmlFor="duration" className="text-sm font-medium text-gray-700">
              Duration (minutes)
            </Label>
            <Input
              id="duration"
              type="number"
              className="mt-1"
              {...register("duration", { valueAsNumber: true })}
              onFocus={(e) => e.target.select()}
            />
            {errors.duration && (
              <p className="text-sm text-red-600 mt-1">{errors.duration.message}</p>
            )}
          </div>

          {/* Points Gained and Final Score on same row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pointsGained" className="text-sm font-medium text-gray-700">
                Points Gained
              </Label>
              <Input
                id="pointsGained"
                type="number"
                className="mt-1"
                {...register("pointsGained", { valueAsNumber: true })}
                onFocus={(e) => e.target.select()}
              />
              {errors.pointsGained && (
                <p className="text-sm text-red-600 mt-1">{errors.pointsGained.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="finalScore" className="text-sm font-medium text-gray-700">
                Final Score
              </Label>
              <Input
                id="finalScore"
                type="number"
                className="mt-1"
                {...register("finalScore", { valueAsNumber: true })}
                onFocus={(e) => e.target.select()}
              />
              {errors.finalScore && (
                <p className="text-sm text-red-600 mt-1">{errors.finalScore.message}</p>
              )}
            </div>
          </div>

          {/* Notes section - more compact */}
          <div>
            <Label htmlFor="tacticsNotes" className="text-sm font-medium text-gray-700">
              Notes (optional)
            </Label>
            <Textarea
              id="tacticsNotes"
              className="mt-1"
              rows={2}
              {...register("tacticsNotes")}
              onFocus={(e) => e.target.select()}
            />
          </div>

          {/* Action buttons */}
          <div className="flex space-x-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#1E40AF] hover:bg-blue-800"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
