import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOpeningRepertoires } from './use-opening-repertoires';
import * as repertoireStore from '@/lib/firebase/repertoires';
import type { OpeningRepertoire } from '@/lib/opening-trainer/types';

vi.mock('@/lib/firebase/repertoires', () => ({
  getOpeningRepertoires: vi.fn(),
  saveOpeningRepertoire: vi.fn(),
  deleteOpeningRepertoire: vi.fn(),
}));

const mockGetOpeningRepertoires = vi.mocked(repertoireStore.getOpeningRepertoires);

function makeRepertoire(overrides: Partial<OpeningRepertoire> = {}): OpeningRepertoire {
  return {
    id: 'rep-1',
    name: 'Caro-Kann',
    side: 'black',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    rootNodeId: 'root',
    nodes: {
      root: {
        id: 'root',
        parentId: null,
        fenBefore: 'start',
        fenAfter: 'start',
        san: '',
        uci: '',
        from: 'a1',
        to: 'a1',
        ply: 0,
        children: [],
      },
    },
    stats: {},
    ...overrides,
  };
}

function emitMerged(repertoires: OpeningRepertoire[]) {
  window.dispatchEvent(new CustomEvent('cloud-sync:repertoires-merged', { detail: repertoires }));
}

describe('useOpeningRepertoires', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('picks up repertoires that cloud sync downloads after mount', async () => {
    // A device that has just signed in mounts with an empty IndexedDB; the
    // realtime snapshot lands a moment later.
    mockGetOpeningRepertoires.mockResolvedValue([]);
    const { result } = renderHook(() => useOpeningRepertoires());
    await waitFor(() => expect(mockGetOpeningRepertoires).toHaveBeenCalled());
    expect(result.current.repertoires).toHaveLength(0);

    const downloaded = makeRepertoire();
    act(() => emitMerged([downloaded]));

    await waitFor(() => expect(result.current.repertoires).toHaveLength(1));
    expect(result.current.activeRepertoireId).toBe('rep-1');
    expect(result.current.activeRepertoire?.name).toBe('Caro-Kann');
  });

  it('keeps the active selection when the merged set still contains it', async () => {
    const first = makeRepertoire({ id: 'a', updatedAt: '2026-05-02T00:00:00.000Z' });
    const second = makeRepertoire({ id: 'b', updatedAt: '2026-05-01T00:00:00.000Z' });
    mockGetOpeningRepertoires.mockResolvedValue([first, second]);

    const { result } = renderHook(() => useOpeningRepertoires());
    await waitFor(() => expect(result.current.repertoires).toHaveLength(2));

    act(() => result.current.setActiveRepertoireId('b'));
    act(() => emitMerged([first, second, makeRepertoire({ id: 'c' })]));

    await waitFor(() => expect(result.current.repertoires).toHaveLength(3));
    expect(result.current.activeRepertoireId).toBe('b');
  });

  it('falls back to the newest repertoire when the active one is gone', async () => {
    const removed = makeRepertoire({ id: 'gone' });
    mockGetOpeningRepertoires.mockResolvedValue([removed]);

    const { result } = renderHook(() => useOpeningRepertoires());
    await waitFor(() => expect(result.current.activeRepertoireId).toBe('gone'));

    const survivor = makeRepertoire({ id: 'kept' });
    act(() => emitMerged([survivor]));

    await waitFor(() => expect(result.current.activeRepertoireId).toBe('kept'));
  });

  it('sorts the merged set newest first', async () => {
    mockGetOpeningRepertoires.mockResolvedValue([]);
    const { result } = renderHook(() => useOpeningRepertoires());
    await waitFor(() => expect(mockGetOpeningRepertoires).toHaveBeenCalled());

    act(() =>
      emitMerged([
        makeRepertoire({ id: 'old', updatedAt: '2026-05-01T00:00:00.000Z' }),
        makeRepertoire({ id: 'new', updatedAt: '2026-06-01T00:00:00.000Z' }),
      ]),
    );

    await waitFor(() =>
      expect(result.current.repertoires.map((r) => r.id)).toEqual(['new', 'old']),
    );
  });
});
