import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

interface DatePopoverProps {
  selectedDate: Date;
  dateInput: string;
  onDateInputChange: (value: string) => void;
}

/** Session-date button + popover with a native date input (max = today). */
export function DatePopover({ selectedDate, dateInput, onDateInputChange }: DatePopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="absolute left-0 top-1/2 h-auto -translate-y-1/2 px-2 py-1 text-sm font-normal"
          type="button"
        >
          {format(selectedDate, 'EEE d MMM')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <input
          aria-label="Select date"
          type="date"
          className="rounded border p-1 text-sm"
          max={format(new Date(), 'yyyy-MM-dd')}
          value={dateInput}
          onChange={(e) => onDateInputChange(e.target.value)}
        />
      </PopoverContent>
    </Popover>
  );
}
