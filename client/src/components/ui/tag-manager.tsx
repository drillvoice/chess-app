import { useState, useEffect, useRef } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

import {
  addCustomStudyTag,
  removeCustomStudyTag,
  addCustomMistakeTag,
  removeCustomMistakeTag,
} from '@/lib/firebase/settings';
import { useStudyPreferences, publishStudyPreferences } from '@/hooks/use-study-preferences';
import { useToast } from '@/hooks/use-toast';
import { studyTagSchema, type UserStudyPreferences } from '@shared/schema';

/**
 * Which persisted tag vocabulary this picker edits. Both live on the same
 * preferences document, so they share the offline-first read/write and the
 * cross-component cache in use-study-preferences.
 */
export type TagVocabulary = 'study' | 'mistake';

const VOCABULARIES: Record<
  TagVocabulary,
  {
    read: (prefs: UserStudyPreferences) => string[];
    write: (prefs: UserStudyPreferences, tags: string[]) => UserStudyPreferences;
    add: (tag: string) => Promise<UserStudyPreferences>;
    remove: (tag: string) => Promise<UserStudyPreferences>;
  }
> = {
  study: {
    read: (prefs) => prefs.customTags ?? [],
    write: (prefs, customTags) => ({ ...prefs, customTags }),
    add: addCustomStudyTag,
    remove: removeCustomStudyTag,
  },
  mistake: {
    read: (prefs) => prefs.customMistakeTags ?? [],
    write: (prefs, customMistakeTags) => ({ ...prefs, customMistakeTags }),
    add: addCustomMistakeTag,
    remove: removeCustomMistakeTag,
  },
};

interface TagManagerProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  vocabulary?: TagVocabulary;
  label?: string;
  placeholder?: string;
  emptyMessage?: string;
  /** Cap on the size of the saved vocabulary. */
  maxTags?: number;
  /** Cap on how many tags may be selected on a single session. */
  maxSelected?: number;
  selectedClassName?: string;
  disabled?: boolean;
}

