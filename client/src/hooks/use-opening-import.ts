import { useCallback, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { mergeRepertoire } from '@/lib/opening-trainer/merge';
import { parseOpeningRepertoirePgn, type OpeningParseError } from '@/lib/opening-trainer/parser';
import type { OpeningRepertoire, OpeningTrainerSide } from '@/lib/opening-trainer/types';

function repertoireMoveCount(repertoire: OpeningRepertoire): number {
  return Math.max(0, Object.keys(repertoire.nodes).length - 1);
}

interface UseOpeningImportOptions {
  repertoires: OpeningRepertoire[];
  persistRepertoire: (repertoire: OpeningRepertoire) => Promise<OpeningRepertoire>;
  /** Called after a successful import/merge with the saved repertoire. */
  onImported: (saved: OpeningRepertoire) => void;
}

export interface UseOpeningImportResult {
  importName: string;
  setImportName: React.Dispatch<React.SetStateAction<string>>;
  importSide: OpeningTrainerSide;
  setImportSide: React.Dispatch<React.SetStateAction<OpeningTrainerSide>>;
  mergeTargetId: string;
  setMergeTargetId: React.Dispatch<React.SetStateAction<string>>;
  pgnText: string;
  setPgnText: React.Dispatch<React.SetStateAction<string>>;
  importWarnings: OpeningParseError[];
  isImportPgnOpen: boolean;
  setIsImportPgnOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** The repertoire to merge into, or null when creating a new one. */
  mergeTarget: OpeningRepertoire | null;
  handleImport: () => Promise<void>;
  handleFileImport: (file: File | undefined) => Promise<void>;
}

export function useOpeningImport({
  repertoires,
  persistRepertoire,
  onImported,
}: UseOpeningImportOptions): UseOpeningImportResult {
  const { toast } = useToast();
  const [importName, setImportName] = useState('');
  const [importSide, setImportSide] = useState<OpeningTrainerSide>('white');
  // '' = create a new repertoire; otherwise the id of the repertoire to merge into.
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [pgnText, setPgnText] = useState('');
  const [importWarnings, setImportWarnings] = useState<OpeningParseError[]>([]);
  const [isImportPgnOpen, setIsImportPgnOpen] = useState(false);

  const mergeTarget = useMemo(
    () => repertoires.find((r) => r.id === mergeTargetId) ?? null,
    [repertoires, mergeTargetId],
  );

  const handleImport = useCallback(async () => {
    try {
      // When merging, the target owns the side; parse with it so move colours line up.
      const side = mergeTarget ? mergeTarget.side : importSide;
      const { repertoire, errors } = parseOpeningRepertoirePgn(pgnText, side, importName);

      let saved: OpeningRepertoire;
      let mergeSummary: { addedMoves: number; matchedMoves: number } | null = null;
      if (mergeTarget) {
        const merged = mergeRepertoire(mergeTarget, repertoire);
        saved = await persistRepertoire(merged.repertoire);
        mergeSummary = { addedMoves: merged.addedMoves, matchedMoves: merged.matchedMoves };
      } else {
        saved = await persistRepertoire(repertoire);
      }

      onImported(saved);
      setImportName('');
      setPgnText('');
      setMergeTargetId('');
      setImportWarnings(errors);

      if (errors.length > 0) {
        const skipped = `${errors.length} line${errors.length === 1 ? '' : 's'}`;
        toast({
          title: 'Imported with warnings',
          description: `${repertoireMoveCount(saved)} moves ready; skipped ${skipped} with errors — see details below.`,
          variant: 'destructive',
        });
      } else if (mergeSummary) {
        const added = `${mergeSummary.addedMoves} new move${mergeSummary.addedMoves === 1 ? '' : 's'}`;
        toast({
          title: 'Repertoire updated',
          description: `Added ${added}; ${mergeSummary.matchedMoves} already in "${saved.name}".`,
        });
      } else {
        toast({
          title: 'Repertoire imported',
          description: `${repertoireMoveCount(saved)} moves are ready for training.`,
        });
      }
    } catch (error) {
      setImportWarnings([]);
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Unable to import that PGN.',
        variant: 'destructive',
      });
    }
  }, [mergeTarget, importSide, importName, pgnText, persistRepertoire, onImported, toast]);

  const handleFileImport = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setPgnText(await file.text());
      if (!importName.trim()) {
        setImportName(file.name.replace(/\.pgn$/i, ''));
      }
    },
    [importName],
  );

  return {
    importName,
    setImportName,
    importSide,
    setImportSide,
    mergeTargetId,
    setMergeTargetId,
    pgnText,
    setPgnText,
    importWarnings,
    isImportPgnOpen,
    setIsImportPgnOpen,
    mergeTarget,
    handleImport,
    handleFileImport,
  };
}
