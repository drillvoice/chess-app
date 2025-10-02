import type { InsertTrainingSession } from '@shared/schema';
import { createSession } from './firebase';
import { queryClient } from './queryClient';

const POLL_INTERVAL = 30 * 1000; // 30 seconds

// Helper function to map Lichess time controls to our categories
export function mapLichessTimeControl(initialMinutes: number, _incrementSeconds: number): string {
  const totalInitialMinutes = initialMinutes;

  // Bullet: 1 minute and 2+1
  if (totalInitialMinutes <= 2) {
    return 'bullet';
  }

  // Blitz: 3+0, 3+2, 5, and 5+3
  if (totalInitialMinutes <= 5) {
    return 'blitz';
  }

  // Rapid: 10, 10+5, 15+10
  if (totalInitialMinutes <= 15) {
    return 'rapid';
  }

  // Classical: anything longer than 15+10
  return 'classical';
}

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
  const storedTimestamp = Number.parseInt(localStorage.getItem(key) ?? '', 10);
  let lastTimestamp = Number.isFinite(storedTimestamp) ? storedTimestamp : 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const poll = async () => {
    try {
      const params = new URLSearchParams({ username });
      if (Number.isFinite(lastTimestamp) && lastTimestamp > 0) {
        // Request games strictly after the last processed timestamp. The Lichess API
        // treats the `since` parameter as inclusive, so without bumping the value we
        // would repeatedly receive the same last game and never see newer ones when
        // `max=1` is used on the proxy endpoint.
        params.set('since', Math.trunc(lastTimestamp + 1).toString());
      }

      const res = await fetch(`/api/lichess/latest?${params.toString()}`);
      if (!res.ok) {
        console.error('Lichess proxy request failed:', res.status, await res.text());
        return;
      }

      const payload = (await res.json()) as { games?: any[] };
      if (!Array.isArray(payload.games) || payload.games.length === 0) {
        return;
      }

      const sortedGames = payload.games
        .slice()
        .sort((a, b) => Number(a?.lastMoveAt ?? 0) - Number(b?.lastMoveAt ?? 0));

      const userLower = username.toLowerCase();
      let importedAny = false;

      for (const game of sortedGames) {
        const lastMoveAt = Number(game?.lastMoveAt);
        if (!Number.isFinite(lastMoveAt) || lastMoveAt <= lastTimestamp) {
          continue;
        }

        const createdAt = Number(game?.createdAt ?? lastMoveAt);
        if (!Number.isFinite(createdAt)) {
          console.warn('Skipping Lichess game with invalid creation timestamp');
          continue;
        }

        const color =
          game?.players?.white?.user?.name?.toLowerCase() === userLower ? 'white' : 'black';

        const opponentUsername =
          color === 'white'
            ? game?.players?.black?.user?.name
            : game?.players?.white?.user?.name;

        let result: 'win' | 'loss' | 'draw';
        if (!game?.winner) {
          result = 'draw';
        } else {
          result = game.winner === color ? 'win' : 'loss';
        }

        const duration = Math.max(0, Math.round((lastMoveAt - createdAt) / 60000));

        let timeControl = '';
        if (game?.clock) {
          const initial = Math.round((game.clock.initial || 0) / 60);
          const increment = game.clock.increment || 0;
          timeControl = mapLichessTimeControl(initial, increment);
        }

        const session: InsertTrainingSession = {
          type: 'game',
          platform: 'lichess',
          duration,
          playerColor: color,
          gameResult: result,
          timeControl,
          opponentUsername,
          needsReview: true,
          gameComments: '',
        };

        try {
          await createSession(session);
        } catch (err) {
          console.error('Failed to save Lichess game session:', err);
          break;
        }

        lastTimestamp = lastMoveAt;
        localStorage.setItem(key, String(lastTimestamp));
        importedAny = true;
      }

      if (importedAny) {
        queryClient.invalidateQueries({ queryKey: ['pending-review'] });
        queryClient.invalidateQueries({ queryKey: ['statistics'] });
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      }
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
