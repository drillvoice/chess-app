import { useState, useEffect } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { 
  addCustomStudyTag, 
  removeCustomStudyTag 
} from '@/lib/firebase/settings';
import { useStudyPreferences, updateStudyPreferences } from '@/hooks/use-study-preferences';

interface TagManagerProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  label?: string;
  placeholder?: string;
  maxTags?: number;
  disabled?: boolean;
}

export function TagManager({
  selectedTags,
  onTagsChange,
  label = "Study tags",
  placeholder = "Add new tag...",
  maxTags = 10,
  disabled = false,
}: TagManagerProps) {
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isDeletingTag, setIsDeletingTag] = useState<string | null>(null);
  const [showAddInput, setShowAddInput] = useState(false);

  // Use the optimized hook for study preferences
  const { preferences, isLoading: preferencesLoading, error: _preferencesError } = useStudyPreferences();

  // Update available tags when preferences change
  useEffect(() => {
    if (preferences) {
      setAvailableTags(preferences.customTags);
      setIsLoading(false);
    }
  }, [preferences]);

  // Set loading state based on preferences loading
  useEffect(() => {
    setIsLoading(preferencesLoading);
  }, [preferencesLoading]);

  const handleAddTag = async () => {
    const trimmedTag = newTagInput.trim();
    
    if (!trimmedTag) return;
    
    // Validation
    if (trimmedTag.length > 20) {
      return;
    }
    
    if (!/^[a-zA-Z0-9\s\-']+$/.test(trimmedTag)) {
      return;
    }
    
    if (availableTags.length >= maxTags) {
      return;
    }
    
    // Check if tag already exists (case-insensitive)
    if (availableTags.some(tag => tag.toLowerCase() === trimmedTag.toLowerCase())) {
      return;
    }
    
    try {
      setIsAddingTag(true);
      await addCustomStudyTag(trimmedTag);
      
      // Update local state immediately for better UX
      const newTags = [...availableTags, trimmedTag].sort();
      setAvailableTags(newTags);
      setNewTagInput('');
      setShowAddInput(false); // Hide input after adding

      // Automatically select the new tag if it isn't already selected
      // and we haven't reached the 10-tag limit
      if (
        !selectedTags.some(tag => tag.toLowerCase() === trimmedTag.toLowerCase()) &&
        selectedTags.length < 10
      ) {
        onTagsChange([...selectedTags, trimmedTag]);
      }
      
      // Update the global cache
      if (preferences) {
        const updatedPreferences = {
          ...preferences,
          customTags: newTags,
        };
        await updateStudyPreferences(updatedPreferences);
      }
    } catch (error) {
      console.error('Failed to add tag:', error);
    } finally {
      setIsAddingTag(false);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    try {
      setIsDeletingTag(tagToRemove);
      await removeCustomStudyTag(tagToRemove);
      
      // Update local state immediately
      const newTags = availableTags.filter(tag => tag !== tagToRemove);
      setAvailableTags(newTags);
      
      // Also remove from selected tags if it was selected
      if (selectedTags.includes(tagToRemove)) {
        onTagsChange(selectedTags.filter(tag => tag !== tagToRemove));
      }
      
      // Update the global cache
      if (preferences) {
        const updatedPreferences = {
          ...preferences,
          customTags: newTags,
        };
        await updateStudyPreferences(updatedPreferences);
      }
    } catch (error) {
      console.error('Failed to remove tag:', error);
    } finally {
      setIsDeletingTag(null);
    }
  };

  const handleTagToggle = (tag: string) => {
    if (disabled) return;
    
    if (selectedTags.includes(tag)) {
      // Remove tag
      onTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      // Add tag (limit to 10 selected)
      if (selectedTags.length >= 10) {
        return;
      }
      onTagsChange([...selectedTags, tag]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
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
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100'
                } ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
                onClick={() => handleTagToggle(tag)}
              >
                <span>{tag}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Confirm tag delete: yes / no')) {
                      handleRemoveTag(tag);
                    }
                  }}
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
                className="flex items-center gap-1 px-2 py-1 text-sm border-dashed"
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-sm text-gray-500">No custom tags yet.</p>
            {!showAddInput && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowAddInput(true)}
                disabled={disabled}
                className="flex items-center gap-1 px-2 py-1 text-sm border-dashed"
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
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder={placeholder}
            value={newTagInput}
            onChange={(e) => setNewTagInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isAddingTag || disabled || availableTags.length >= maxTags}
            className="flex-1 text-sm"
            maxLength={20}
          />
          <Button
            type="button"
            size="sm"
            onClick={handleAddTag}
            disabled={
              !newTagInput.trim() || 
              isAddingTag || 
              disabled || 
              availableTags.length >= maxTags
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
            }}
            disabled={isAddingTag}
          >
            Cancel
          </Button>
        </div>
      )}
      

    </div>
  );
}
