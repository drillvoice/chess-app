import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { TagManager } from './tag-manager';
import {
  addCustomStudyTag,
  removeCustomStudyTag,
  addCustomMistakeTag,
  removeCustomMistakeTag,
} from '@/lib/firebase/settings';
import { useStudyPreferences, updateStudyPreferences } from '@/hooks/use-study-preferences';
import type { UserStudyPreferences } from '@shared/schema';

vi.mock('@/lib/firebase/settings', () => ({
  addCustomStudyTag: vi.fn().mockResolvedValue(undefined),
  removeCustomStudyTag: vi.fn().mockResolvedValue(undefined),
  addCustomMistakeTag: vi.fn().mockResolvedValue(undefined),
  removeCustomMistakeTag: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/use-study-preferences', () => ({
  useStudyPreferences: vi.fn(),
  updateStudyPreferences: vi.fn().mockResolvedValue(undefined),
}));

const preferences: UserStudyPreferences = {
  customTags: ['reading', 'videos'],
  tagConfigs: {},
  customMistakeTags: ['hung a piece', 'time trouble'],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useStudyPreferences).mockReturnValue({
    preferences,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
});

afterEach(cleanup);

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
    await waitFor(() =>
      expect(updateStudyPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          customMistakeTags: ['hung a piece', 'missed a pin', 'time trouble'],
          customTags: preferences.customTags,
        }),
      ),
    );
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
