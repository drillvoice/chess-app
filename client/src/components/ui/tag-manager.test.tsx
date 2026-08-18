import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TagManager } from './tag-manager';
import {
  addCustomStudyTag,
  removeCustomStudyTag,
  addCustomMistakeTag,
  removeCustomMistakeTag,
} from '@/lib/firebase/settings';
import { useStudyPreferences, publishStudyPreferences } from '@/hooks/use-study-preferences';
import type { UserStudyPreferences } from '@shared/schema';

// The tag mutators resolve with the preferences document they saved.
vi.mock('@/lib/firebase/settings', () => ({
  addCustomStudyTag: vi.fn(),
  removeCustomStudyTag: vi.fn(),
  addCustomMistakeTag: vi.fn(),
  removeCustomMistakeTag: vi.fn(),
}));

vi.mock('@/hooks/use-study-preferences', () => ({
  useStudyPreferences: vi.fn(),
  publishStudyPreferences: vi.fn(),
}));

const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy, dismiss: vi.fn(), toasts: [] }),
}));

const preferences: UserStudyPreferences = {
  customTags: ['reading', 'videos'],
  tagConfigs: {},
  customMistakeTags: ['hung a piece', 'time trouble'],
};

const savedMistakePreferences: UserStudyPreferences = {
  ...preferences,
  customMistakeTags: ['hung a piece', 'missed a pin', 'time trouble'],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(addCustomStudyTag).mockResolvedValue(preferences);
  vi.mocked(removeCustomStudyTag).mockResolvedValue(preferences);
  vi.mocked(addCustomMistakeTag).mockResolvedValue(savedMistakePreferences);
  vi.mocked(removeCustomMistakeTag).mockResolvedValue(preferences);
  vi.mocked(useStudyPreferences).mockReturnValue({
    preferences,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe('TagManager vocabularies', () => {
  it('shows the study vocabulary by default', () => {
    render(<TagManager selectedTags={[]} onTagsChange={vi.fn()} />);

    expect(screen.getByText('reading')).toBeTruthy();
    expect(screen.queryByText('hung a piece')).toBeNull();
  });

  it('shows the mistake vocabulary when asked', () => {
    render(<TagManager vocabulary="mistake" selectedTags={[]} onTagsChange={vi.fn()} />);

    expect(screen.getByText('hung a piece')).toBeTruthy();
    expect(screen.queryByText('reading')).toBeNull();
  });

  it('persists new tags to the vocabulary they belong to', async () => {
    render(
      <TagManager vocabulary="mistake" selectedTags={[]} onTagsChange={vi.fn()} maxTags={20} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    fireEvent.change(screen.getByPlaceholderText('Add new tag...'), {
      target: { value: 'missed a pin' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(addCustomMistakeTag).toHaveBeenCalledWith('missed a pin'));
    expect(addCustomStudyTag).not.toHaveBeenCalled();

    // The mutator persists the document; the component only republishes it to
    // the shared cache, so exactly one save happens per added tag.
    await waitFor(() =>
      expect(publishStudyPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          customMistakeTags: ['hung a piece', 'missed a pin', 'time trouble'],
          customTags: preferences.customTags,
        }),
      ),
    );
    expect(screen.getByText('missed a pin')).toBeTruthy();
  });

  it('surfaces a failed save instead of losing it silently', async () => {
    vi.mocked(addCustomMistakeTag).mockRejectedValueOnce(new Error('Failed to add custom tag'));

    render(
      <TagManager vocabulary="mistake" selectedTags={[]} onTagsChange={vi.fn()} maxTags={20} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    fireEvent.change(screen.getByPlaceholderText('Add new tag...'), {
      target: { value: 'missed a pin' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy.mock.calls[0][0]).toMatchObject({
      title: 'Could not save tag',
      variant: 'destructive',
    });
  });

  it('explains why a tag was rejected rather than ignoring the click', async () => {
    render(<TagManager vocabulary="mistake" selectedTags={[]} onTagsChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    fireEvent.change(screen.getByPlaceholderText('Add new tag...'), {
      target: { value: 'hung a piece' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('"hung a piece" is already in the list')).toBeTruthy();
    expect(addCustomMistakeTag).not.toHaveBeenCalled();
  });

  it('deletes from the vocabulary it is editing', async () => {
    render(<TagManager vocabulary="mistake" selectedTags={[]} onTagsChange={vi.fn()} />);

    fireEvent.click(screen.getByTitle('Remove "time trouble" tag'));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

    await waitFor(() => expect(removeCustomMistakeTag).toHaveBeenCalledWith('time trouble'));
    expect(removeCustomStudyTag).not.toHaveBeenCalled();
  });
});

describe('TagManager selection', () => {
  it('toggles a tag on and off', () => {
    const onTagsChange = vi.fn();
    const { rerender } = render(
      <TagManager vocabulary="mistake" selectedTags={[]} onTagsChange={onTagsChange} />,
    );

    fireEvent.click(screen.getByText('hung a piece'));
    expect(onTagsChange).toHaveBeenCalledWith(['hung a piece']);

    rerender(
      <TagManager
        vocabulary="mistake"
        selectedTags={['hung a piece']}
        onTagsChange={onTagsChange}
      />,
    );
    fireEvent.click(screen.getByText('hung a piece'));
    expect(onTagsChange).toHaveBeenLastCalledWith([]);
  });

  it('refuses to select past maxSelected', () => {
    const onTagsChange = vi.fn();
    render(
      <TagManager
        vocabulary="mistake"
        selectedTags={['hung a piece']}
        onTagsChange={onTagsChange}
        maxSelected={1}
      />,
    );

    fireEvent.click(screen.getByText('time trouble'));
    expect(onTagsChange).not.toHaveBeenCalled();
  });
});
