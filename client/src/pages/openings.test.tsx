import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import OpeningsPage from './openings';

const {
  toastSpy,
  getOpeningRepertoiresMock,
  saveOpeningRepertoireMock,
  deleteOpeningRepertoireMock,
  throwNextApplyMove,
} = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  getOpeningRepertoiresMock: vi.fn(),
  saveOpeningRepertoireMock: vi.fn(),
  deleteOpeningRepertoireMock: vi.fn(),
  // When `.current` is true, the next applyTrainerMove call throws once (to
  // simulate the engine choking on a move) and then resets to real behaviour.
  throwNextApplyMove: { current: false },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

vi.mock('@/lib/firebase/repertoires', () => ({
  getOpeningRepertoires: getOpeningRepertoiresMock,
  saveOpeningRepertoire: saveOpeningRepertoireMock,
  deleteOpeningRepertoire: deleteOpeningRepertoireMock,
}));

// Delegate to the real engine, but allow a test to force a single throw from
// applyTrainerMove so the self-healing catch path can be exercised.
vi.mock('@/lib/opening-trainer/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/opening-trainer/engine')>();
  return {
    ...actual,
    applyTrainerMove: (...args: Parameters<typeof actual.applyTrainerMove>) => {
      if (throwNextApplyMove.current) {
        throwNextApplyMove.current = false;
        throw new Error('Invalid FEN: simulated');
      }
      return actual.applyTrainerMove(...args);
    },
  };
});

