import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
// Dynamic import for firebase-utils to maintain code splitting
import { gameSessionSchema, type GameSession, type TrainingSession } from "@shared/schema";
import { Trophy, X, Clock, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface GameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSession?: TrainingSession;
  isEditMode?: boolean;
}

export default function GameModal({ open, onOpenChange, editingSession, isEditMode = false }: GameModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedResult, setSelectedResult] = useState<"win" | "loss" | "draw" | null>(null);
  const [selectedColor, setSelectedColor] = useState<"white" | "black" | null>(null);
  const [selectedTimeControl, setSelectedTimeControl] = useState<string | null>(null);

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
      defaultValues: isEditMode && editingSession ? {
        type: "game",
        gameResult: editingSession.gameResult as "win" | "loss" | "draw" | undefined,
        gameComments: editingSession.gameComments || "",
        playerColor: editingSession.playerColor as "white" | "black" | undefined,
        platform: editingSession.platform as "lichess" | "chess.com" | "otb" | undefined,
        timeControl: editingSession.timeControl as "5+3" | "10+5" | "10" | "15+10" | undefined,
      } : {
      type: "game",
      gameResult: undefined,
      gameComments: "",
      playerColor: undefined,
      platform: undefined,
      timeControl: undefined,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: GameSession) => {
      const { createSession, updateSession } = await import("@/lib/firebase-utils");
      if (isEditMode && editingSession) {
        return await updateSession(editingSession.id, data);
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

      // Show immediate feedback
      toast({
        title: isEditMode ? "Updating..." : "Saving...",
        description: `Game session is being ${isEditMode ? "updated" : "saved"}`,
      });

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["sessions"] });
      await queryClient.cancelQueries({ queryKey: ["statistics"] });

      // Snapshot previous values
      const previousSessions = queryClient.getQueryData<TrainingSession[]>(["sessions"]);
      const previousStats = queryClient.getQueryData(["statistics"]);

      // Prepare optimistic session
      if (isEditMode && editingSession) {
        const optimisticSession: TrainingSession = {
          id: editingSession.id,
          type: "game",
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

        queryClient.setQueryData<TrainingSession[]>(["sessions"], (old = []) =>
          old.map((session) => (session.id === editingSession.id ? optimisticSession : session))
        );

        return { previousSessions, previousStats };
      } else {
        const tempId = Date.now();
        const optimisticSession: TrainingSession = {
          id: tempId,
          type: "game",
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

        queryClient.setQueryData<TrainingSession[]>(["sessions"], (old = []) => [
          optimisticSession,
          ...old,
        ]);

        return { previousSessions, previousStats };
      }
    },
    onSuccess: () => {
      // Show success notification
      toast({
        title: "Success",
        description: isEditMode ? "Game session updated successfully!" : "Game session logged successfully!",
      });

      // Refresh data in background
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["statistics"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-goal"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-activity"] });
    },
    onError: (error: any, _newSession, context) => {
      // Check if it's a timeout error but session might have been saved
      if (error.message?.includes('timeout')) {
        toast({
          title: "Slow Connection",
          description: "Session may have been saved. Please check your activity to confirm.",
          variant: "destructive",
        });
      } else {
        if (context?.previousSessions) {
          queryClient.setQueryData(["sessions"], context.previousSessions);
        }
        if (context?.previousStats) {
          queryClient.setQueryData(["statistics"], context.previousStats);
        }
        toast({
          title: "Error",
          description: error.message || "Failed to log game session",
          variant: "destructive",
        });
      }
    },
  });

  const onSubmit = (data: GameSession) => {
    // Add current date to the session data
    const sessionData = {
      ...data,
      date: isEditMode && editingSession ? editingSession.date : new Date()
    };
    mutation.mutate(sessionData);
  };

  const handleResultSelect = (result: "win" | "loss" | "draw") => {
    setSelectedResult(result);
    setValue("gameResult", result, { shouldValidate: true });
    trigger("gameResult");
  };

  const handleColorSelect = (color: "white" | "black") => {
    setSelectedColor(color);
    setValue("playerColor", color, { shouldValidate: true });
    trigger("playerColor");
  };

  const handleTimeControlSelect = (timeControl: string) => {
    if (selectedTimeControl === timeControl) {
      // Deselect if clicking the same time control
      setSelectedTimeControl(null);
      setValue("timeControl", undefined, { shouldValidate: true });
    } else {
      setSelectedTimeControl(timeControl);
      setValue("timeControl", timeControl as any, { shouldValidate: true });
    }
    trigger("timeControl");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md mobile-modal">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xl font-bold text-gray-800">
            Log Game
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto space-y-4 p-2">
            <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              Colour
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "p-3 h-auto flex items-center justify-center space-x-2",
                  selectedColor === "white"
                    ? "border-gray-800 bg-gray-100 text-gray-800 ring-2 ring-gray-800"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                )}
                onClick={() => handleColorSelect("white")}
              >
                <Square className="w-4 h-4 fill-white stroke-gray-800" />
                <span>White</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "p-3 h-auto flex items-center justify-center space-x-2",
                  selectedColor === "black"
                    ? "border-gray-800 bg-gray-800 text-white ring-2 ring-gray-800"
                    : "border-gray-300 bg-gray-800 text-white hover:bg-gray-700"
                )}
                onClick={() => handleColorSelect("black")}
              >
                <Square className="w-4 h-4 fill-gray-800" />
                <span>Black</span>
              </Button>
            </div>
            {errors.playerColor && (
              <p className="text-sm text-red-600 mt-1">{errors.playerColor.message}</p>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              Result
            </Label>
            <div className="grid grid-cols-3 gap-3">
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "p-3 h-auto flex items-center justify-center space-x-2",
                  selectedResult === "win"
                    ? "border-green-500 bg-green-50 text-green-800 ring-2 ring-green-500"
                    : "border-green-300 bg-green-50 text-green-800 hover:bg-green-100"
                )}
                onClick={() => handleResultSelect("win")}
              >
                <Trophy className="w-4 h-4" />
                <span>Win</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "p-3 h-auto flex items-center justify-center space-x-2",
                  selectedResult === "draw"
                    ? "border-gray-500 bg-gray-50 text-gray-800 ring-2 ring-gray-500"
                    : "border-gray-300 bg-gray-50 text-gray-800 hover:bg-gray-100"
                )}
                onClick={() => handleResultSelect("draw")}
              >
                <Square className="w-4 h-4" />
                <span>Draw</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "p-3 h-auto flex items-center justify-center space-x-2",
                  selectedResult === "loss"
                    ? "border-red-500 bg-red-50 text-red-800 ring-2 ring-red-500"
                    : "border-red-300 bg-red-50 text-red-800 hover:bg-red-100"
                )}
                onClick={() => handleResultSelect("loss")}
              >
                <X className="w-4 h-4" />
                <span>Loss</span>
              </Button>
            </div>
            {errors.gameResult && (
              <p className="text-sm text-red-600 mt-1">{errors.gameResult.message}</p>
            )}
          </div>



          <div>
            <Label htmlFor="platform" className="text-sm font-medium text-gray-700">
              Platform (optional)
            </Label>
            <Select onValueChange={(value) => setValue("platform", value as any)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lichess">Lichess</SelectItem>
                <SelectItem value="chess.com">Chess.com</SelectItem>
                <SelectItem value="otb">Over the Board</SelectItem>
              </SelectContent>
            </Select>
            {errors.platform && (
              <p className="text-sm text-red-600 mt-1">{errors.platform.message}</p>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              Time Control (optional)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {["5+3", "10+5", "10", "15+10"].map((tc) => (
                <Button
                  key={tc}
                  type="button"
                  variant="outline"
                  className={cn(
                    "p-2 h-auto flex items-center justify-center space-x-1",
                    selectedTimeControl === tc
                      ? "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  )}
                  onClick={() => handleTimeControlSelect(tc)}
                >
                  <Clock className="w-3 h-3" />
                  <span className="text-sm">{tc}</span>
                </Button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">Click to select, click again to deselect</p>
            {errors.timeControl && (
              <p className="text-sm text-red-600 mt-1">{errors.timeControl.message}</p>
            )}
          </div>

            <div>
              <Label htmlFor="gameComments" className="text-sm font-medium text-gray-700">
                Comments (optional)
              </Label>
              <Textarea
                id="gameComments"
                placeholder="Great endgame technique..."
                className="mt-1"
                rows={3}
                {...register("gameComments")}
              />
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
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
              className="flex-1 bg-[#059669] hover:bg-emerald-700 modal-button"
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
