import { ChevronDown, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { OpeningRepertoire } from '@/lib/opening-trainer/types';
import type { UseOpeningImportResult } from '@/hooks/use-opening-import';

interface ImportPgnPanelProps {
  importHook: UseOpeningImportResult;
  repertoires: OpeningRepertoire[];
}

export function ImportPgnPanel({ importHook, repertoires }: ImportPgnPanelProps) {
  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 p-4"
        onClick={() => importHook.setIsImportPgnOpen((open) => !open)}
        aria-expanded={importHook.isImportPgnOpen}
      >
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-gray-600" />
          <h3 className="text-base font-semibold text-gray-800">Import PGN</h3>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${importHook.isImportPgnOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {importHook.isImportPgnOpen && (
        <CardContent className="space-y-3 px-4 pb-4 pt-0">
          {repertoires.length > 0 && (
            <div>
              <Label htmlFor="importTarget">Import as</Label>
              <select
                id="importTarget"
                className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={importHook.mergeTargetId}
                onChange={(event) => importHook.setMergeTargetId(event.target.value)}
              >
                <option value="">New repertoire</option>
                {repertoires.map((repertoire) => (
                  <option key={repertoire.id} value={repertoire.id}>
                    Merge into {repertoire.name} ({repertoire.side})
                  </option>
                ))}
              </select>
              {importHook.mergeTarget && (
                <p className="mt-1 text-xs text-gray-500">
                  New lines are added to "{importHook.mergeTarget.name}"; existing lines keep their
                  training progress.
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label htmlFor="repertoireName">Name</Label>
              <Input
                id="repertoireName"
                value={importHook.mergeTarget ? importHook.mergeTarget.name : importHook.importName}
                onChange={(event) => importHook.setImportName(event.target.value)}
                placeholder="Caro-Kann repertoire"
                disabled={Boolean(importHook.mergeTarget)}
              />
            </div>
            <div>
              <Label htmlFor="trainingSide">Your side</Label>
              <select
                id="trainingSide"
                className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                value={importHook.mergeTarget ? importHook.mergeTarget.side : importHook.importSide}
                disabled={Boolean(importHook.mergeTarget)}
                onChange={(event) =>
                  importHook.setImportSide(event.target.value === 'black' ? 'black' : 'white')
                }
              >
                <option value="white">White</option>
                <option value="black">Black</option>
              </select>
            </div>
            <div>
              <Label htmlFor="pgnFile">PGN file</Label>
              <Input
                id="pgnFile"
                type="file"
                accept=".pgn,application/x-chess-pgn,text/plain"
                onChange={(event) => void importHook.handleFileImport(event.target.files?.[0])}
              />
            </div>
          </div>
          <Textarea
            aria-label="PGN text"
            value={importHook.pgnText}
            onChange={(event) => importHook.setPgnText(event.target.value)}
            placeholder="Paste a single PGN game with variations..."
            className="min-h-36"
          />
          <Button
            type="button"
            onClick={() => void importHook.handleImport()}
            disabled={!importHook.pgnText.trim()}
          >
            {importHook.mergeTarget ? 'Merge into Repertoire' : 'Import Repertoire'}
          </Button>

          {importHook.importWarnings.length > 0 && (
            <div
              role="alert"
              className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <p className="font-medium">
                Imported with {importHook.importWarnings.length} skipped{' '}
                {importHook.importWarnings.length === 1 ? 'line' : 'lines'}. Fix these moves in your
                PGN and re-import to include them:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {importHook.importWarnings.map((warning, index) => (
                  <li key={index}>{warning.message}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
