import type { InsertTrainingSession } from '@shared/schema';
import { createSession } from './firebase';
import { queryClient } from './queryClient';

const POLL_INTERVAL = 30 * 1000; // 30 seconds

export interface LichessSyncStatus {
  isActive: boolean;
  username: string | null;
  lastSyncTime: Date | null;
  lastError: string | null;
  isSyncing: boolean;
  gamesImported: number;
}

// Global sync status
let syncStatus: LichessSyncStatus = {
  isActive: false,
  username: null,
  lastSyncTime: null,
  lastError: null,
  isSyncing: false,
  gamesImported: 0,
};

// Status change listeners
const statusListeners: Set<(status: LichessSyncStatus) => void> = new Set();

// Error event listeners for toast notifications
type ErrorEventListener = (error: { message: string; timestamp: Date }) => void;
const errorListeners: Set<ErrorEventListener> = new Set();

function notifyStatusChange() {
  statusListeners.forEach((listener) => listener({ ...syncStatus }));
}

function notifyError(message: string) {
  const errorEvent = { message, timestamp: new Date() };
  errorListeners.forEach((listener) => listener(errorEvent));
}

export function subscribeSyncStatus(listener: (status: LichessSyncStatus) => void) {
  statusListeners.add(listener);
  // Immediately notify with current status
  listener({ ...syncStatus });
  return () => statusListeners.delete(listener);
}

