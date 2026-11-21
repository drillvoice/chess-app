import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZES = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-8 w-8' } as const;

/** Three stars, the first `stars` filled. */
export function StarRow({ stars, size = 'md' }: { stars: number; size?: keyof typeof SIZES }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 align-middle"
      aria-label={`${stars} of 3 stars`}
    >
      {[1, 2, 3].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn(
            SIZES[size],
            n <= stars ? 'fill-amber-400 text-amber-500' : 'fill-transparent text-gray-300',
          )}
        />
      ))}
    </span>
  );
}
