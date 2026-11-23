import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { StockfishEngine, type AnalysisUpdate } from '@/lib/engine/stockfish-engine';

export type EngineStatus = 'off' | 'loading' | 'thinking' | 'done' | 'game-over' | 'error';

interface Options {
  enabled: boolean;
  multiPv?: number;
  depth?: number;
}

/**
 * Analyse `fen` with a local Stockfish while `enabled`. The worker (≈1.9 MB,
 * cached by the browser after the first load) starts on first use and is shut
 * down on unmount. Results for an older position are never returned for a newer one.
 */
export function useEngineAnalysis(
  fen: string | null,
  { enabled, multiPv = 3, depth = 18 }: Options,
) {
  const engineRef = useRef<StockfishEngine | null>(null);
  const [update, setUpdate] = useState<AnalysisUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    },
    [],
  );

  const gameOver = (() => {
    if (!fen) return null;
    try {
      const chess = new Chess(fen);
      if (chess.isCheckmate()) return 'Checkmate';
      if (chess.isStalemate()) return 'Stalemate';
      if (chess.isDraw()) return 'Draw';
      return null;
    } catch {
      return 'Invalid position';
    }
  })();

  useEffect(() => {
    if (!enabled || !fen || gameOver || error) {
      engineRef.current?.stop();
      return;
    }
    if (!engineRef.current) {
      try {
        engineRef.current = new StockfishEngine(setUpdate, (e) => {
          setError(e.message);
          engineRef.current = null;
        });
      } catch (e) {
        console.error('[engine] Could not start Stockfish', e);
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    engineRef.current.analyse({ fen, multiPv, depth });
  }, [enabled, fen, multiPv, depth, gameOver, error]);

  const current = update && update.fen === fen ? update : null;
  let status: EngineStatus;
  if (!enabled) status = 'off';
  else if (error) status = 'error';
  else if (gameOver) status = 'game-over';
  else if (!current) status = 'loading';
  else status = current.done ? 'done' : 'thinking';

  return {
    status,
    error,
    gameOver,
    lines: current?.lines ?? [],
    depth: current?.depth ?? 0,
    maxDepth: depth,
  };
}