export function subscribeErrors(listener: ErrorEventListener) {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

export function getSyncStatus(): LichessSyncStatus {
  return { ...syncStatus };
}

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
    console.log(`🛑 [Lichess Sync] Stopping existing sync for: ${currentUsername}`);
    currentSyncFunction();
  }

  console.log(`✅ [Lichess Sync] Starting sync for: ${username}`);
  currentUsername = username;

  // Update sync status
  syncStatus = {
    isActive: true,
    username,
    lastSyncTime: syncStatus.lastSyncTime,
    lastError: null,
    isSyncing: false,
    gamesImported: syncStatus.gamesImported,
  };
  notifyStatusChange();
  console.log(`📊 [Lichess Sync] Initial status:`, syncStatus);

  const key = `lichess-last-game-${username.toLowerCase()}`;
  const storedTimestamp = Number.parseInt(localStorage.getItem(key) ?? '', 10);

  // If no timestamp exists (first time), use current time to only sync future games
  let lastTimestamp =
    Number.isFinite(storedTimestamp) && storedTimestamp > 0 ? storedTimestamp : Date.now();

  // Save the initial timestamp if this is the first time
  if (!Number.isFinite(storedTimestamp) || storedTimestamp === 0) {
    localStorage.setItem(key, String(lastTimestamp));
    console.log(`📝 [Lichess Sync] First time setup - starting from now: ${lastTimestamp}`);
  }

  console.log(`📝 [Lichess Sync] localStorage key: ${key}, stored timestamp: ${lastTimestamp}`);
  let timer: ReturnType<typeof setInterval> | undefined;

  const poll = async () => {
    try {
      console.log(
        `🔄 [Lichess Sync Poll] Starting poll for ${username}, lastTimestamp: ${lastTimestamp}`,
      );
      syncStatus.isSyncing = true;
      syncStatus.lastError = null;
      notifyStatusChange();
      const params = new URLSearchParams({ username });
      if (Number.isFinite(lastTimestamp) && lastTimestamp > 0) {
        // Request games strictly after the last processed timestamp. The Lichess API
        // treats the `since` parameter as inclusive, so without bumping the value we
        // would repeatedly receive the same last game and never see newer ones when
        // `max=1` is used on the proxy endpoint.
        params.set('since', Math.trunc(lastTimestamp + 1).toString());
        console.log(
          `🔄 [Lichess Sync Poll] Requesting games since: ${Math.trunc(lastTimestamp + 1)}`,
        );
      } else {
        console.log(`🔄 [Lichess Sync Poll] No timestamp, fetching all recent games`);
      }

      const apiUrl = `/api/lichess/latest?${params.toString()}`;
      console.log(`🔄 [Lichess Sync Poll] Fetching: ${apiUrl}`);
      const res = await fetch(apiUrl);
      console.log(`🔄 [Lichess Sync Poll] Response status: ${res.status}`);

      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ [Lichess Sync Poll] API request failed:', res.status, errorText);
        const errorMessage = `Failed to fetch games from Lichess (${res.status})`;
        syncStatus.lastError = errorMessage;
        notifyError(errorMessage);
        syncStatus.isSyncing = false;
        notifyStatusChange();
        return;
      }

      const payload = (await res.json()) as { games?: any[] };
      console.log(`✅ [Lichess Sync Poll] Received ${payload.games?.length || 0} games`);

      if (!Array.isArray(payload.games) || payload.games.length === 0) {
        // No new games - reset syncing state and update last sync time
        console.log(`✅ [Lichess Sync Poll] No new games, sync complete`);
        syncStatus.isSyncing = false;
        syncStatus.lastSyncTime = new Date();
        syncStatus.lastError = null;
        notifyStatusChange();
        return;
      }

      const sortedGames = payload.games
        .slice()
        .sort((a, b) => Number(a?.lastMoveAt ?? 0) - Number(b?.lastMoveAt ?? 0));

      console.log(`🔄 [Lichess Sync Poll] Processing ${sortedGames.length} games`);
      const userLower = username.toLowerCase();
      let importedAny = false;

      for (const game of sortedGames) {
        const lastMoveAt = Number(game?.lastMoveAt);
        if (!Number.isFinite(lastMoveAt) || lastMoveAt <= lastTimestamp) {
          console.log(
            `⏭️ [Lichess Sync Poll] Skipping game (already processed): lastMoveAt=${lastMoveAt}`,
          );
          continue;
        }

        const createdAt = Number(game?.createdAt ?? lastMoveAt);
        if (!Number.isFinite(createdAt)) {
          console.warn('⚠️ [Lichess Sync Poll] Skipping game with invalid creation timestamp');
          continue;
        }

        console.log(
          `📥 [Lichess Sync Poll] Importing game: id=${game?.id}, lastMoveAt=${lastMoveAt}`,
        );

        const color =
          game?.players?.white?.user?.name?.toLowerCase() === userLower ? 'white' : 'black';

        const opponentUsername =
          color === 'white' ? game?.players?.black?.user?.name : game?.players?.white?.user?.name;

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

        // Use the game's end time (lastMoveAt) as the session date, not the current sync time
        const gameEndDate = new Date(lastMoveAt);

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
          date: gameEndDate,
        };

        try {
          console.log(`💾 [Lichess Sync Poll] Saving session to Firebase...`);
          await createSession(session);
          console.log(`✅ [Lichess Sync Poll] Session saved successfully`);
        } catch (err) {
          console.error('❌ [Lichess Sync Poll] Failed to save session:', err);
          console.error('❌ [Lichess Sync Poll] Session data:', session);
          break;
        }

        lastTimestamp = lastMoveAt;
        localStorage.setItem(key, String(lastTimestamp));
        console.log(`📝 [Lichess Sync Poll] Updated timestamp to: ${lastTimestamp}`);
        importedAny = true;
      }

      if (importedAny) {
        console.log(`✅ [Lichess Sync Poll] Imported games, invalidating queries`);
        queryClient.invalidateQueries({ queryKey: ['pending-review'] });
        queryClient.invalidateQueries({ queryKey: ['statistics'] });
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        syncStatus.gamesImported += sortedGames.length;
      }

      // Update sync status on success
      syncStatus.isSyncing = false;
      syncStatus.lastSyncTime = new Date();
      syncStatus.lastError = null;
      notifyStatusChange();
      console.log(`✅ [Lichess Sync Poll] Poll complete, next poll in ${POLL_INTERVAL / 1000}s`);
    } catch (err) {
      console.error('❌ [Lichess Sync Poll] Poll error:', err);
      console.error('❌ [Lichess Sync Poll] Error details:', {
        name: err instanceof Error ? err.name : 'unknown',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      const errorMessage = err instanceof Error ? err.message : 'Unknown sync error';
      syncStatus.isSyncing = false;
      syncStatus.lastError = errorMessage;
      notifyError(errorMessage);
      notifyStatusChange();
    }
  };

  console.log(`🚀 [Lichess Sync] Triggering initial poll...`);
  poll();
  console.log(`⏰ [Lichess Sync] Setting up interval timer (${POLL_INTERVAL / 1000}s)`);
  timer = setInterval(poll, POLL_INTERVAL);

  const stopFunction = () => {
    console.log(`🛑 [Lichess Sync] Stop function called for: ${username}`);
    if (timer) {
      clearInterval(timer);
      timer = undefined;
      console.log(`⏰ [Lichess Sync] Timer cleared`);
    }
    if (currentSyncFunction === stopFunction) {
      currentSyncFunction = null;
      currentUsername = null;
    }

    // Update sync status
    syncStatus = {
      isActive: false,
      username: null,
      lastSyncTime: syncStatus.lastSyncTime,
      lastError: null,
      isSyncing: false,
      gamesImported: syncStatus.gamesImported,
    };
    notifyStatusChange();

    console.log(`✅ [Lichess Sync] Sync stopped for: ${username}`);
  };

  currentSyncFunction = stopFunction;
  return stopFunction;
}

