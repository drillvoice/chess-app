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
import { goalSessionSchema, type GoalSession } from "@shared/schema";

interface GoalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GoalModal({ open, onOpenChange }: GoalModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<GoalSession>({
    resolver: zodResolver(goalSessionSchema),
    defaultValues: {
      type: "goal",
      goalTitle: "",
      goalDescription: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: GoalSession) => {
      return await createSession(data);
    },
    onMutate: async () => {
      // Close modal immediately for better UX
      onOpenChange(false);
      reset();
      
      // Show immediate feedback
      toast({
        title: "Saving...",
        description: "Weekly goal is being saved",
      });
    },
    onSuccess: () => {
      // Show success notification
      toast({
        title: "Success",
        description: "Weekly goal set successfully!",
      });
      
      // Refresh data in background
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["statistics"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-goal"] });
    },
    onError: (error: any) => {
      // Check if it's a timeout error but session might have been saved
      if (error.message?.includes('timeout')) {
        toast({
          title: "Slow Connection",
          description: "Goal may have been saved. Please check your history to confirm.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to set weekly goal",
          variant: "destructive",
        });
      }
    },
  });

  const onSubmit = (data: GoalSession) => {
    // Add current date and goal week start to the session data
    const sessionData = {
      ...data,
      date: new Date(),
      goalWeekStart: new Date()
    };
    mutation.mutate(sessionData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-800">
            Set Weekly Goal
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="goalTitle" className="text-sm font-medium text-gray-700">
              Goal Title
            </Label>
            <Input
              id="goalTitle"
              placeholder="Improve endgame technique"
              className="mt-1"
              {...register("goalTitle")}
            />
            {errors.goalTitle && (
              <p className="text-sm text-red-600 mt-1">{errors.goalTitle.message}</p>
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
              rows={4}
              {...register("goalDescription")}
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
              className="flex-1 bg-purple-600 hover:bg-purple-700"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Saving..." : "Set Goal"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}