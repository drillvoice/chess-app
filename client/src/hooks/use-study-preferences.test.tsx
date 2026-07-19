import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStudyPreferences, updateStudyPreferences } from './use-study-preferences';
import type { UserStudyPreferences } from '@shared/schema';

vi.mock('@/lib/firebase/settings', () => ({
  getUserStudyPreferences: vi.fn(),
  updateUserStudyPreferences: vi.fn(),
}));

import { getUserStudyPreferences, updateUserStudyPreferences } from '@/lib/firebase/settings';

const mockGet = vi.mocked(getUserStudyPreferences);
const mockUpdate = vi.mocked(updateUserStudyPreferences);

const basePreferences: UserStudyPreferences = {
  customTags: ['reading', 'videos', 'coaching'],
  tagConfigs: {},
};

describe('useStudyPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(basePreferences);
    mockUpdate.mockResolvedValue(undefined);
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
