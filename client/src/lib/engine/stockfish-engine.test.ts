import { describe, expect, it, vi } from 'vitest';
import { StockfishEngine, type AnalysisUpdate, type EngineWorker } from './stockfish-engine';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function fakeWorker() {
  const sent: string[] = [];
  const worker: EngineWorker = {
    postMessage: (m: string) => sent.push(m),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  };
  const reply = (line: string) => worker.onmessage?.({ data: line } as MessageEvent);
  return { worker, sent, reply };
}

function setup() {
  const fake = fakeWorker();
  const updates: AnalysisUpdate[] = [];
  const onError = vi.fn();
  const engine = new StockfishEngine((u) => updates.push(u), onError, fake.worker);
  return { ...fake, engine, updates, onError };
}

describe('StockfishEngine', () => {
  it('waits for the handshake, then analyses', () => {
    const { engine, sent, reply, updates } = setup();
    engine.analyse({ fen: START, multiPv: 2, depth: 10 });
    expect(sent).toEqual(['uci']);
    reply('uciok');
    reply('readyok');
    expect(sent.slice(-3)).toEqual([
      'setoption name MultiPV value 2',
      `position fen ${START}`,
      'go depth 10',
    ]);
    reply('info depth 8 multipv 2 score cp 10 pv d2d4');
    reply('info depth 8 multipv 1 score cp 30 pv e2e4 e7e5');
    const last = updates[updates.length - 1];
    expect(last.lines.map((l) => l.pv[0])).toEqual(['e2e4', 'd2d4']);
    expect(last.done).toBe(false);
    reply('bestmove e2e4');
    expect(updates[updates.length - 1].done).toBe(true);
  });

  it('stops the old search and drops its output before starting the next', () => {
    const { engine, sent, reply, updates } = setup();
    reply('uciok');
    reply('readyok');
    engine.analyse({ fen: START, multiPv: 1, depth: 10 });
    engine.analyse({ fen: AFTER_E4, multiPv: 1, depth: 10 });
    engine.analyse({ fen: AFTER_E4, multiPv: 1, depth: 12 });
    expect(sent.filter((m) => m === 'stop')).toHaveLength(1);

    // Late output from the first search must not be reported.
    const before = updates.length;
    reply('info depth 9 multipv 1 score cp 25 pv e2e4');
    expect(updates).toHaveLength(before);

    reply('bestmove e2e4');
    expect(sent.slice(-2)).toEqual([`position fen ${AFTER_E4}`, 'go depth 12']);
    reply('info depth 4 multipv 1 score cp 30 pv e7e5');
    const last = updates[updates.length - 1];
    expect(last.fen).toBe(AFTER_E4);
    // Black to move: +30 for Black is −30 from White's view.
    expect(last.lines[0].cp).toBe(-30);
  });

  it('reports a worker failure and shuts down', () => {
    const { worker, onError } = setup();
    worker.onerror?.({ message: 'wasm missing', preventDefault: () => {} } as ErrorEvent);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('wasm missing') }),
    );
    expect(worker.terminate).toHaveBeenCalled();
  });
});
