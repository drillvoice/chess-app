import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTrainingTimer } from './use-training-timer';
import * as firestore from '@/lib/firebase/firestore';
import * as settings from '@/lib/firebase/settings';
import type { TrainingSession } from '@shared/schema';

vi.mock('@/lib/firebase/firestore', () => ({
  createSession: vi.fn(),
  updateSession: vi.fn(),
  getSessionsByDateRange: vi.fn(),
}));

vi.mock('@/lib/firebase/settings', () => ({
  addCustomStudyTag: vi.fn(),
}));

const mockCreateSession = vi.mocked(firestore.createSession);
const mockUpdateSession = vi.mocked(firestore.updateSession);
const mockGetSessionsByDateRange = vi.mocked(firestore.getSessionsByDateRange);
const mockAddCustomStudyTag = vi.mocked(settings.addCustomStudyTag);

// Helper to drive document.visibilityState in tests.
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useTrainingTimer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T10:00:00Z'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    mockGetSessionsByDateRange.mockResolvedValue([]);
    mockAddCustomStudyTag.mockResolvedValue();
    mockCreateSession.mockResolvedValue({} as TrainingSession);
    mockUpdateSession.mockResolvedValue({} as TrainingSession);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('accumulates active time and flushes one minute on unmount', async () => {
    const flushSession = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useTrainingTimer({ enabled: true, flushSession }));

    act(() => {
      result.current.markActive();
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    await act(async () => {
      unmount();
    });

    expect(flushSession).toHaveBeenCalledTimes(1);
    expect(flushSession).toHaveBeenCalledWith(1);
  });

  it('does not flush sub-minute accruals', async () => {
    const flushSession = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useTrainingTimer({ enabled: true, flushSession }));

    act(() => {
      result.current.markActive();
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    await act(async () => {
      unmount();
    });

    expect(flushSession).not.toHaveBeenCalled();
  });

  it('stops counting after the idle timeout', async () => {
    const flushSession = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useTrainingTimer({ enabled: true, flushSession }));

    act(() => {
      result.current.markActive();
    });
    // Pass the idle timeout (150s) with no further activity, then idle more.
    act(() => {
      vi.advanceTimersByTime(151_000);
    });
    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    await act(async () => {
      unmount();
    });

    // Only the active window before idle (~150s ≈ 3 min after rounding) counts;
    // the trailing idle time must not be added.
    expect(flushSession).toHaveBeenCalledTimes(1);
    expect(flushSession).toHaveBeenCalledWith(3);
  });

  it('flushes when the tab is backgrounded and resumes when foregrounded', async () => {
    const flushSession = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useTrainingTimer({ enabled: true, flushSession }));

    act(() => {
      result.current.markActive();
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    await act(async () => {
      setVisibility('hidden');
    });

    expect(flushSession).toHaveBeenCalledTimes(1);
    expect(flushSession).toHaveBeenCalledWith(1);

    // Foreground + new activity resumes a fresh segment.
    await act(async () => {
      setVisibility('visible');
    });
    act(() => {
      result.current.markActive();
      vi.advanceTimersByTime(120_000);
    });

    await act(async () => {
      setVisibility('hidden');
    });

    expect(flushSession).toHaveBeenCalledTimes(2);
    expect(flushSession).toHaveBeenLastCalledWith(2);
  });

  it('flushes when a drill ends (enabled flips false)', async () => {
    const flushSession = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ enabled }) => useTrainingTimer({ enabled, flushSession }),
      { initialProps: { enabled: true } },
    );

    act(() => {
      result.current.markActive();
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    await act(async () => {
      rerender({ enabled: false });
    });

    expect(flushSession).toHaveBeenCalledTimes(1);
    expect(flushSession).toHaveBeenCalledWith(1);
  });

  it('does not start counting before the first markActive', async () => {
    const flushSession = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useTrainingTimer({ enabled: true, flushSession }));

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    await act(async () => {
      unmount();
    });

    expect(flushSession).not.toHaveBeenCalled();
  });

  it('does not double-flush when hidden is followed by unmount', async () => {
    const flushSession = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useTrainingTimer({ enabled: true, flushSession }));

    act(() => {
      result.current.markActive();
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    await act(async () => {
      setVisibility('hidden');
    });
    await act(async () => {
      unmount();
    });

    expect(flushSession).toHaveBeenCalledTimes(1);
    expect(flushSession).toHaveBeenCalledWith(1);
  });

  describe('defaultFlushSession (via real flush path)', () => {
    it('creates a new openings study session when none exists today', async () => {
      mockGetSessionsByDateRange.mockResolvedValue([]);
      const { result, unmount } = renderHook(() => useTrainingTimer({ enabled: true }));

      act(() => {
        result.current.markActive();
      });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      await act(async () => {
        unmount();
      });

      expect(mockAddCustomStudyTag).toHaveBeenCalledWith('openings');
      expect(mockUpdateSession).not.toHaveBeenCalled();
      expect(mockCreateSession).toHaveBeenCalledTimes(1);
      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'study',
          duration: 1,
          studyTags: ['openings'],
          studyNotes: 'Auto-logged from opening trainer',
        }),
      );
    });

    it('merges into the existing auto-logged session for today', async () => {
      mockGetSessionsByDateRange.mockResolvedValue([
        {
          id: 42,
          type: 'study',
          duration: 5,
          studyTags: JSON.stringify(['openings']),
          studyNotes: 'Auto-logged from opening trainer',
          date: new Date(),
        } as unknown as TrainingSession,
      ]);

      const { result, unmount } = renderHook(() => useTrainingTimer({ enabled: true }));

      act(() => {
        result.current.markActive();
      });
      act(() => {
        vi.advanceTimersByTime(120_000);
      });

      await act(async () => {
        unmount();
      });

      expect(mockCreateSession).not.toHaveBeenCalled();
      expect(mockUpdateSession).toHaveBeenCalledWith(42, { duration: 7 });
    });

    it('does not merge into a manually entered openings session', async () => {
      mockGetSessionsByDateRange.mockResolvedValue([
        {
          id: 99,
          type: 'study',
          duration: 5,
          studyTags: JSON.stringify(['openings']),
          studyNotes: 'my own notes',
          date: new Date(),
        } as unknown as TrainingSession,
      ]);

      const { result, unmount } = renderHook(() => useTrainingTimer({ enabled: true }));

      act(() => {
        result.current.markActive();
      });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      await act(async () => {
        unmount();
      });

      expect(mockUpdateSession).not.toHaveBeenCalled();
      expect(mockCreateSession).toHaveBeenCalledTimes(1);
    });
  });
});
