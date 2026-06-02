import { describe, expect, it } from 'vitest';
import {
  applyTrainerMove,
  chooseWeightedMove,
  deleteLine,
  describeLine,
  enumerateLines,
  lineLabel,
  moveWeight,
  setLineDisabled,
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

  // Helpers for the line-management (pause / delete) feature.
  const leafOf = (line: string[]) => line[line.length - 1];

  it('pauses a line via its leaf so it drops out of review counts', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 (1. d4) e5', 'white');
    const lines = enumerateLines(repertoire);
    expect(summarizeRepertoire(repertoire).totalLines).toBe(2);

    const paused = setLineDisabled(repertoire, leafOf(lines[0]), true);
    expect(paused.stats[leafOf(lines[0])].disabled).toBe(true);

    const summary = summarizeRepertoire(paused);
    expect(summary.totalLines).toBe(1);
    expect(summary.dueLines).toBe(1);

    // Re-activating restores it.
    const resumed = setLineDisabled(paused, leafOf(lines[0]), false);
    expect(summarizeRepertoire(resumed).totalLines).toBe(2);
  });

  it('never selects a paused branch and ends the drill when all lines are paused', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 (1. d4) e5', 'white');
    const lines = enumerateLines(repertoire);
    const [e4Line, d4Line] = lines;

    // Pause the e4 line; selection must always pick d4 regardless of the rng draw.
    const paused = setLineDisabled(repertoire, leafOf(e4Line), true);
    const moves = paused.nodes.root.children.map((id) => paused.nodes[id]);
    const d4 = paused.nodes[d4Line[0]];
    expect(chooseWeightedMove(paused, moves, () => 0)?.id).toBe(d4.id);
    expect(chooseWeightedMove(paused, moves, () => 0.99)?.id).toBe(d4.id);

    // Pause both: nothing is selectable and a fresh drill completes immediately.
    const allPaused = setLineDisabled(paused, leafOf(d4Line), true);
    expect(chooseWeightedMove(allPaused, moves, () => 0.5)).toBeNull();
    expect(startOpeningTraining(allPaused, [], () => 0).feedback).toBe('complete');
  });

  it('deletes a line while preserving sibling lines that share a prefix', () => {
    // Two lines share 1.e4 e5 2.Nf3, then branch to Nc6 / Nf6.
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 e5 2. Nf3 Nc6 (2... Nf6)', 'white');
    const lines = enumerateLines(repertoire);
    expect(lines).toHaveLength(2);
    const nc6Line = lines.find((line) => describeLine(repertoire, line).includes('Nc6'))!;
    const nf6Line = lines.find((line) => describeLine(repertoire, line).includes('Nf6'))!;
    const sharedNf3 = nc6Line[nc6Line.length - 2];

    const pruned = deleteLine(repertoire, leafOf(nc6Line));

    // The Nc6 leaf is gone; the shared Nf3 node and the Nf6 line survive.
    expect(pruned.nodes[leafOf(nc6Line)]).toBeUndefined();
    expect(pruned.stats[leafOf(nc6Line)]).toBeUndefined();
    expect(pruned.nodes[sharedNf3]).toBeDefined();
    expect(pruned.nodes[sharedNf3].children).toContain(leafOf(nf6Line));
    expect(enumerateLines(pruned)).toHaveLength(1);
  });

  it('renders a line as SAN with move numbers', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 e5 2. Nf3 Nc6', 'white');
    const [line] = enumerateLines(repertoire);
    expect(describeLine(repertoire, line)).toBe('1.e4 e5 2.Nf3 Nc6');
  });

  it('names a line by its deepest label and returns undefined when unlabelled', () => {
    const { repertoire } = parseOpeningRepertoirePgn(
      '1. e4 e5 { Open Game } 2. Nf3 Nc6 3. Bc4 Bc5 { Italian: Giuoco Piano }',
      'white',
    );
    const [labelled] = enumerateLines(repertoire);
    // Deepest label wins over the shallower "Open Game" on the same line.
    expect(lineLabel(repertoire, labelled)).toBe('Italian: Giuoco Piano');

    const { repertoire: bare } = parseOpeningRepertoirePgn('1. e4 e5', 'white');
    expect(lineLabel(bare, enumerateLines(bare)[0])).toBeUndefined();
  });
});
