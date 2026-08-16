import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStudyPreferences, updateStudyPreferences } from './use-study-preferences';
import type { UserStudyPreferences } from '@shared/schema';

// vi.hoisted: mock factories run before plain top-level consts are initialized.
const { SEEDED_STUDY_TAGS } = vi.hoisted(() => ({
  SEEDED_STUDY_TAGS: ['reading', 'videos', 'coaching'],
}));

vi.mock('@/lib/firebase/settings', () => ({
  getUserStudyPreferences: vi.fn(),
  updateUserStudyPreferences: vi.fn(),
  DEFAULT_STUDY_PREFERENCES: {
    customTags: SEEDED_STUDY_TAGS,
    tagConfigs: {},
    customMistakeTags: [],
  },
}));

vi.mock('@/lib/tag-vocabulary', () => ({
  repairTagVocabularies: vi.fn(),
}));

import { getUserStudyPreferences, updateUserStudyPreferences } from '@/lib/firebase/settings';
import { repairTagVocabularies } from '@/lib/tag-vocabulary';

const mockGet = vi.mocked(getUserStudyPreferences);
const mockUpdate = vi.mocked(updateUserStudyPreferences);
const mockRepair = vi.mocked(repairTagVocabularies);

const basePreferences: UserStudyPreferences = {
  customTags: [...SEEDED_STUDY_TAGS],
  tagConfigs: {},
  customMistakeTags: [],
};

describe('useStudyPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(basePreferences);
    mockUpdate.mockResolvedValue(undefined);
    mockRepair.mockImplementation(async (preferences) => preferences);
  });

  it('propagates updateStudyPreferences to all mounted hook instances', async () => {
    const first = renderHook(() => useStudyPreferences());
    const second = renderHook(() => useStudyPreferences());

    await waitFor(() => {
      expect(first.result.current.isLoading).toBe(false);
      expect(second.result.current.isLoading).toBe(false);
    });

    const updated: UserStudyPreferences = {
      ...basePreferences,
      customTags: [...basePreferences.customTags, 'step method'],
    };

    // Simulates e.g. the study modal's TagManager adding a tag while the
    // goal-settings modal is also mounted.
    await act(async () => {
      await updateStudyPreferences(updated);
    });

    expect(first.result.current.preferences?.customTags).toContain('step method');
    expect(second.result.current.preferences?.customTags).toContain('step method');
  });

  it('stops notifying unmounted instances', async () => {
    const hook = renderHook(() => useStudyPreferences());
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    hook.unmount();

    // Should not throw or warn about state updates on unmounted components
    await act(async () => {
      await updateStudyPreferences({ ...basePreferences, customTags: ['anki'] });
    });
  });
});

describe('preloadStudyPreferences', () => {
  beforeEach(() => {
    // The recovery pass runs once per module lifetime, so each case needs a fresh
    // copy of the module rather than a shared one that has already run.
    vi.resetModules();
    vi.clearAllMocks();
    mockGet.mockResolvedValue(basePreferences);
    mockUpdate.mockResolvedValue(undefined);
  });

  it('persists a vocabulary recovered from logged sessions', async () => {
    const recovered: UserStudyPreferences = {
      ...basePreferences,
      customMistakeTags: ['hung a piece'],
    };
    mockRepair.mockResolvedValue(recovered);

    const { preloadStudyPreferences, useStudyPreferences: useFresh } = await import(
      './use-study-preferences'
    );
    await preloadStudyPreferences();

    expect(mockRepair).toHaveBeenCalledWith(basePreferences, SEEDED_STUDY_TAGS);
    expect(mockUpdate).toHaveBeenCalledWith(recovered);

    const hook = renderHook(() => useFresh());
    await waitFor(() => expect(hook.result.current.preferences).toEqual(recovered));
  });

  it('writes nothing when there is nothing to recover', async () => {
    mockRepair.mockImplementation(async (preferences) => preferences);

    const { preloadStudyPreferences } = await import('./use-study-preferences');
    await preloadStudyPreferences();

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('keeps the app usable when recovery fails', async () => {
    mockRepair.mockRejectedValue(new Error('IndexedDB unavailable'));

    const { preloadStudyPreferences, useStudyPreferences: useFresh } = await import(
      './use-study-preferences'
    );
    await preloadStudyPreferences();

    const hook = renderHook(() => useFresh());
    await waitFor(() => expect(hook.result.current.preferences).toEqual(basePreferences));
  });
});
