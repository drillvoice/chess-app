import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
      const response = await apiRequest("POST", "/api/training-sessions/goal", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-goal"] });
      toast({
        title: "Success",
        description: "Weekly goal set successfully!",
      });
      reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set weekly goal",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: GoalSession) => {
    mutation.mutate(data);
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