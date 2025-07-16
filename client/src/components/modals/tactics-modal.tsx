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
import { createSession } from "@/lib/firebase-utils";
import { tacticsSessionSchema, type TacticsSession, type TrainingSession } from "@shared/schema";

interface TacticsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TacticsModal({ open, onOpenChange }: TacticsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<TacticsSession>({
    resolver: zodResolver(tacticsSessionSchema),
    defaultValues: {
      type: "tactics",
      duration: 0,
      pointsGained: 0,
      finalScore: 0,
      tacticsNotes: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: TacticsSession) => {
      return await createSession(data);
    },
    onMutate: async (newSession) => {
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
      // Close modal immediately for better UX
      onOpenChange(false);
      reset();
      
      // Show success notification
      toast({
        title: "Success",
        description: "Tactics session logged successfully!",
      });
      
      // Refresh data in background
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["statistics"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-goal"] });
    },
    onError: (error: any, newSession, context) => {
      // Rollback optimistic updates on error
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-800">
            Log Tactics Session
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="duration" className="text-sm font-medium text-gray-700">
              Duration (minutes)
            </Label>
            <Input
              id="duration"
              type="number"
              placeholder="25"
              className="mt-1"
              {...register("duration", { valueAsNumber: true })}
            />
            {errors.duration && (
              <p className="text-sm text-red-600 mt-1">{errors.duration.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="pointsGained" className="text-sm font-medium text-gray-700">
              Points Gained
            </Label>
            <Input
              id="pointsGained"
              type="number"
              placeholder="+35"
              className="mt-1"
              {...register("pointsGained", { valueAsNumber: true })}
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
              placeholder="2156"
              className="mt-1"
              {...register("finalScore", { valueAsNumber: true })}
            />
            {errors.finalScore && (
              <p className="text-sm text-red-600 mt-1">{errors.finalScore.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="tacticsNotes" className="text-sm font-medium text-gray-700">
              Notes (optional)
            </Label>
            <Textarea
              id="tacticsNotes"
              placeholder="Struggled with knight endgames..."
              className="mt-1"
              rows={3}
              {...register("tacticsNotes")}
            />
          </div>

          <div className="flex space-x-3 pt-4">
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
