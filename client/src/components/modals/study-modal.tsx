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
import { apiRequest } from "@/lib/queryClient";
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
      const response = await apiRequest("POST", "/api/training-sessions/study", data);
      return response.json();
    },
    onSuccess: () => {
      // Add a small delay to ensure data is saved before invalidating cache
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/training-sessions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      }, 100);
      toast({
        title: "Success",
        description: "Study session logged successfully!",
      });
      reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to log study session",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: StudySession) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-800">
            Log Study Session
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="studyType" className="text-sm font-medium text-gray-700">
              Study Type
            </Label>
            <Select onValueChange={(value) => setValue("studyType", value as any)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select study type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="book">Book</SelectItem>
                <SelectItem value="analysis">Analysis</SelectItem>
                <SelectItem value="chessable">Chessable</SelectItem>
                <SelectItem value="coaching">Coaching session</SelectItem>
                <SelectItem value="online-course">Online course</SelectItem>
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
              placeholder="45"
              className="mt-1"
              {...register("duration", { valueAsNumber: true })}
            />
            {errors.duration && (
              <p className="text-sm text-red-600 mt-1">{errors.duration.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="studyNotes" className="text-sm font-medium text-gray-700">
              Notes
            </Label>
            <Textarea
              id="studyNotes"
              placeholder="Learned about Caro-Kann defense..."
              className="mt-1"
              rows={3}
              {...register("studyNotes")}
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
              className="flex-1 bg-[#F59E0B] hover:bg-amber-600"
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
