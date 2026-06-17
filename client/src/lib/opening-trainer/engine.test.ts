import { describe, expect, it } from 'vitest';
import {
  advanceOpponentMoves,
  applyTrainerMove,
  chooseWeightedMove,
  deleteLine,
  describeLine,
  enumerateLines,
  findInvalidNodeFens,
  lineLabel,
  moveWeight,
  resyncTrainingState,
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

  it('clears every line in one pass without re-serving a completed line', () => {
    // A branchy repertoire where completed lines and the remaining due line share
    // a shallow branch (1...e5). The old avoid-the-last-line logic excluded that
    // shallow move and re-served already-scheduled lines, so a clean session never
    // reached "all caught up". Drilling every line cleanly via "Next Line"
    // semantics must now converge in exactly N drills with no repeated completion.
    const pgn =
      '1. e4 e5 (1... c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3) (1... e6 2. d4 d5 3. Nc3 Bb4) (1... c6 2. d4 d5 3. e5) 2. Nf3 Nc6 3. Bb5 a6 (3... Nf6 4. O-O) 4. Ba4';
    let { repertoire } = parseOpeningRepertoirePgn(pgn, 'white');
    const totalLines = enumerateLines(repertoire).length;

    // Deterministic RNG so the run is reproducible.
    let seed = 7;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    const completed = new Set<string>();
    let avoid: string[] = [];

    for (let drill = 0; drill < totalLines + 5; drill += 1) {
      let state = startOpeningTraining(repertoire, avoid, rng);
      if (state.feedback === 'complete' && state.currentLineMoveIds.length === 0) {
        break; // gate fired: nothing due -> "All caught up"
      }
      let guard = 0;
      while (state.feedback !== 'complete' && guard < 50) {
        guard += 1;
        const expected = state.expectedMoveId ? state.repertoire.nodes[state.expectedMoveId] : null;
        if (!expected) break;
        const result = applyTrainerMove(
          state,
          expected.uci.slice(0, 2) as never,
          expected.uci.slice(2, 4) as never,
          (expected.uci.slice(4) || undefined) as never,
          rng,
        );
        expect(result.correct).toBe(true);
        state = result.state;
      }
      repertoire = state.repertoire;
      avoid = state.lastCompletedLineMoveIds;
      const key = describeLine(repertoire, state.lastCompletedLineMoveIds);
      expect(completed.has(key)).toBe(false); // never re-serve a completed line
      completed.add(key);
    }

    expect(completed.size).toBe(totalLines);
    expect(summarizeRepertoire(repertoire).dueMoves).toBe(0);
    // A fresh start now reports "all caught up" rather than re-serving a line.
    const fresh = startOpeningTraining(repertoire, avoid, rng);
    expect(fresh.feedback).toBe('complete');
    expect(fresh.currentLineMoveIds).toEqual([]);
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

  it('dueMoves counts unique move nodes, not lines, to avoid display jumps from shared nodes', () => {
    // Both lines share the same first user move (e4). dueLines counts 2 lines due,
    // but dueMoves should count only 1 unique due node — the shared e4 node —
    // so the displayed counter does not jump by 2 when that one node is scheduled.
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 e5 (1... e6)', 'white');
    const summary = summarizeRepertoire(repertoire);

    expect(summary.dueLines).toBe(2); // two root-to-leaf paths, both due
    expect(summary.dueMoves).toBe(1); // e4 is the only user move; it's shared
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

  it('does not start a drill once every line is scheduled into the future', () => {
    // Both lines recalled and scheduled ahead — none is due. Starting a drill
    // must complete immediately ("All caught up") rather than re-serving an
    // already-scheduled line. (A committed line still plays to its leaf — that
    // path is exercised elsewhere — but a fresh start is gated on due-ness.)
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 (1. d4) e5', 'white');
    const future = new Date(Date.now() + 5 * DAY_MS).toISOString();
    const scheduledStat = (): OpeningMoveStats => ({
      attempts: 1,
      misses: 0,
      streak: 1,
      lastSeenAt: new Date().toISOString(),
      easeFactor: 2.5,
      intervalDays: 5,
      repetitions: 3,
      dueAt: future,
    });
    const scheduled = {
      ...repertoire,
      stats: Object.fromEntries(repertoire.nodes.root.children.map((id) => [id, scheduledStat()])),
    };

    const started = startOpeningTraining(scheduled, [], () => 0);
    expect(started.feedback).toBe('complete');
    expect(started.currentLineMoveIds).toEqual([]);
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

  it('resyncTrainingState yields a fresh object without touching stats', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 e5 2. Nf3 Nc6', 'white');
    const state = startOpeningTraining(repertoire, [], () => 0);

    const resynced = resyncTrainingState(state, () => 0);

    // New object reference (forces a React re-render) at the same position with
    // the same expected move, and — crucially — identical stats (SRS untouched).
    expect(resynced).not.toBe(state);
    expect(resynced.currentNodeId).toBe(state.currentNodeId);
    expect(resynced.expectedMoveId).toBe(state.expectedMoveId);
    expect(resynced.repertoire.stats).toEqual(state.repertoire.stats);
  });

  it('advanceOpponentMoves ends the line instead of throwing on a bad node FEN', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 e5 2. Nf3 Nc6', 'white');
    // Corrupt the FEN of the opponent reply node so walking the line would throw.
    const e5Id = repertoire.nodes[repertoire.rootNodeId].children
      .flatMap((id) => repertoire.nodes[id].children)
      .find((id) => repertoire.nodes[id].san === 'e5')!;
    const corrupted = {
      ...repertoire,
      nodes: {
        ...repertoire.nodes,
        [e5Id]: { ...repertoire.nodes[e5Id], fenAfter: 'not a fen' },
      },
    };
    const afterE4 = applyTrainerMove(
      startOpeningTraining(corrupted, [], () => 0),
      'e2',
      'e4',
      undefined,
      () => 0,
    );
    // No throw; the move still counts as correct and the line ends gracefully.
    expect(afterE4.correct).toBe(true);
    expect(afterE4.state.feedback).toBe('complete');
  });

  it('findInvalidNodeFens flags corrupt FENs and passes healthy data', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 e5', 'white');
    expect(findInvalidNodeFens(repertoire)).toEqual([]);

    const [firstChild] = repertoire.nodes[repertoire.rootNodeId].children;
    const corrupted = {
      ...repertoire,
      nodes: {
        ...repertoire.nodes,
        [firstChild]: { ...repertoire.nodes[firstChild], fenAfter: '' },
      },
    };
    const bad = findInvalidNodeFens(corrupted);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ id: firstChild, field: 'fenAfter' });
  });

  it('does not produce NaN stats when grading a move whose stored stat is partial', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 e5', 'white');
    const e4Id = repertoire.nodes[repertoire.rootNodeId].children[0];
    // A partial/corrupt stat missing the counter fields (e.g. one that only ever
    // had a line-level `disabled` flag written). Previously `current.attempts + 1`
    // produced NaN, which then rode through to gradeMove and persistence.
    const corrupt = {
      ...repertoire,
      stats: { [e4Id]: { disabled: false } as unknown as OpeningMoveStats },
    };

    const result = applyTrainerMove(
      startOpeningTraining(corrupt, [], () => 0),
      'e2',
      'e4',
      undefined,
      () => 0,
    );

    expect(result.correct).toBe(true);
    const graded = result.state.repertoire.stats[e4Id];
    expect(Number.isFinite(graded.attempts)).toBe(true);
    expect(Number.isFinite(graded.misses)).toBe(true);
    expect(Number.isFinite(graded.streak)).toBe(true);
    expect(graded.attempts).toBe(1);
    // dueAt must be a valid timestamp (the bug threw "Invalid time value" here).
    expect(Number.isNaN(new Date(graded.dueAt!).getTime())).toBe(false);
  });

  it('advanceOpponentMoves is a no-op pass-through for a completed line', () => {
    const { repertoire } = parseOpeningRepertoirePgn('1. e4 e5', 'white');
    const state = startOpeningTraining(repertoire, [], () => 0);
    // Play e4; opponent has no further reply after e5 → line completes.
    const done = applyTrainerMove(state, 'e2', 'e4', undefined, () => 0).state;
    expect(done.feedback).toBe('complete');
    expect(advanceOpponentMoves(done, () => 0).feedback).toBe('complete');
  });
});
