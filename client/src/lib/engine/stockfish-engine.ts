import { parseInfoLine, type EngineLine } from './uci';

/**
 * Stockfish 19 "lite, single-threaded" (nmrugg/stockfish.js, GPL-3.0), served
 * as-is from client/public/engine/. The single-threaded build needs no
 * cross-origin isolation headers. The script reads its .wasm path from the URL
 * hash, so the pair can live anywhere.
 */
const ENGINE_JS = '/engine/stockfish-19-lite-single.js';
const ENGINE_WASM = '/engine/stockfish-19-lite-single.wasm';

export interface AnalysisRequest {
  fen: string;
  multiPv: number;
  depth: number;
}

export interface AnalysisUpdate {
  fen: string;
  /** Best lines so far, sorted by multipv (best first). */
  lines: EngineLine[];
  /** Deepest completed depth across the lines. */
  depth: number;
  /** True once the engine reported bestmove for this position. */
  done: boolean;
}

/** The subset of Worker the engine needs, so tests can supply a fake. */
export interface EngineWorker {
  postMessage(message: string): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export function createStockfishWorker(): EngineWorker {
  const wasm = new URL(ENGINE_WASM, window.location.href).href;
  return new Worker(`${ENGINE_JS}#${encodeURIComponent(wasm)}`);
}

/**
 * A UCI session over a Web Worker. Only one search runs at a time: asking for a
 * new position stops the current search, waits for its `bestmove` (so stale
 * `info` lines can't be attributed to the new position), then starts the next.
 */
export class StockfishEngine {
  private worker: EngineWorker;
  private ready = false;
  private searching = false;
  private stopSent = false;
  private active: AnalysisRequest | null = null;
  private pending: AnalysisRequest | null = null;
  private lines = new Map<number, EngineLine>();
  private disposed = false;

  constructor(
    private onUpdate: (update: AnalysisUpdate) => void,
    private onError: (error: Error) => void,
    worker: EngineWorker = createStockfishWorker(),
  ) {
    this.worker = worker;
    this.worker.onmessage = (event) => {
      if (typeof event.data === 'string') this.handleLine(event.data);
    };
    this.worker.onerror = (event) => {
      event.preventDefault?.();
      this.fail(new Error(`Engine failed to load: ${event.message || 'unknown error'}`));
    };
    this.worker.postMessage('uci');
  }

  analyse(request: AnalysisRequest) {
    if (this.disposed) return;
    this.pending = request;
    if (!this.ready) return;
    if (this.searching) {
      this.active = null;
      if (!this.stopSent) {
        this.stopSent = true;
        this.worker.postMessage('stop');
      }
      return;
    }
    this.startPending();
  }

  /** Stop analysing without starting anything else. */
  stop() {
    this.pending = null;
    this.active = null;
    if (this.searching && !this.stopSent) {
      this.stopSent = true;
      this.worker.postMessage('stop');
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
  }

  private fail(error: Error) {
    console.error('[engine]', error);
    this.onError(error);
    this.dispose();
  }

  private startPending() {
    const request = this.pending;
    if (!request) return;
    this.pending = null;
    this.active = request;
    this.lines.clear();
    this.searching = true;
    this.stopSent = false;
    this.worker.postMessage(`setoption name MultiPV value ${request.multiPv}`);
    this.worker.postMessage(`position fen ${request.fen}`);
    this.worker.postMessage(`go depth ${request.depth}`);
  }

  private handleLine(line: string) {
    if (this.disposed) return;
    if (line === 'uciok') {
      this.worker.postMessage('isready');
      return;
    }
    if (line === 'readyok') {
      if (!this.ready) {
        this.ready = true;
        this.startPending();
      }
      return;
    }
    if (line.startsWith('bestmove')) {
      this.searching = false;
      this.stopSent = false;
      const finished = this.active;
      this.active = null;
      if (finished && !this.pending) this.emit(finished, true);
      this.startPending();
      return;
    }
    const request = this.active;
    if (!request || !line.startsWith('info ')) return;
    const whiteToMove = request.fen.split(' ')[1] !== 'b';
    const parsed = parseInfoLine(line, whiteToMove);
    if (!parsed || parsed.multipv > request.multiPv) return;
    this.lines.set(parsed.multipv, parsed);
    this.emit(request, false);
  }

  private emit(request: AnalysisRequest, done: boolean) {
    const lines = Array.from(this.lines.values()).sort((a, b) => a.multipv - b.multipv);
    const depth = lines.reduce((max, l) => Math.max(max, l.depth), 0);
    this.onUpdate({ fen: request.fen, lines, depth, done });
  }
}