describe('Openings page', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    throwNextApplyMove.current = false;
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
    // Import PGN is a collapsed accordion; open it to reach its inputs.
    fireEvent.click(screen.getByRole('button', { name: /Import PGN/i }));
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
    // Import PGN is a collapsed accordion; open it to reach its inputs.
    fireEvent.click(screen.getByRole('button', { name: /Import PGN/i }));
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
    // Import PGN is a collapsed accordion; open it to reach its inputs.
    fireEvent.click(screen.getByRole('button', { name: /Import PGN/i }));
    fireEvent.change(screen.getByLabelText(/PGN text/i), {
      target: { value: '1. e4 e5 2. Nf3 Nc6' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import Repertoire/i }));

    await waitFor(() => expect(saveOpeningRepertoireMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Square g1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square f3/i }));

    await waitFor(() => expect(screen.getByText(/Not this branch/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Square e2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square e4/i }));

    await waitFor(() =>
      expect(screen.getByText(/Correct — your move to continue/i)).toBeInTheDocument(),
    );
  });

  it('applies the first move when the piece and target are tapped in the same tick', async () => {
    render(<OpeningsPage />);
    await screen.findByRole('heading', { name: /Opening Repertoire Trainer/i });
    fireEvent.click(screen.getByRole('button', { name: /Import PGN/i }));
    fireEvent.change(screen.getByLabelText(/PGN text/i), {
      target: { value: '1. e4 e5 2. Nf3 Nc6' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import Repertoire/i }));
    await waitFor(() => expect(saveOpeningRepertoireMock).toHaveBeenCalled());

    const e2 = screen.getByRole('button', { name: /Square e2/i });
    const e4 = screen.getByRole('button', { name: /Square e4/i });

    // Reproduce a fast tap: select the pawn and tap the destination in the SAME
    // tick, so the destination tap's handler runs before React commits the
    // selecting tap's render. Reading selection from a ref (not stale state) is
    // what keeps the move from being silently dropped here.
    await act(async () => {
      e2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      e4.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitFor(
      () => expect(screen.getByText(/Correct — your move to continue/i)).toBeInTheDocument(),
      { timeout: 2000 },
    );
  });

  it('applies a paced first move and keeps the selection state consistent', async () => {
    render(<OpeningsPage />);
    await screen.findByRole('heading', { name: /Opening Repertoire Trainer/i });
    fireEvent.click(screen.getByRole('button', { name: /Import PGN/i }));
    fireEvent.change(screen.getByLabelText(/PGN text/i), {
      target: { value: '1. e4 e5 2. Nf3 Nc6' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import Repertoire/i }));
    await waitFor(() => expect(saveOpeningRepertoireMock).toHaveBeenCalled());

    // Normal pace: each click flushes a render before the next, so the ref and
    // React state must stay in agreement.
    fireEvent.click(screen.getByRole('button', { name: /Square e2/i }));
    // Selecting the pawn highlights it (ring) — selection state is live.
    expect(screen.getByRole('button', { name: /Square e2/i }).className).toMatch(/ring-blue/);
    fireEvent.click(screen.getByRole('button', { name: /Square e4/i }));

    await waitFor(
      () => expect(screen.getByText(/Correct — your move to continue/i)).toBeInTheDocument(),
      { timeout: 2000 },
    );
    // After the move the selection is cleared (no lingering ring on e2).
    expect(screen.getByRole('button', { name: /Square e2/i }).className).not.toMatch(/ring-blue/);
  });

  it('applies the next move tapped immediately after a move, during the reply pause', async () => {
    render(<OpeningsPage />);
    await screen.findByRole('heading', { name: /Opening Repertoire Trainer/i });
    fireEvent.click(screen.getByRole('button', { name: /Import PGN/i }));
    fireEvent.change(screen.getByLabelText(/PGN text/i), {
      target: { value: '1. e4 e5 2. Nf3 Nc6' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import Repertoire/i }));
    await waitFor(() => expect(saveOpeningRepertoireMock).toHaveBeenCalled());

    // Play e4 and then Nf3 immediately, WITHOUT waiting for the trainer's reply.
    // Previously the reply played behind a 300ms input block, so this second move
    // landed in a dead zone and was silently dropped; the line never completed.
    fireEvent.click(screen.getByRole('button', { name: /Square e2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square e4/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square g1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square f3/i }));

    // Both user moves register; trainer replies Nc6 and the line completes.
    await waitFor(() => expect(screen.getByText('Line complete!')).toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it('self-heals (no stuck board) when a move throws, without recording a miss', async () => {
    render(<OpeningsPage />);
    await screen.findByRole('heading', { name: /Opening Repertoire Trainer/i });
    fireEvent.click(screen.getByRole('button', { name: /Import PGN/i }));
    fireEvent.change(screen.getByLabelText(/PGN text/i), {
      target: { value: '1. e4 e5 2. Nf3 Nc6' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import Repertoire/i }));
    await waitFor(() => expect(saveOpeningRepertoireMock).toHaveBeenCalled());
    saveOpeningRepertoireMock.mockClear();

    // Force the next move to throw inside the engine (simulating the silent-drop
    // bug). Without self-healing the board would stay stuck with no feedback.
    throwNextApplyMove.current = true;
    fireEvent.click(screen.getByRole('button', { name: /Square e2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square e4/i }));

    // The board recovers with a visible "tap again" message instead of dying
    // silently, and nothing was persisted (so no miss / interval change).
    await waitFor(() => expect(screen.getByText(/didn't register/i)).toBeInTheDocument());
    expect(saveOpeningRepertoireMock).not.toHaveBeenCalled();

    // Retrying the same move now works (throw flag has reset).
    fireEvent.click(screen.getByRole('button', { name: /Square e2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square e4/i }));
    await waitFor(() =>
      expect(screen.getByText(/Correct — your move to continue/i)).toBeInTheDocument(),
    );
  });

  it('Unstick button refreshes the drill without changing the schedule', async () => {
    render(<OpeningsPage />);
    await screen.findByRole('heading', { name: /Opening Repertoire Trainer/i });
    fireEvent.click(screen.getByRole('button', { name: /Import PGN/i }));
    fireEvent.change(screen.getByLabelText(/PGN text/i), {
      target: { value: '1. e4 e5 2. Nf3 Nc6' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import Repertoire/i }));
    await waitFor(() => expect(saveOpeningRepertoireMock).toHaveBeenCalled());
    saveOpeningRepertoireMock.mockClear();

    // Pressing Unstick must not persist anything (SRS-neutral) and must leave the
    // drill ready on the same side.
    fireEvent.click(screen.getByRole('button', { name: /Unstick/i }));
    expect(saveOpeningRepertoireMock).not.toHaveBeenCalled();
    expect(screen.getByText(/White to train/i)).toBeInTheDocument();

    // The drill is still fully functional afterwards.
    fireEvent.click(screen.getByRole('button', { name: /Square e2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square e4/i }));
    await waitFor(() =>
      expect(screen.getByText(/Correct — your move to continue/i)).toBeInTheDocument(),
    );
  });

  it('registers the second correct move after a wrong attempt on the first', async () => {
    render(<OpeningsPage />);
    await screen.findByRole('heading', { name: /Opening Repertoire Trainer/i });
    fireEvent.click(screen.getByRole('button', { name: /Import PGN/i }));
    fireEvent.change(screen.getByLabelText(/PGN text/i), {
      target: { value: '1. e4 e5 2. Nf3 Nc6' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import Repertoire/i }));
    await waitFor(() => expect(saveOpeningRepertoireMock).toHaveBeenCalled());

    // Wrong first move (Nf3 before e4)
    fireEvent.click(screen.getByRole('button', { name: /Square g1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square f3/i }));
    await waitFor(() => expect(screen.getByText(/Not this branch/i)).toBeInTheDocument());

    // First correct move (e4)
    fireEvent.click(screen.getByRole('button', { name: /Square e2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square e4/i }));
    await waitFor(() =>
      expect(screen.getByText(/Correct — your move to continue/i)).toBeInTheDocument(),
    );

    // Second correct move (Nf3) — board is now at the e5 position
    fireEvent.click(screen.getByRole('button', { name: /Square g1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square f3/i }));

    // Trainer replies Nc6, line completes — green banner shows "Line complete!"
    await waitFor(() => expect(screen.getByText('Line complete!')).toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it('shows Next Line after completion and avoids repeating the same branch', async () => {
    render(<OpeningsPage />);

    await screen.findByRole('heading', { name: /Opening Repertoire Trainer/i });
    // Import PGN is a collapsed accordion; open it to reach its inputs.
    fireEvent.click(screen.getByRole('button', { name: /Import PGN/i }));
    fireEvent.change(screen.getByLabelText(/PGN text/i), {
      target: { value: '1. e4 (1. d4 d5) e5' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import Repertoire/i }));

    await waitFor(() => expect(saveOpeningRepertoireMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Square e2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square e4/i }));

    expect(await screen.findByText(/Ready for the next branch/i)).toBeInTheDocument();
    // On completion both the banner and the controls card expose a "Next Line"
    // button; either advances the drill, so click the first.
    fireEvent.click(screen.getAllByRole('button', { name: /Next Line/i })[0]);

    fireEvent.click(screen.getByRole('button', { name: /Square e2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Square e4/i }));

    await waitFor(() => expect(screen.getByText(/Not this branch/i)).toBeInTheDocument());
  });
});
