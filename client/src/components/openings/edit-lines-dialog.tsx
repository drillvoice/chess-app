import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import type { OpeningRepertoire } from '@/lib/opening-trainer/types';
import type { ManagedLine } from '@/hooks/use-line-management';

interface EditLinesDialogProps {
  managingRepertoire: OpeningRepertoire | null;
  managedLines: ManagedLine[];
  onClose: () => void;
  onToggleLine: (leafId: string, paused: boolean) => void;
  onDeleteLine: (leafId: string, label: string) => void;
}

export function EditLinesDialog({
  managingRepertoire,
  managedLines,
  onClose,
  onToggleLine,
  onDeleteLine,
}: EditLinesDialogProps) {
  return (
    <Dialog open={Boolean(managingRepertoire)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit lines{managingRepertoire ? ` — ${managingRepertoire.name}` : ''}
          </DialogTitle>
          <DialogDescription>
            Pause a line to keep it but stop training it, or delete it to remove it for good.
          </DialogDescription>
        </DialogHeader>
        {managedLines.length === 0 ? (
          <p className="text-sm text-gray-500">This repertoire has no lines.</p>
        ) : (
          <ul className="space-y-2">
            {managedLines.map((line) => (
              <li
                key={line.leafId}
                className="flex items-center justify-between gap-3 rounded-md border border-gray-200 p-3"
              >
                <div className="min-w-0">
                  {line.name ? (
                    <>
                      <p
                        className={`break-words text-sm font-medium ${line.paused ? 'text-gray-400' : 'text-gray-800'}`}
                      >
                        {line.name}
                      </p>
                      <p
                        className={`mt-0.5 break-words font-mono text-xs ${line.paused ? 'text-gray-400' : 'text-gray-500'}`}
                      >
                        {line.moves}
                      </p>
                    </>
                  ) : (
                    <p
                      className={`break-words font-mono text-sm ${line.paused ? 'text-gray-400' : 'text-gray-800'}`}
                    >
                      {line.moves}
                    </p>
                  )}
                  {line.paused && (
                    <Badge variant="outline" className="mt-1 text-amber-700">
                      Paused
                    </Badge>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Switch
                    checked={!line.paused}
                    onCheckedChange={(checked) => onToggleLine(line.leafId, !checked)}
                    aria-label={line.paused ? 'Activate line' : 'Pause line'}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onDeleteLine(line.leafId, line.name ?? line.moves)}
                    aria-label={`Delete line ${line.name ?? line.moves}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