export function TagManager({
  selectedTags,
  onTagsChange,
  vocabulary = 'study',
  label = 'Study tags',
  placeholder = 'Add new tag...',
  emptyMessage = 'No custom tags yet.',
  maxTags = 10,
  maxSelected = 10,
  selectedClassName = 'border-amber-300 bg-amber-50 text-amber-800',
  disabled = false,
}: TagManagerProps) {
  const store = VOCABULARIES[vocabulary];
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isDeletingTag, setIsDeletingTag] = useState<string | null>(null);
  const [showAddInput, setShowAddInput] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const { toast } = useToast();

  // Use the optimized hook for study preferences
  const {
    preferences,
    isLoading: preferencesLoading,
    error: _preferencesError,
  } = useStudyPreferences();

  // Update available tags when preferences change
  useEffect(() => {
    if (preferences) {
      setAvailableTags(store.read(preferences));
      setIsLoading(false);
    }
  }, [preferences, store]);

  // Set loading state based on preferences loading
  useEffect(() => {
    setIsLoading(preferencesLoading);
  }, [preferencesLoading]);

  // The input renders below the whole chip row, so on a full modal it can open
  // below the fold — and on mobile the keyboard shrinks 100dvh and pushes it down
  // again. Focusing makes the browser keep it in view.
  useEffect(() => {
    if (!showAddInput) return;
    addInputRef.current?.focus();
    addInputRef.current?.scrollIntoView({ block: 'nearest' });
  }, [showAddInput]);

  const handleAddTag = async () => {
    const trimmedTag = newTagInput.trim();

    if (!trimmedTag) return;

    // Validate against the schema itself rather than a parallel rule: the two used
    // to disagree (this input accepted apostrophes, the schema rejects them), so a
    // tag could pass here and then fail on save with nothing shown to the user.
    const validation = studyTagSchema.safeParse(trimmedTag);
    if (!validation.success) {
      setInputError(validation.error.issues[0]?.message ?? 'That tag is not allowed');
      return;
    }

    if (availableTags.length >= maxTags) {
      setInputError(`You can save at most ${maxTags} tags`);
      return;
    }

    // Check if tag already exists (case-insensitive)
    if (availableTags.some((tag) => tag.toLowerCase() === trimmedTag.toLowerCase())) {
      setInputError(`"${trimmedTag}" is already in the list`);
      return;
    }

    setInputError(null);

    try {
      setIsAddingTag(true);
      const savedPreferences = await store.add(trimmedTag);

      // Update local state immediately for better UX
      setAvailableTags(store.read(savedPreferences));
      setNewTagInput('');
      setShowAddInput(false); // Hide input after adding

      // Automatically select the new tag if it isn't already selected
      // and we haven't reached the selection limit
      if (
        !selectedTags.some((tag) => tag.toLowerCase() === trimmedTag.toLowerCase()) &&
        selectedTags.length < maxSelected
      ) {
        onTagsChange([...selectedTags, trimmedTag]);
      }

      // The mutator already persisted this document, so only the shared cache
      // needs refreshing — saving it a second time would double the work.
      publishStudyPreferences(savedPreferences);
    } catch (error) {
      // A failed save means the tag is gone on reload, so it has to be visible:
      // the vocabulary is the only record of these tags.
      console.error('Failed to add tag:', error);
      toast({
        title: 'Could not save tag',
        description: error instanceof Error ? error.message : `Failed to add "${trimmedTag}"`,
        variant: 'destructive',
      });
    } finally {
      setIsAddingTag(false);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    try {
      setIsDeletingTag(tagToRemove);
      const savedPreferences = await store.remove(tagToRemove);

      // Update local state immediately
      setAvailableTags(store.read(savedPreferences));

      // Also remove from selected tags if it was selected
      if (selectedTags.includes(tagToRemove)) {
        onTagsChange(selectedTags.filter((tag) => tag !== tagToRemove));
      }

      // The mutator already persisted this document, so only the shared cache
      // needs refreshing — saving it a second time would double the work.
      publishStudyPreferences(savedPreferences);
    } catch (error) {
      console.error('Failed to remove tag:', error);
      toast({
        title: 'Could not delete tag',
        description: error instanceof Error ? error.message : `Failed to remove "${tagToRemove}"`,
        variant: 'destructive',
      });
    } finally {
      setIsDeletingTag(null);
    }
  };

  const handleTagToggle = (tag: string) => {
    if (disabled) return;

    if (selectedTags.includes(tag)) {
      // Remove tag
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      // Add tag (respecting the per-session selection cap)
      if (selectedTags.length >= maxSelected) {
        return;
      }
      onTagsChange([...selectedTags, tag]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">{label}</Label>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-gray-700">{label}</Label>

      {/* Available tags display */}
      <div className="space-y-2">
        {availableTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => (
              <div
                key={tag}
                className={`group relative flex items-center gap-1 rounded-md border px-2 py-1 text-sm transition-colors ${
                  selectedTags.includes(tag)
                    ? selectedClassName
                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100'
                } ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
                onClick={() => handleTagToggle(tag)}
              >
                <span>{tag}</span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      disabled={isDeletingTag === tag || disabled}
                      className="ml-1 flex h-4 w-4 items-center justify-center rounded-sm text-gray-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50"
                      title={`Remove "${tag}" tag`}
                    >
                      {isDeletingTag === tag ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete tag</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete the “{tag}” tag?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>No, cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700"
                        onClick={() => handleRemoveTag(tag)}
                      >
                        Yes, delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}

            {/* Add button at the end of tag list */}
            {!showAddInput && availableTags.length < maxTags && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowAddInput(true)}
                disabled={disabled}
                className="flex items-center gap-1 border-dashed px-2 py-1 text-sm"
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-sm text-gray-500">{emptyMessage}</p>
            {!showAddInput && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowAddInput(true)}
                disabled={disabled}
                className="flex items-center gap-1 border-dashed px-2 py-1 text-sm"
              >
                <Plus className="h-3 w-3" />
                Add first tag
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Add new tag input (only shown when adding) */}
      {showAddInput && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <Input
              ref={addInputRef}
              type="text"
              placeholder={placeholder}
              value={newTagInput}
              onChange={(e) => {
                setNewTagInput(e.target.value);
                setInputError(null);
              }}
              onKeyDown={handleKeyDown}
              disabled={isAddingTag || disabled || availableTags.length >= maxTags}
              className="flex-1 text-sm"
              maxLength={25}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAddTag}
              disabled={
                !newTagInput.trim() || isAddingTag || disabled || availableTags.length >= maxTags
              }
              className="flex items-center gap-1 px-3"
            >
              {isAddingTag ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isAddingTag ? 'Adding...' : 'Add'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setShowAddInput(false);
                setNewTagInput('');
                setInputError(null);
              }}
              disabled={isAddingTag}
            >
              Cancel
            </Button>
          </div>
          {inputError && <p className="text-sm text-red-600">{inputError}</p>}
        </div>
      )}
    </div>
  );
}
