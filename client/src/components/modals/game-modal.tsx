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
import { apiRequest } from "@/lib/queryClient";
import { gameSessionSchema, type GameSession } from "@shared/schema";
import { Trophy, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GameModal({ open, onOpenChange }: GameModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedResult, setSelectedResult] = useState<"win" | "loss" | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<GameSession>({
    resolver: zodResolver(gameSessionSchema),
    defaultValues: {
      type: "game",
      gameResult: undefined,
      gameType: undefined,
      gameComments: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: GameSession) => {
      const response = await apiRequest("POST", "/api/training-sessions/game", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      toast({
        title: "Success",
        description: "Game session logged successfully!",
      });
      reset();
      setSelectedResult(null);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to log game session",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: GameSession) => {
    mutation.mutate(data);
  };

  const handleResultSelect = (result: "win" | "loss") => {
    setSelectedResult(result);
    setValue("gameResult", result);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-800">
            Log Game
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              Result
            </Label>
            <div className="grid grid-cols-2 gap-3">
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
            <Label htmlFor="gameType" className="text-sm font-medium text-gray-700">
              Game Type
            </Label>
            <Select onValueChange={(value) => setValue("gameType", value as any)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select game type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blitz">Blitz</SelectItem>
                <SelectItem value="rapid">Rapid</SelectItem>
                <SelectItem value="classical">Classical</SelectItem>
                <SelectItem value="bullet">Bullet</SelectItem>
              </SelectContent>
            </Select>
            {errors.gameType && (
              <p className="text-sm text-red-600 mt-1">{errors.gameType.message}</p>
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
              className="flex-1 bg-[#059669] hover:bg-emerald-700"
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
