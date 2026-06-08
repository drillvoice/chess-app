import { useCallback, useMemo, useState } from 'react';
import {
  deleteLine,
  describeLine,
  enumerateLines,
  isLineDisabled,
  lineLabel,
  setLineDisabled,
} from '@/lib/opening-trainer/engine';
import type { OpeningRepertoire, OpeningTrainingState } from '@/lib/opening-trainer/types';

export interface ManagedLine {
  leafId: string;
  name: string | undefined;
  moves: string;
  paused: boolean;
}

interface UseLineManagementOptions {
  repertoires: OpeningRepertoire[];
  persistRepertoire: (repertoire: OpeningRepertoire) => Promise<OpeningRepertoire>;
  trainingState: OpeningTrainingState | null;
  /** Called after a line edit is persisted with the newly saved repertoire. */
  onLineEdited: (saved: OpeningRepertoire) => void;
}

export interface UseLineManagementResult {
  managingRepertoireId: string | null;
  setManagingRepertoireId: React.Dispatch<React.SetStateAction<string | null>>;
  managingRepertoire: OpeningRepertoire | null;
  managedLines: ManagedLine[];
  showLine: boolean;
  setShowLine: React.Dispatch<React.SetStateAction<boolean>>;
  /** Lines in the active repertoire that match the current move prefix. */
  currentLineCandidates: string[][];
  handleToggleLine: (leafId: string, nextPaused: boolean) => Promise<void>;
  handleDeleteLine: (leafId: string, label: string) => Promise<void>;
}

export function useLineManagement({
  repertoires,
  persistRepertoire,
  trainingState,
  onLineEdited,
}: UseLineManagementOptions): UseLineManagementResult {
  // Id of the repertoire whose lines are being managed in the edit dialog.
  const [managingRepertoireId, setManagingRepertoireId] = useState<string | null>(null);
  const [showLine, setShowLine] = useState(false);

  const managingRepertoire = useMemo(
    () => repertoires.find((r) => r.id === managingRepertoireId) ?? null,
    [repertoires, managingRepertoireId],
  );

  // Every line of the repertoire being managed, recomputed whenever the
  // repertoire changes so edits appear immediately without a reload.
  const managedLines = useMemo<ManagedLine[]>(() => {
    if (!managingRepertoire) return [];
    return enumerateLines(managingRepertoire).map((line) => ({
      leafId: line[line.length - 1],
      name: lineLabel(managingRepertoire, line),
      moves: describeLine(managingRepertoire, line),
      paused: isLineDisabled(managingRepertoire, line),
    }));
  }, [managingRepertoire]);

  // Lines that share the current training position's move prefix — shown when
  // the user toggles "Show Line".
  const currentLineCandidates = useMemo(() => {
    if (!trainingState) return [];
    const prefix = [
      ...trainingState.currentLineMoveIds,
      ...(trainingState.expectedMoveId ? [trainingState.expectedMoveId] : []),
    ];
    return enumerateLines(trainingState.repertoire).filter((line) =>
      prefix.every((id, i) => line[i] === id),
    );
  }, [trainingState]);

  const persistLineEdit = useCallback(
    async (updated: OpeningRepertoire) => {
      const saved = await persistRepertoire(updated);
      onLineEdited(saved);
      return saved;
    },
    [persistRepertoire, onLineEdited],
  );

  const handleToggleLine = useCallback(
    async (leafId: string, nextPaused: boolean) => {
      if (!managingRepertoire) return;
      await persistLineEdit(setLineDisabled(managingRepertoire, leafId, nextPaused));
    },
    [managingRepertoire, persistLineEdit],
  );

  const handleDeleteLine = useCallback(
    async (leafId: string, label: string) => {
      if (!managingRepertoire || !window.confirm(`Delete the line "${label}"?`)) return;
      await persistLineEdit(deleteLine(managingRepertoire, leafId));
    },
    [managingRepertoire, persistLineEdit],
  );

  return {
    managingRepertoireId,
    setManagingRepertoireId,
    managingRepertoire,
    managedLines,
    showLine,
    setShowLine,
    currentLineCandidates,
    handleToggleLine,
    handleDeleteLine,
  };
}
