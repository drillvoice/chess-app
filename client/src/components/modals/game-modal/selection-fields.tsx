import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Trophy, X, Square, Zap, Hourglass, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FieldProps<T> {
  selected: T | null;
  onSelect: (value: T) => void;
  error?: string;
}

function FieldError({ error }: { error?: string }) {
  return error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null;
}

/** White/Black colour picker. */
export function ColorField({ selected, onSelect, error }: FieldProps<'white' | 'black'>) {
  return (
    <div>
      <Label className="mb-2 block text-sm font-medium text-gray-700">Colour</Label>
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          className={cn(
            'flex h-auto items-center justify-center space-x-2 px-3 py-2',
            selected === 'white'
              ? 'border-gray-600 bg-gray-100 text-gray-800 ring-2 ring-gray-600'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
          )}
          onClick={() => onSelect('white')}
        >
          <Square className="h-4 w-4 fill-white stroke-gray-800" />
          <span>White</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'flex h-auto items-center justify-center space-x-2 px-3 py-2',
            selected === 'black'
              ? 'border-gray-600 bg-gray-200 text-gray-800 ring-2 ring-gray-600'
              : 'border-gray-300 bg-gray-800 text-white hover:bg-gray-700',
          )}
          onClick={() => onSelect('black')}
        >
          <Square className="h-4 w-4 fill-gray-800" />
          <span>Black</span>
        </Button>
      </div>
      <FieldError error={error} />
    </div>
  );
}

/** Win/Draw/Loss result picker. */
export function ResultField({ selected, onSelect, error }: FieldProps<'win' | 'loss' | 'draw'>) {
  return (
    <div>
      <Label className="mb-2 block text-sm font-medium text-gray-700">Result</Label>
      <div className="grid grid-cols-3 gap-3">
        <Button
          type="button"
          variant="outline"
          className={cn(
            'flex h-auto items-center justify-center space-x-2 px-3 py-2',
            selected === 'win'
              ? 'border-green-600 bg-green-100 text-green-800 ring-2 ring-green-600'
              : 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100',
          )}
          onClick={() => onSelect('win')}
        >
          <Trophy className="h-4 w-4" />
          <span>Win</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'flex h-auto items-center justify-center space-x-2 px-3 py-2',
            selected === 'draw'
              ? 'border-gray-600 bg-gray-100 text-gray-800 ring-2 ring-gray-600'
              : 'border-gray-300 bg-gray-50 text-gray-800 hover:bg-gray-100',
          )}
          onClick={() => onSelect('draw')}
        >
          <Square className="h-4 w-4" />
          <span>Draw</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'flex h-auto items-center justify-center space-x-2 px-3 py-2',
            selected === 'loss'
              ? 'border-red-600 bg-red-100 text-red-800 ring-2 ring-red-600'
              : 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100',
          )}
          onClick={() => onSelect('loss')}
        >
          <X className="h-4 w-4" />
          <span>Loss</span>
        </Button>
      </div>
      <FieldError error={error} />
    </div>
  );
}

const TIME_CONTROLS = [
  { value: 'bullet', label: 'Bullet', icon: '•' },
  { value: 'blitz', label: 'Blitz', icon: Zap },
  { value: 'rapid', label: 'Rapid', icon: Hourglass },
  { value: 'classical', label: 'Classical', icon: Clock3 },
] as const;

/** Bullet/Blitz/Rapid/Classical time control picker (toggleable). */
export function TimeControlField({ selected, onSelect, error }: FieldProps<string>) {
  return (
    <div>
      <Label className="mb-2 block text-sm font-medium text-gray-700">Time control</Label>
      <div className="grid grid-cols-4 gap-2">
        {TIME_CONTROLS.map((tc) => (
          <Button
            key={tc.value}
            type="button"
            variant="outline"
            className={cn(
              'flex h-auto min-h-[40px] min-w-0 items-center justify-center gap-1 whitespace-normal px-1.5 py-1.5 text-center leading-tight',
              selected === tc.value
                ? 'border-blue-600 bg-blue-100 text-blue-800 ring-2 ring-blue-600'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
            )}
            onClick={() => onSelect(tc.value)}
          >
            {typeof tc.icon === 'string' ? (
              <span className="text-sm font-bold">{tc.icon}</span>
            ) : (
              <tc.icon className="h-3 w-3" />
            )}
            <span className="text-sm">{tc.label}</span>
          </Button>
        ))}
      </div>
      <FieldError error={error} />
    </div>
  );
}

const PLATFORMS = [
  { value: 'lichess', label: 'Lichess' },
  { value: 'chess.com', label: 'Chess.com' },
  { value: 'otb', label: 'Over the Board' },
] as const;

/** Lichess/Chess.com/OTB platform picker (toggleable). */
export function PlatformField({
  selected,
  onSelect,
  error,
}: FieldProps<'lichess' | 'chess.com' | 'otb'>) {
  return (
    <div>
      <Label className="mb-2 block text-sm font-medium text-gray-700">Platform</Label>
      <div className="grid grid-cols-3 gap-2">
        {PLATFORMS.map((platform) => (
          <Button
            key={platform.value}
            type="button"
            variant="outline"
            className={cn(
              'flex h-auto min-h-[40px] min-w-0 items-center justify-center gap-1 whitespace-normal px-1.5 py-1.5 text-center leading-tight',
              selected === platform.value
                ? 'border-blue-600 bg-blue-100 text-blue-800 ring-2 ring-blue-600'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
            )}
            onClick={() => onSelect(platform.value)}
          >
            <span>{platform.label}</span>
          </Button>
        ))}
      </div>
      <FieldError error={error} />
    </div>
  );
}
