import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import OpeningsPage from './openings';

const {
  toastSpy,
  getOpeningRepertoiresMock,
  saveOpeningRepertoireMock,
  deleteOpeningRepertoireMock,
} = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  getOpeningRepertoiresMock: vi.fn(),
  saveOpeningRepertoireMock: vi.fn(),
  deleteOpeningRepertoireMock: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

vi.mock('@/lib/offline-storage', () => ({
  offlineStorage: {
    getOpeningRepertoires: getOpeningRepertoiresMock,
    saveOpeningRepertoire: saveOpeningRepertoireMock,
    deleteOpeningRepertoire: deleteOpeningRepertoireMock,
  },
}));

describe('Openings page', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getOpeningRepertoiresMock.mockResolvedValue([]);
    saveOpeningRepertoireMock.mockImplementation(async (repertoire) => repertoire);
    deleteOpeningRepertoireMock.mockResolvedValue(undefined);
    // The trainer weights branch selection with Math.random; pin it so the
    // expected branch is deterministic (always the first child) in tests.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  it('imports a PGN and starts a hidden-label drill', async () => {
    render(<OpeningsPage />);

    await screen.findByRole('heading', { name: /Opening Repertoire Trainer/i });
    fireEvent.change(screen.getByLabelText(/Name/i), {
      target: { value: 'Caro-Kann Advance' },
    });
    fireEvent.change(screen.getByLabelText(/PGN text/i), {
      target: { value: '1. e4 c6 2. d4 d5 3. e5' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import Repertoire/i }));

    await waitFor(() => expect(saveOpeningRepertoireMock).toHaveBeenCalled());
    expect(screen.getByText('Caro-Kann Advance')).toBeInTheDocument();
    expect(screen.getByText(/White to train/i)).toBeInTheDocument();
    expect(screen.queryByText(/Caro-Kann Advance to train/i)).not.toBeInTheDocument();
  });

  it('imports the legal moves and warns about a skipped line on a typo', async () => {
    render(<OpeningsPage />);

    await screen.findByRole('heading', { name: /Opening Repertoire Trainer/i });
    fireEvent.change(screen.getByLabelText(/PGN text/i), {
      target: { value: '1. e4 e5 (1... c5 2. Qq9) 2. Nf3 Nc6' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import Repertoire/i }));

    await waitFor(() => expect(saveOpeningRepertoireMock).toHaveBeenCalled());

    // The repertoire still imports and starts training.
    expect(screen.getByText(/White to train/i)).toBeInTheDocument();

    // The skipped line is surfaced with enough detail to fix it.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/1 skipped line/i);
    expect(alert).toHaveTextContent(/illegal move 2\. Qq9/i);
  });

  it('handles correct and incorrect board moves', async () => {
    render(<OpeningsPage />);

    await screen.findByRole('heading', { name: /Opening Repertoire Trainer/i });
    fireEvent.change(screen.getByLabelText(/PGN text/i), {
      target: { value: '1. e4 e5 2. Nf3 Nc6' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import Repertoire/i }));

    await waitFor(() => expect(saveOpeningRepertoireMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Square g1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square f3/i }));

    await waitFor(() => expect(screen.getByText(/Try again/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Square e2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square e4/i }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Correct' })),
    );
  });

  it('shows Next Line after completion and avoids repeating the same branch', async () => {
    render(<OpeningsPage />);

    await screen.findByRole('heading', { name: /Opening Repertoire Trainer/i });
    fireEvent.change(screen.getByLabelText(/PGN text/i), {
      target: { value: '1. e4 (1. d4 d5) e5' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import Repertoire/i }));

    await waitFor(() => expect(saveOpeningRepertoireMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Square e2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square e4/i }));

    expect(await screen.findByText(/Ready for the next branch/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next Line/i }));

    fireEvent.click(screen.getByRole('button', { name: /Square e2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square e4/i }));

    await waitFor(() => expect(screen.getByText(/Try again/i)).toBeInTheDocument());
  });
});
