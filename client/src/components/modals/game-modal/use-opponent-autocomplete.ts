import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TrainingSession } from '@shared/schema';
import { extractOtbOpponentNames, filterOpponentNames } from './helpers';

/**
 * Owns the opponent autocomplete state (input value, focus, suggestion selection)
 * and derives the suggestion list from previously logged OTB games.
 * State lives here (in the parent component) so the modal can reset it on
 * submit / edit-load / close, exactly as before the extraction.
 */
export function useOpponentAutocomplete() {
  const [opponentName, setOpponentName] = useState<string>('');
  const [isFocused, setIsFocused] = useState(false);
  const [selectedFromSuggestions, setSelectedFromSuggestions] = useState(false);

  // Fetch all sessions to extract opponent names for autocomplete
  const { data: allSessions } = useQuery<TrainingSession[]>({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { getAllSessions } = await import('@/lib/firebase');
      return await getAllSessions();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Memoize the list of unique opponent names from OTB games only
  const opponentNames = useMemo(() => extractOtbOpponentNames(allSessions), [allSessions]);

  const filteredOpponentNames = useMemo(
    () => filterOpponentNames(opponentNames, opponentName),
    [opponentName, opponentNames],
  );

  /** Reset all opponent input state (used on submit, edit-load, deselect and close). */
  const reset = (name = '') => {
    setOpponentName(name);
    setSelectedFromSuggestions(false);
    setIsFocused(false);
  };

  return {
    opponentName,
    setOpponentName,
    isFocused,
    setIsFocused,
    selectedFromSuggestions,
    setSelectedFromSuggestions,
    opponentNames,
    filteredOpponentNames,
    reset,
  };
}

export type OpponentAutocomplete = ReturnType<typeof useOpponentAutocomplete>;
