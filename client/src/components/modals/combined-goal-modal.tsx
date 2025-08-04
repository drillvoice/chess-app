import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { goalSessionSchema, type GoalSession, type DailyGoal } from "@shared/schema";

interface CombinedGoalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CombinedGoalModal({ open, onOpenChange }: CombinedGoalModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("weekly");
  
  // Daily goal state
  const [selectedGoalType, setSelectedGoalType] = useState<DailyGoal['goalType'] | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);

  // Get current daily goal
  const { data: currentDailyGoal } = useQuery<DailyGoal | null>({
    queryKey: ["daily-goal"],
    queryFn: async () => {
      const { getCurrentDailyGoal } = await import("@/lib/firebase-utils");
      return await getCurrentDailyGoal();
    },
    staleTime: 60000,
  });

  // Weekly goal form
  const weeklyForm = useForm<GoalSession>({
    resolver: zodResolver(goalSessionSchema),
    defaultValues: {
      type: "goal",
      goalTitle: "",
      goalDescription: "",
    },
  });

  // Weekly goal mutation
  const weeklyMutation = useMutation({
    mutationFn: async (data: GoalSession) => {
      const { createSession } = await import("@/lib/firebase-utils");
      return await createSession(data);
    },
    onMutate: async () => {
      onOpenChange(false);
      weeklyForm.reset();
      toast({
        title: "Saving...",
        description: "Weekly goal is being saved",
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Weekly goal set successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["statistics"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-goal"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-activity"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set weekly goal",
        variant: "destructive",
      });
    },
  });

  // Daily goal mutations
  const setDailyGoalMutation = useMutation({
    mutationFn: async (goalData: { goalType: DailyGoal['goalType']; target: number }) => {
      console.log("setDailyGoalMutation mutationFn", goalData);
      const { setDailyGoal } = await import("@/lib/firebase-utils");
      return await setDailyGoal(goalData);
    },
    onMutate: async (goalData: { goalType: DailyGoal['goalType']; target: number }) => {
      console.log("setDailyGoalMutation onMutate", goalData);
      onOpenChange(false);
      setSelectedGoalType(null);
      setSelectedTarget(null);
      toast({
        title: "Saving...",
        description: "Daily goal is being saved",
      });
    },
    onSuccess: (data: unknown) => {
      console.log("setDailyGoalMutation onSuccess", data);
      toast({
        title: "Success",
        description: "Daily goal set successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["daily-goal"] });
      queryClient.invalidateQueries({ queryKey: ["daily-progress"] });
    },
    onError: (error: unknown, goalData: { goalType: DailyGoal['goalType']; target: number }) => {
      console.error("setDailyGoalMutation onError", { error, goalData });
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to set daily goal",
        variant: "destructive",
      });
    },
  });

  const removeDailyGoalMutation = useMutation({
    mutationFn: async () => {
      const { removeDailyGoal } = await import("@/lib/firebase-utils");
      return await removeDailyGoal();
    },
    onMutate: async () => {
      onOpenChange(false);
      toast({
        title: "Removing...",
        description: "Daily goal is being removed",
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Daily goal removed successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["daily-goal"] });
      queryClient.invalidateQueries({ queryKey: ["daily-progress"] });
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to remove daily goal",
        variant: "destructive",
      });
    },
  });

  const onWeeklySubmit = (data: GoalSession) => {
    const sessionData = {
      ...data,
      date: new Date(),
      goalWeekStart: new Date()
    };
    weeklyMutation.mutate(sessionData);
  };

  const handleDailyGoalSubmit = () => {
    if (selectedGoalType && selectedTarget) {
      setDailyGoalMutation.mutate({
        goalType: selectedGoalType,
        target: selectedTarget,
      });
    }
  };

  const handleGoalTypeSelect = (type: DailyGoal['goalType']) => {
    setSelectedGoalType(type);
    setSelectedTarget(null); // Reset target when type changes
  };

  const getTargetOptions = () => {
    if (selectedGoalType === 'games-count') {
      return [1, 2, 3, 5];
    }
    return [10, 15, 30, 60]; // For time-based goals
  };

  const getTargetLabel = (target: number) => {
    if (selectedGoalType === 'games-count') {
      return `${target}`;
    }
    return `${target}m`;
  };

  const getGoalTypeLabel = (type: DailyGoal['goalType']) => {
    switch (type) {
      case 'tactics-time':
        return 'Tactics';
      case 'games-count':
        return 'Games';
      case 'study-time':
        return 'Study';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md mobile-modal">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-bold text-gray-800">
            Set Goal
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="daily">Daily</TabsTrigger>
          </TabsList>

          <TabsContent value="weekly" className="flex-1 mt-3">
            <form onSubmit={weeklyForm.handleSubmit(onWeeklySubmit)} className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto space-y-3 p-2">
                <div>
                  <Label htmlFor="goalTitle" className="text-sm font-medium text-gray-700">
                    Goal Title
                  </Label>
                  <Input
                    id="goalTitle"
                    placeholder="Improve endgame technique"
                    className="mt-1"
                    {...weeklyForm.register("goalTitle")}
                    onFocus={(e) => e.target.select()}
                  />
                  {weeklyForm.formState.errors.goalTitle && (
                    <p className="text-sm text-red-600 mt-1">{weeklyForm.formState.errors.goalTitle.message}</p>
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
                    {...weeklyForm.register("goalDescription")}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 modal-button"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 modal-button"
                  disabled={weeklyMutation.isPending}
                >
                  {weeklyMutation.isPending ? "Saving..." : "Set Goal"}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="daily" className="flex-1 mt-3">
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto space-y-4 p-2">
                {/* Goal Type Selection */}
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">
                    Goal Type
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['tactics-time', 'games-count', 'study-time'] as const).map((type) => (
                      <Button
                        key={type}
                        type="button"
                        variant="outline"
                        className={cn(
                          "p-3 h-auto flex items-center justify-center",
                          selectedGoalType === type
                            ? "bg-[#1E40AF] text-white border-[#1E40AF]"
                            : "hover:bg-gray-50"
                        )}
                        onClick={() => handleGoalTypeSelect(type)}
                      >
                        {getGoalTypeLabel(type)}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Target Selection */}
                {selectedGoalType && (
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-2 block">
                      Target
                    </Label>
                    <div className="grid grid-cols-4 gap-2">
                      {getTargetOptions().map((target) => (
                        <Button
                          key={target}
                          type="button"
                          variant="outline"
                          className={cn(
                            "p-3 h-auto flex items-center justify-center",
                            selectedTarget === target
                              ? "bg-[#1E40AF] text-white border-[#1E40AF]"
                              : "hover:bg-gray-50"
                          )}
                          onClick={() => setSelectedTarget(target)}
                        >
                          {getTargetLabel(target)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Current Daily Goal Display */}
                {currentDailyGoal && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                    <p className="text-sm text-blue-800">
                      <strong>Current Goal:</strong> {getGoalTypeLabel(currentDailyGoal.goalType)} - {getTargetLabel(currentDailyGoal.target)}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex space-x-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 modal-button"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                {currentDailyGoal && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 modal-button text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => removeDailyGoalMutation.mutate()}
                    disabled={removeDailyGoalMutation.isPending}
                  >
                    {removeDailyGoalMutation.isPending ? "Removing..." : "Remove Goal"}
                  </Button>
                )}
                <Button
                  type="button"
                  className="flex-1 bg-[#1E40AF] hover:bg-blue-800 modal-button"
                  onClick={handleDailyGoalSubmit}
                  disabled={!selectedGoalType || !selectedTarget || setDailyGoalMutation.isPending}
                >
                  {setDailyGoalMutation.isPending ? "Saving..." : "Set Goal"}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}