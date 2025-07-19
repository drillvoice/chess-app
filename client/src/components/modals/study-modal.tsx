import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
// Dynamic import for firebase-utils to maintain code splitting
import { studySessionSchema, type StudySession } from "@shared/schema";

interface StudyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function StudyModal({ open, onOpenChange }: StudyModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<StudySession>({
    resolver: zodResolver(studySessionSchema),
    defaultValues: {
      type: "study",
      duration: 0,
      studyType: undefined,
      studyNotes: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: StudySession) => {
      const { createSession } = await import("@/lib/firebase-utils");
      return await createSession(data);
    },
    onMutate: async () => {
      // Close modal immediately for better UX
      onOpenChange(false);
      reset();
      
      // Show immediate feedback
      toast({
        title: "Saving...",
        description: "Study session is being saved",
      });
    },
    onSuccess: () => {
      // Show success notification
      toast({
        title: "Success",
        description: "Study session logged successfully!",
      });
      
      // Refresh data in background
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["statistics"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-goal"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-activity"] });
    },
    onError: (error: any) => {
      // Check if it's a timeout error but session might have been saved
      if (error.message?.includes('timeout')) {
        toast({
          title: "Slow Connection",
          description: "Session may have been saved. Please check your history to confirm.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to log study session",
          variant: "destructive",
        });
      }
    },
  });

  const onSubmit = (data: StudySession) => {
    // Add current date to the session data
    const sessionData = {
      ...data,
      date: new Date()
    };
    mutation.mutate(sessionData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[70vh] overflow-y-auto mx-4 max-w-[calc(100vw-2rem)] mobile-modal">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-bold text-gray-800">
            Log Study Session
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label htmlFor="studyType" className="text-sm font-medium text-gray-700">
              Study Type
            </Label>
            <Select onValueChange={(value) => setValue("studyType", value as any)}>
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
              <p className="text-sm text-red-600 mt-1">{errors.studyType.message}</p>
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
              {...register("duration", { valueAsNumber: true })}
              onFocus={(e) => e.target.select()}
            />
            {errors.duration && (
              <p className="text-sm text-red-600 mt-1">{errors.duration.message}</p>
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
              {...register("studyNotes")}
              onFocus={(e) => e.target.select()}
            />
          </div>

          <div className="flex space-x-3 pt-2">
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
              className="flex-1 bg-[#F59E0B] hover:bg-amber-600 modal-button"
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
