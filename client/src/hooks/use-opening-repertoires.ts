import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteOpeningRepertoire,
  getOpeningRepertoires,
  saveOpeningRepertoire,
} from '@/lib/firebase/repertoires';
import { summarizeRepertoire } from '@/lib/opening-trainer/engine';
import type { OpeningRepertoire, RepertoireReviewSummary } from '@/lib/opening-trainer/types';

function sortRepertoires(repertoires: OpeningRepertoire[]): OpeningRepertoire[] {
  return [...repertoires].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export interface UseOpeningRepertoiresResult {
  repertoires: OpeningRepertoire[];
  activeRepertoireId: string | null;
  setActiveRepertoireId: React.Dispatch<React.SetStateAction<string | null>>;
  activeRepertoire: OpeningRepertoire | null;
  reviewSummaries: Map<string, RepertoireReviewSummary>;
  totalDueMoves: number;
  persistRepertoire: (repertoire: OpeningRepertoire) => Promise<OpeningRepertoire>;
  /** Prompts for confirmation; returns true if the repertoire was deleted. */
  deleteRepertoire: (id: string) => Promise<boolean>;
}

export function useOpeningRepertoires(): UseOpeningRepertoiresResult {
  const [repertoires, setRepertoires] = useState<OpeningRepertoire[]>([]);
  const [activeRepertoireId, setActiveRepertoireId] = useState<string | null>(null);

  const activeRepertoire = useMemo(
    () => repertoires.find((r) => r.id === activeRepertoireId) ?? null,
    [activeRepertoireId, repertoires],
  );

  const reviewSummaries = useMemo(() => {
    const summaries = new Map<string, RepertoireReviewSummary>();
    for (const repertoire of repertoires) {
      summaries.set(repertoire.id, summarizeRepertoire(repertoire));
    }
    return summaries;
  }, [repertoires]);

  const totalDueMoves = useMemo(
    () => repertoires.reduce((sum, r) => sum + (reviewSummaries.get(r.id)?.dueMoves ?? 0), 0),
    [repertoires, reviewSummaries],
  );

  useEffect(() => {
    const load = async () => {
      const stored = await getOpeningRepertoires();
      setRepertoires(stored);
      setActiveRepertoireId(stored[0]?.id ?? null);
    };
    void load();
  }, []);

  const persistRepertoire = useCallback(async (repertoire: OpeningRepertoire) => {
    const saved = await saveOpeningRepertoire(repertoire);
    setRepertoires((prev) => sortRepertoires([saved, ...prev.filter((r) => r.id !== saved.id)]));
    setActiveRepertoireId(saved.id);
    return saved;
  }, []);

  const deleteRepertoire = useCallback(
    async (id: string) => {
      const target = repertoires.find((r) => r.id === id);
      if (!target || !window.confirm(`Delete "${target.name}"?`)) return false;
      await deleteOpeningRepertoire(id);
      setRepertoires((prev) => {
        const remaining = prev.filter((r) => r.id !== id);
        setActiveRepertoireId(remaining[0]?.id ?? null);
        return remaining;
      });
      return true;
    },
    [repertoires],
  );

  return {
    repertoires,
    activeRepertoireId,
    setActiveRepertoireId,
    activeRepertoire,
    reviewSummaries,
    totalDueMoves,
    persistRepertoire,
    deleteRepertoire,
  };
}
