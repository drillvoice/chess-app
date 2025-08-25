import { useState, useEffect } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  getUserStudyPreferences, 
  addCustomStudyTag, 
  removeCustomStudyTag 
} from '@/lib/firebase/settings';
import type { StudyTag } from '@shared/schema';

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
  const { toast } = useToast();

  // Load available tags on mount
  useEffect(() => {
    loadAvailableTags();
  }, []);

  const loadAvailableTags = async () => {
    try {
      setIsLoading(true);
      const preferences = await getUserStudyPreferences();
      setAvailableTags(preferences.customTags);
    } catch (error) {
      console.error('Failed to load tags:', error);
      toast({
        title: 'Error',
        description: 'Failed to load study tags',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTag = async () => {
    const trimmedTag = newTagInput.trim();
    
    if (!trimmedTag) return;
    
    // Validation
    if (trimmedTag.length > 20) {
      toast({
        title: 'Tag too long',
        description: 'Tags cannot exceed 20 characters',
        variant: 'destructive',
      });
      return;
    }
    
    if (!/^[a-zA-Z0-9\s\-']+$/.test(trimmedTag)) {
      toast({
        title: 'Invalid characters',
        description: 'Tags can only contain letters, numbers, spaces, hyphens, and apostrophes',
        variant: 'destructive',
      });
      return;
    }
    
    if (availableTags.length >= maxTags) {
      toast({
        title: 'Too many tags',
        description: `You can only have up to ${maxTags} custom tags`,
        variant: 'destructive',
      });
      return;
    }
    
    // Check if tag already exists (case-insensitive)
    if (availableTags.some(tag => tag.toLowerCase() === trimmedTag.toLowerCase())) {
      toast({
        title: 'Tag exists',
        description: 'This tag already exists',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      setIsAddingTag(true);
      await addCustomStudyTag(trimmedTag);
      
      // Update local state immediately for better UX
      const newTags = [...availableTags, trimmedTag].sort();
      setAvailableTags(newTags);
      setNewTagInput('');
      
      toast({
        title: 'Tag added',
        description: `"${trimmedTag}" has been added to your study tags`,
      });
    } catch (error) {
      console.error('Failed to add tag:', error);
      toast({
        title: 'Error',
        description: 'Failed to add tag',
        variant: 'destructive',
      });
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
      
      toast({
        title: 'Tag removed',
        description: `"${tagToRemove}" has been removed from your study tags`,
      });
    } catch (error) {
      console.error('Failed to remove tag:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove tag',
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
      onTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      // Add tag (limit to 10 selected)
      if (selectedTags.length >= 10) {
        toast({
          title: 'Too many tags selected',
          description: 'You can only select up to 10 tags per study session',
          variant: 'destructive',
        });
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
                    handleRemoveTag(tag);
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
          </div>
        ) : (
          <p className="text-sm text-gray-500">No custom tags yet. Add one below!</p>
        )}
      </div>
      
      {/* Add new tag input */}
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
      </div>
      
      {/* Helper text */}
      <div className="space-y-1 text-xs text-gray-500">
        <p>Click tags to select/deselect for this study session</p>
        <p>
          {availableTags.length}/{maxTags} custom tags • {selectedTags.length}/10 selected
        </p>
      </div>
    </div>
  );
}
