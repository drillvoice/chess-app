import type { UseFormRegisterReturn, UseFormSetValue } from 'react-hook-form';
import type { GameSession } from '@shared/schema';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { OpponentAutocomplete } from './use-opponent-autocomplete';

interface OpponentFieldProps {
  autocomplete: OpponentAutocomplete;
  field: UseFormRegisterReturn<'opponentUsername'>;
  setValue: UseFormSetValue<GameSession>;
  error?: string;
}

/** Opponent name input with autocomplete suggestions, shown for OTB games only. */
export function OpponentField({ autocomplete, field, setValue, error }: OpponentFieldProps) {
  const {
    opponentName,
    setOpponentName,
    isFocused,
    setIsFocused,
    selectedFromSuggestions,
    setSelectedFromSuggestions,
    opponentNames,
    filteredOpponentNames,
  } = autocomplete;

  const shouldShowSuggestions = isFocused && filteredOpponentNames.length > 0;

  const handleSuggestionSelect = (name: string) => {
    setOpponentName(name);
    setSelectedFromSuggestions(true);
    setValue('opponentUsername', name, { shouldValidate: true });
    setIsFocused(false);
  };

  return (
    <div>
      <Label htmlFor="opponentName" className="text-sm font-medium text-gray-700">
        Opponent name (optional)
      </Label>
      <div className="relative mt-1">
        <Input
          id="opponentName"
          type="text"
          autoComplete="off"
          placeholder="Enter opponent name..."
          className={cn(
            selectedFromSuggestions ? 'border-emerald-500 ring-2 ring-emerald-200' : '',
          )}
          value={opponentName}
          aria-autocomplete="list"
          aria-controls={shouldShowSuggestions ? 'opponent-name-suggestions' : undefined}
          aria-expanded={shouldShowSuggestions}
          {...field}
          onFocus={() => {
            setIsFocused(true);
          }}
          onBlur={(event) => {
            field.onBlur(event);
            window.setTimeout(() => {
              setIsFocused(false);
              const trimmedName = opponentName.trim();
              if (
                trimmedName &&
                opponentNames.some((name) => name.toLowerCase() === trimmedName.toLowerCase())
              ) {
                setSelectedFromSuggestions(true);
              }
            }, 100);
          }}
          onChange={(e) => {
            field.onChange(e);
            setOpponentName(e.target.value);
            setSelectedFromSuggestions(false);
            setValue('opponentUsername', e.target.value, { shouldValidate: true });
          }}
        />
        {shouldShowSuggestions && (
          <ul
            id="opponent-name-suggestions"
            role="listbox"
            aria-label="Opponent suggestions"
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
          >
            {filteredOpponentNames.map((name) => (
              <li key={name} role="option" aria-selected="false">
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-start px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSuggestionSelect(name);
                  }}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selectedFromSuggestions && opponentName.trim() && (
        <div
          className="mt-2 inline-flex items-center rounded-full border border-emerald-500 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700"
          data-testid="opponent-name-chip"
        >
          {opponentName.trim()}
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