// Manual sync trigger - forces an immediate poll
export async function triggerManualSync(): Promise<{
  success: boolean;
  gamesImported: number;
  error?: string;
}> {
  if (!syncStatus.isActive || !syncStatus.username) {
    return {
      success: false,
      gamesImported: 0,
      error: 'Sync is not active or username not set',
    };
  }

  const username = syncStatus.username;
  const key = `lichess-last-game-${username.toLowerCase()}`;
  const storedTimestamp = Number.parseInt(localStorage.getItem(key) ?? '', 10);
  let lastTimestamp = Number.isFinite(storedTimestamp) ? storedTimestamp : 0;

  try {
    syncStatus.isSyncing = true;
    syncStatus.lastError = null;
    notifyStatusChange();

    const params = new URLSearchParams({ username });
    if (Number.isFinite(lastTimestamp) && lastTimestamp > 0) {
      params.set('since', Math.trunc(lastTimestamp + 1).toString());
    }

    const res = await fetch(`/api/lichess/latest?${params.toString()}`);
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Lichess proxy request failed:', res.status, errorText);
      throw new Error(`API request failed: ${res.status} ${errorText}`);
    }

    const payload = (await res.json()) as { games?: any[] };
    if (!Array.isArray(payload.games) || payload.games.length === 0) {
      syncStatus.isSyncing = false;
      syncStatus.lastSyncTime = new Date();
      syncStatus.lastError = null;
      notifyStatusChange();
      return { success: true, gamesImported: 0 };
    }

    const sortedGames = payload.games
      .slice()
      .sort((a, b) => Number(a?.lastMoveAt ?? 0) - Number(b?.lastMoveAt ?? 0));

    const userLower = username.toLowerCase();
    let importedCount = 0;

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
        color === 'white' ? game?.players?.black?.user?.name : game?.players?.white?.user?.name;

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

      // Use the game's end time (lastMoveAt) as the session date, not the current sync time
      const gameEndDate = new Date(lastMoveAt);

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
        date: gameEndDate,
      };

      try {
        await createSession(session);
        lastTimestamp = lastMoveAt;
        localStorage.setItem(key, String(lastTimestamp));
        importedCount++;
      } catch (err) {
        console.error('Failed to save Lichess game session:', err);
        throw err;
      }
    }

    if (importedCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['pending-review'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      syncStatus.gamesImported += importedCount;
    }

    syncStatus.isSyncing = false;
    syncStatus.lastSyncTime = new Date();
    syncStatus.lastError = null;
    notifyStatusChange();

    return { success: true, gamesImported: importedCount };
  } catch (err) {
    console.error('Manual Lichess sync error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown sync error';
    syncStatus.isSyncing = false;
    syncStatus.lastError = errorMessage;
    notifyStatusChange();
    return { success: false, gamesImported: 0, error: errorMessage };
  }
}

// Reset the timestamp for a username (useful for debugging/fixing issues)
export function resetSyncTimestamp(username?: string): void {
  const usernameToReset = username || syncStatus.username;
  if (!usernameToReset) {
    console.warn('No username provided and no active sync');
    return;
  }

  const key = `lichess-last-game-${usernameToReset.toLowerCase()}`;
  localStorage.removeItem(key);
  console.log(`Reset sync timestamp for ${usernameToReset}`);
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
