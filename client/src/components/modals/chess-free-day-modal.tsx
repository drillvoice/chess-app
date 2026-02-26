import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateUserSettings } from '@/lib/firebase';
import { getChessFreeDayWindow, isDateKeyWithinChessFreeDayWindow } from '@/lib/chess-free-day';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ChessFreeDayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDateKey?: string;
}

export default function ChessFreeDayModal({
  open,
  onOpenChange,
  currentDateKey,
}: ChessFreeDayModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const windowRange = getChessFreeDayWindow();

  const resolveInitialDateKey = () =>
    currentDateKey && isDateKeyWithinChessFreeDayWindow(currentDateKey)
      ? currentDateKey
      : windowRange.minDateKey;

  const [selectedDateKey, setSelectedDateKey] = useState(resolveInitialDateKey);

  useEffect(() => {
    if (!open) return;
    setSelectedDateKey(resolveInitialDateKey());
  }, [open, currentDateKey, windowRange.minDateKey]);

  const mutation = useMutation({
    mutationFn: async (dateKey: string) => updateUserSettings({ chessFreeDayDate: dateKey }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      toast({
        title: 'Chess free day saved',
        description: 'Your rest day has been scheduled for this week.',
      });
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to save CFD',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isDateKeyWithinChessFreeDayWindow(selectedDateKey)) {
      toast({
        title: 'Invalid date',
        description: 'Please choose a date between today and the next 7 days.',
        variant: 'destructive',
      });
      return;
    }
    mutation.mutate(selectedDateKey);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mobile-modal sm:max-w-sm">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-bold text-gray-800">
            Choose chess free day
          </DialogTitle>
          <DialogDescription>Choose any date from today through the next 7 days.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="cfd-date" className="text-sm font-medium text-gray-700">
              Rest day
            </Label>
            <Input
              id="cfd-date"
              type="date"
              min={windowRange.minDateKey}
              max={windowRange.maxDateKey}
              value={selectedDateKey}
              onChange={(e) => setSelectedDateKey(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="flex space-x-3">
            <Button
              type="button"
              variant="outline"
              className="modal-button flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="modal-button flex-1 bg-slate-700 hover:bg-slate-800"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving...' : 'Save CFD'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
