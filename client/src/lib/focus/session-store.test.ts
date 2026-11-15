import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseLichessPuzzle } from './lichess-puzzles';
import { revealSolution, startPuzzle, submitMove } from './puzzle-session';
import { loadFocusSession, saveFocusSession, type FocusSession } from './session-store';
import { MATE_IN_2_RAW } from './test-fixtures';

const puzzle = parseLichessPuzzle(MATE_IN_2_RAW);

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    theme: 'pin',
    levelKey: 'fixed-easiest',
    queue: [puzzle],
    index: 0,
    state: startPuzzle(puzzle),
    feedback: 'find',
    tally: { attempted: 3, clean: 2 },
    activeMs: 90_000,
    levelsUsed: ['Beginner (~1000)'],
    puzzleNumber: 4,
    seenIds: ['x', puzzle.id],
    pendingResults: [['pin|casual', [{ id: 'x', win: false }]]],
    ...overrides,
  };
}

describe('focus session store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('round-trips a session', () => {
    saveFocusSession(session());
    const loaded = loadFocusSession()!;
    expect(loaded.state).toEqual(startPuzzle(puzzle));
    expect(loaded).toMatchObject({
      theme: 'pin',
      levelKey: 'fixed-easiest',
      index: 0,
      tally: { attempted: 3, clean: 2 },
      activeMs: 90_000,
      puzzleNumber: 4,
      pendingResults: [['pin|casual', [{ id: 'x', win: false }]]],
    });
    expect(loaded.queue[0]).toEqual(puzzle);
  });

  it("plays the opponent's reply when saved between the move and the reply", () => {
    // Player played Be3+, app unloaded before the scripted Bxe3.
    const { state } = submitMove(startPuzzle(puzzle), 'g5e3');
    expect(state.ply).toBe(1);
    saveFocusSession(session({ state, feedback: 'correct' }));
    const loaded = loadFocusSession()!;
    expect(loaded.state.ply).toBe(2);
    expect(loaded.state.lastMove).toBe('b6e3');
    expect(loaded.state.status).toBe('playing');
  });

  it('restores a revealed puzzle as failed', () => {
    saveFocusSession(session({ state: revealSolution(startPuzzle(puzzle)), feedback: 'revealed' }));
    expect(loadFocusSession()!.state.status).toBe('failed');
  });

  it('drops sessions older than a day', () => {
    saveFocusSession(session());
    expect(loadFocusSession(Date.now() + 25 * 60 * 60 * 1000)).toBeNull();
    expect(localStorage.getItem('focus-session')).toBeNull();
  });

  it.each([
    ['garbage JSON', () => localStorage.setItem('focus-session', '{oops')],
    [
      'a tampered solution',
      () => {
        saveFocusSession(session());
        const s = JSON.parse(localStorage.getItem('focus-session')!);
        s.queue[0].puzzle.solution = ['a1a8'];
        localStorage.setItem('focus-session', JSON.stringify(s));
      },
    ],
    [
      'NaN in the tally',
      () => {
        saveFocusSession(session());
        const s = JSON.parse(localStorage.getItem('focus-session')!);
        s.tally.attempted = null;
        localStorage.setItem('focus-session', JSON.stringify(s));
      },
    ],
    [
      'an index past the queue',
      () => {
        saveFocusSession(session());
        const s = JSON.parse(localStorage.getItem('focus-session')!);
        s.index = 5;
        localStorage.setItem('focus-session', JSON.stringify(s));
      },
    ],
  ])('discards %s', (_name, corrupt) => {
    corrupt();
    expect(loadFocusSession()).toBeNull();
    expect(localStorage.getItem('focus-session')).toBeNull();
  });
});
