import { BookOpen, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { OpeningRepertoire, RepertoireReviewSummary } from '@/lib/opening-trainer/types';
import { formatRelativeDue } from './format-relative-due';

interface RepertoireListProps {
  repertoires: OpeningRepertoire[];
  reviewSummaries: Map<string, RepertoireReviewSummary>;
  activeRepertoireId: string | null;
  onTrain: (repertoire: OpeningRepertoire) => void;
  onEditLines: (repertoireId: string) => void;
  onDelete: (repertoireId: string) => void;
}

export function RepertoireList({
  repertoires,
  reviewSummaries,
  activeRepertoireId,
  onTrain,
  onEditLines,
  onDelete,
}: RepertoireListProps) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-gray-600" />
          <h3 className="text-base font-semibold text-gray-800">Repertoires</h3>
        </div>
        {repertoires.length === 0 ? (
          <p className="text-sm text-gray-500">No repertoires imported yet.</p>
        ) : (
          <div className="space-y-2">
            {repertoires.map((repertoire) => {
              const summary = reviewSummaries.get(repertoire.id);
              return (
                <div key={repertoire.id} className="rounded-md border border-gray-200 p-3">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => onTrain(repertoire)}
                  >
                    <span className="block text-sm font-medium text-gray-800">
                      {repertoire.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {repertoire.side === 'white' ? 'White' : 'Black'} • {summary?.totalLines ?? 0}{' '}
                      line
                      {(summary?.totalLines ?? 0) === 1 ? '' : 's'}
                      {' • '}
                      {summary && summary.dueMoves > 0 ? (
                        <span className="font-medium text-blue-700">
                          {summary.dueMoves} move{summary.dueMoves === 1 ? '' : 's'} due
                        </span>
                      ) : (
                        <span className="text-green-700">
                          All reviewed
                          {summary?.nextDueAt
                            ? ` · next in ${formatRelativeDue(summary.nextDueAt)}`
                            : ''}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={activeRepertoireId === repertoire.id ? 'default' : 'outline'}
                      onClick={() => onTrain(repertoire)}
                    >
                      Train
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onEditLines(repertoire.id)}
                      aria-label={`Edit lines in ${repertoire.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onDelete(repertoire.id)}
                      aria-label={`Delete ${repertoire.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
