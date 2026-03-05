import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { PromotionPiece } from '@/lib/otb/types';

const OPTIONS: Array<{ label: string; value: PromotionPiece }> = [
  { label: 'Queen', value: 'q' },
  { label: 'Rook', value: 'r' },
  { label: 'Bishop', value: 'b' },
  { label: 'Knight', value: 'n' },
];

interface PromotionPickerProps {
  open: boolean;
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

export default function PromotionPicker({ open, onSelect, onCancel }: PromotionPickerProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Choose promotion</DialogTitle>
          <DialogDescription>Select the piece for this pawn promotion.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {OPTIONS.map((option) => (
            <Button key={option.value} type="button" variant="outline" onClick={() => onSelect(option.value)}>
              {option.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
