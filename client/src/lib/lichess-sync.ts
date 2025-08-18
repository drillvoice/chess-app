import type { InsertTrainingSession } from '@shared/schema';
import { createSession } from './firebase';

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Global sync management
let currentSyncFunction: (() => void) | null = null;
let currentUsername: string | null = null;

export function startLichessSync(username: string) {
  // Stop any existing sync first
  if (currentSyncFunction) {
    console.log('Stopping existing Lichess sync for:', currentUsername);
    currentSyncFunction();
  }

  console.log('Starting Lichess sync for:', username);
  currentUsername = username;
  
  const key = `lichess-last-game-${username.toLowerCase()}`;
  let lastTimestamp = parseInt(localStorage.getItem(key) || '0', 10);
  let timer: ReturnType<typeof setInterval> | undefined;

  const poll = async () => {
    try {
      const url =
        `https://lichess.org/api/games/user/${encodeURIComponent(username)}?since=${lastTimestamp}` +
        `&max=1&clocks=false&moves=false&opening=false&format=json`;

      const res = await fetch(url, { headers: { Accept: 'application/x-ndjson' } });
      if (!res.ok) return;

      const text = await res.text();
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) return;

      const game = JSON.parse(lines[lines.length - 1]);
      if (game.lastMoveAt <= lastTimestamp) return;

      lastTimestamp = game.lastMoveAt;
      localStorage.setItem(key, String(lastTimestamp));

      const userLower = username.toLowerCase();
      const color =
        game.players?.white?.user?.name?.toLowerCase() === userLower ? 'white' : 'black';

      let result: 'win' | 'loss' | 'draw';
      if (game.status === 'draw') result = 'draw';
      else result = game.winner === color ? 'win' : 'loss';

      const duration = Math.round((game.lastMoveAt - game.createdAt) / 60000);

      let timeControl = '';
      if (game.clock) {
        const initial = Math.round((game.clock.initial || 0) / 60);
        const increment = game.clock.increment || 0;
        timeControl = increment ? `${initial}+${increment}` : `${initial}`;
      }

      const session: InsertTrainingSession = {
        type: 'game',
        platform: 'lichess',
        duration,
        playerColor: color,
        gameResult: result,
        timeControl,
        needsReview: true,
      };

      await createSession(session);
    } catch (err) {
      console.error('Lichess sync error:', err);
    }
  };

  poll();
  timer = setInterval(poll, POLL_INTERVAL);

  const stopFunction = () => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    if (currentSyncFunction === stopFunction) {
      currentSyncFunction = null;
      currentUsername = null;
    }
    console.log('Lichess sync stopped for:', username);
  };
  
  currentSyncFunction = stopFunction;
  return stopFunction;
}

// Helper function to restart sync with new username (called when settings change)
export function restartLichessSync(newUsername: string | undefined) {
  if (currentSyncFunction) {
    currentSyncFunction();
  }
  
  if (newUsername) {
    startLichessSync(newUsername);
  }
}
