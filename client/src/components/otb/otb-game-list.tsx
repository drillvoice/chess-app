import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OtbGame } from '@/lib/otb/types';

interface OtbGameListProps {
  games: OtbGame[];
  activeGameId: string | null;
  onSelectGame: (id: string) => void;
  onDeleteGame: (id: string) => void;
}

export default function OtbGameList({
  games,
  activeGameId,
  onSelectGame,
  onDeleteGame,
}: OtbGameListProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <h3 className="mb-2 font-semibold text-gray-800">Saved OTB Games</h3>
      {games.length === 0 ? (
        <p className="text-sm text-gray-500">No saved games.</p>
      ) : (
        <div className="space-y-2">
          {games.map((game) => {
            const title =
              game.whiteName.trim() || game.blackName.trim()
                ? `${game.whiteName.trim() || 'White'} vs ${game.blackName.trim() || 'Black'}`
                : 'Untitled game';
            return (
              <div
                key={game.id}
                className={cn(
                  'flex items-center justify-between rounded-md border p-2',
                  game.id === activeGameId ? 'border-blue-400 bg-blue-50' : 'border-gray-200',
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelectGame(game.id)}
                >
                  <p className="truncate text-sm font-medium text-gray-800">{title}</p>
                  <p className="text-xs text-gray-500">
                    {game.moves.length} ply • {format(new Date(game.updatedAt), 'd MMM yyyy')}
                  </p>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDeleteGame(game.id)}
                  aria-label="Delete OTB game"
                >
                  Delete
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
