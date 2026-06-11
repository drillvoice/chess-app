import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'tactics', label: 'Tactics' },
  { value: 'game', label: 'Games' },
  { value: 'study', label: 'Study' },
  { value: 'goal', label: 'Goals' },
] as const;

export function SessionFilterBar({
  filter,
  onFilterChange,
}: {
  filter: string;
  onFilterChange: (filter: string) => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {FILTER_OPTIONS.map(({ value, label }) => (
        <Button
          key={value}
          variant={filter === value ? 'default' : 'secondary'}
          size="sm"
          aria-pressed={filter === value}
          onClick={() => onFilterChange(value)}
          className={cn(
            filter === value
              ? 'bg-[#1E40AF] text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
          )}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
