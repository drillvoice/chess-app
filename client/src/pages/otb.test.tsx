import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import OtbPage from './otb';
import { START_FEN } from '@/lib/otb/constants';
import { applyMove } from '@/lib/otb/chess';
import type { OtbGame } from '@/lib/otb/types';

const {
  toastSpy,
  getOtbGamesMock,
  createOtbGameMock,
  saveOtbGameMock,
  deleteOtbGameMock,
  resetOtbGameMock,
  upsertOtbSessionMock,
} = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  getOtbGamesMock: vi.fn(),
  createOtbGameMock: vi.fn(),
  saveOtbGameMock: vi.fn(),
  deleteOtbGameMock: vi.fn(),
  resetOtbGameMock: vi.fn(),
  upsertOtbSessionMock: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

vi.mock('@/lib/offline-storage', () => ({
  offlineStorage: {
    getOtbGames: getOtbGamesMock,
    createOtbGame: createOtbGameMock,
    saveOtbGame: saveOtbGameMock,
    deleteOtbGame: deleteOtbGameMock,
    resetOtbGame: resetOtbGameMock,
  },
}));

vi.mock('@/lib/otb/session-bridge', () => ({
  upsertOtbSession: upsertOtbSessionMock,
}));

function baseGame(id = 'otb-1'): OtbGame {
  const now = '2026-03-05T10:00:00.000Z';
  return {
    id,
    createdAt: now,
    updatedAt: now,
    playedAt: now,
    whiteName: '',
    blackName: '',
    playerColor: null,
    result: '*',
    moves: [],
    currentFen: START_FEN,
    status: 'active',
    linkedSessionId: null,
  };
}

function promotionReadyGame(): OtbGame {
  let game = baseGame('promo');
  const sequence: Array<[string, string]> = [
    ['a2', 'a4'],
    ['h7', 'h5'],
    ['a4', 'a5'],
    ['h5', 'h4'],
    ['a5', 'a6'],
    ['h4', 'h3'],
    ['a6', 'b7'],
    ['h3', 'g2'],
  ];

  for (const [from, to] of sequence) {
    game = applyMove(game, from as any, to as any).game;
  }

  return game;
}

describe('OTB page', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getOtbGamesMock.mockResolvedValue([]);
    createOtbGameMock.mockImplementation(async () => baseGame('created'));
    saveOtbGameMock.mockImplementation(async (game) => game);
    deleteOtbGameMock.mockResolvedValue(undefined);
    resetOtbGameMock.mockImplementation(async (id: string) => ({ ...baseGame(id), id }));
    upsertOtbSessionMock.mockResolvedValue(99);
    vi.stubGlobal('confirm', vi.fn(() => true));

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    (URL.createObjectURL as any) = vi.fn(() => 'blob:test');
    (URL.revokeObjectURL as any) = vi.fn();
  });

  it('bootstraps a new game when none exist', async () => {
    render(<OtbPage />);
    await waitFor(() => expect(createOtbGameMock).toHaveBeenCalled());
    expect(await screen.findByRole('heading', { name: /OTB Board Logger/i })).toBeInTheDocument();
  });

  it('updates move list after tap-to-move', async () => {
    getOtbGamesMock.mockResolvedValue([baseGame()]);
    render(<OtbPage />);

    await screen.findByRole('heading', { name: /OTB Board Logger/i });
    fireEvent.click(screen.getByRole('button', { name: /Square e2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square e4/i }));

    await waitFor(() => {
      expect(saveOtbGameMock).toHaveBeenCalled();
      expect(screen.getByText('e4')).toBeInTheDocument();
    });
  });

  it('handles promotion flow through picker', async () => {
    getOtbGamesMock.mockResolvedValue([promotionReadyGame()]);
    render(<OtbPage />);

    await screen.findByRole('heading', { name: /OTB Board Logger/i });
    fireEvent.click(screen.getByRole('button', { name: /Square b7/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square a8/i }));

    expect(await screen.findByText(/Choose promotion/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Queen' }));

    await waitFor(() => expect(saveOtbGameMock).toHaveBeenCalled());
  });

  it('copies and downloads PGN', async () => {
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        (element as HTMLAnchorElement).click = vi.fn();
      }
      return element;
    });

    getOtbGamesMock.mockResolvedValue([baseGame()]);
    render(<OtbPage />);

    await screen.findByRole('heading', { name: /OTB Board Logger/i });
    fireEvent.click(screen.getByRole('button', { name: /Copy PGN/i }));
    fireEvent.click(screen.getByRole('button', { name: /Download PGN/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    createElementSpy.mockRestore();
  });

  it('creates then updates linked activity session', async () => {
    getOtbGamesMock.mockResolvedValue([
      { ...baseGame(), playerColor: 'white', result: '1-0', blackName: 'Opponent' },
    ]);
    render(<OtbPage />);

    await screen.findByRole('heading', { name: /OTB Board Logger/i });

    fireEvent.click(screen.getByRole('button', { name: /Create Activity Session/i }));
    await waitFor(() => expect(upsertOtbSessionMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: /Update Activity Session/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Update Activity Session/i }));
    await waitFor(() => expect(upsertOtbSessionMock).toHaveBeenCalledTimes(2));
  });
});
