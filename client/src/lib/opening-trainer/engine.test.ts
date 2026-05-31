import { describe, expect, it } from 'vitest';
import {
  applyTrainerMove,
  chooseWeightedMove,
  moveWeight,
  startOpeningTraining,
  summarizeRepertoire,
} from './engine';
import { parseOpeningRepertoirePgn } from './parser';
import type { OpeningMoveStats } from './types';

const DAY_MS = 86_400_000;

describe('opening trainer engine', () => {
  it('tests only the configured side and auto-plays opponent moves', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 e5 2. Nf3 Nc6', 'white');
    const started = startOpeningTraining(repertoire, [], () => 0);

    expect(started.currentNodeId).toBe('root');
    expect(started.currentFen.split(' ')[1]).toBe('w');

    const afterE4 = applyTrainerMove(started, 'e2', 'e4', undefined, () => 0).state;

    expect(afterE4.currentFen.split(' ')[1]).toBe('w');
    expect(afterE4.repertoire.nodes[afterE4.currentNodeId].san).toBe('e5');
    expect(
      afterE4.expectedMoveId ? afterE4.repertoire.nodes[afterE4.expectedMoveId].san : null,
    ).toBe('Nf3');
  });

  it('allows one retry before revealing the expected move', () => {
    const state = startOpeningTraining(parseOpeningRepertoirePgn('1. e4 e5', 'white').repertoire);

    const firstMiss = applyTrainerMove(state, 'g1', 'f3').state;
    expect(firstMiss.feedback).toBe('incorrect');
    expect(firstMiss.incorrectAttempts).toBe(1);

    const secondMiss = applyTrainerMove(firstMiss, 'g1', 'f3').state;
    expect(secondMiss.feedback).toBe('revealed');
    expect(secondMiss.incorrectAttempts).toBe(2);
    expect(
      secondMiss.expectedMoveId ? secondMiss.repertoire.nodes[secondMiss.expectedMoveId].san : null,
    ).toBe('e4');
  });

  it('weights missed moves higher than clean moves', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 (1. d4) e5', 'white');
    const [e4, d4] = repertoire.nodes.root.children;
    const withStats = {
      ...repertoire,
      stats: {
        [e4]: { attempts: 4, misses: 0, streak: 4, lastSeenAt: new Date().toISOString() },
        [d4]: { attempts: 4, misses: 3, streak: 0, lastSeenAt: new Date().toISOString() },
      },
    };

    expect(moveWeight(withStats, d4)).toBeGreaterThan(moveWeight(withStats, e4));
    expect(
      chooseWeightedMove(
        withStats,
        withStats.nodes.root.children.map((id) => withStats.nodes[id]),
        () => 0.99,
      )?.id,
    ).toBe(d4);
  });

  it('avoids immediately repeating a completed line when another branch exists', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 (1. d4 d5) e5', 'white');
    const firstLine = startOpeningTraining(repertoire, [], () => 0);
    const completed = applyTrainerMove(firstLine, 'e2', 'e4', undefined, () => 0).state;

    expect(completed.feedback).toBe('complete');
    expect(
      completed.lastCompletedLineMoveIds.map((id) => completed.repertoire.nodes[id].san),
    ).toEqual(['e4', 'e5']);

    const nextLine = startOpeningTraining(
      completed.repertoire,
      completed.lastCompletedLineMoveIds,
      () => 0,
    );

    expect(
      nextLine.expectedMoveId ? nextLine.repertoire.nodes[nextLine.expectedMoveId].san : null,
    ).toBe('d4');
  });

  it('reports every line as due and new for a freshly imported repertoire', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 (1. d4) e5', 'white');
    const summary = summarizeRepertoire(repertoire);

    expect(summary.totalLines).toBe(2);
    expect(summary.dueLines).toBe(2);
    expect(summary.newLines).toBe(2);
    expect(summary.learnedLines).toBe(0);
    expect(summary.nextDueAt).toBeUndefined();
  });

  it('counts a scheduled line as learned and surfaces the next due time', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 (1. d4) e5', 'white');
    const [e4] = repertoire.nodes.root.children;
    const dueAt = new Date(Date.now() + 10 * DAY_MS).toISOString();
    const scheduled = {
      ...repertoire,
      stats: {
        [e4]: {
          attempts: 1,
          misses: 0,
          streak: 1,
          lastSeenAt: new Date().toISOString(),
          easeFactor: 2.5,
          intervalDays: 10,
          repetitions: 3,
          dueAt,
        } satisfies OpeningMoveStats,
      },
    };

    const summary = summarizeRepertoire(scheduled);
    expect(summary.dueLines).toBe(1); // only the d4 line remains due
    expect(summary.learnedLines).toBe(1);
    expect(summary.nextDueAt).toBe(dueAt);
  });

  it('biases selection toward branches that contain a due move', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 (1. d4) e5', 'white');
    const [e4, d4] = repertoire.nodes.root.children;
    const withStats = {
      ...repertoire,
      stats: {
        // e4 line is scheduled far in the future (not due); d4 has no card (new).
        [e4]: {
          attempts: 1,
          misses: 0,
          streak: 1,
          lastSeenAt: new Date().toISOString(),
          easeFactor: 2.5,
          intervalDays: 30,
          repetitions: 4,
          dueAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
        } satisfies OpeningMoveStats,
      },
    };

    const moves = withStats.nodes.root.children.map((id) => withStats.nodes[id]);
    expect(chooseWeightedMove(withStats, moves, () => 0.5)?.id).toBe(d4);
    expect(chooseWeightedMove(withStats, moves, () => 0.9)?.id).toBe(d4);
  });
});
