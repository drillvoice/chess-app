import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { tacticsSessionSchema, type TacticsSession } from "@shared/schema";

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
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: TacticsSession) => {
      const response = await apiRequest("POST", "/api/training-sessions/tactics", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      toast({
        title: "Success",
        description: "Tactics session logged successfully!",
      });
      reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to log tactics session",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TacticsSession) => {
    mutation.mutate(data);
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
