import type { InsertTrainingSession } from '@shared/schema';
import { createSession, getAllSessions } from './firebase';
import { queryClient } from './queryClient';

const isDebug =
  typeof import.meta !== 'undefined' &&
  ((import.meta as any).env?.DEV ||
    (import.meta as any).env?.VITE_ENABLE_LICHESS_SYNC_DEBUG === 'true');
const debugLog = (...args: Parameters<typeof console.log>) => {
  if (isDebug) console.log(...args);
};

const POLL_INTERVAL = 30 * 1000; // 30 seconds

// Coerce a possibly-corrupt timestamp to a finite number for sorting. `?? 0`
// alone would let a NaN through and scramble sort order, since NaN comparisons
// are always false.
function finiteTimestamp(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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

/**
 * Map one game from the Lichess API onto a session, or null when the game
 * carries no usable timestamps. Shared by the poller and the manual import so
 * the two cannot drift apart in what they record.
 */
function buildSessionFromLichessGame(game: any, userLower: string): InsertTrainingSession | null {
  const lastMoveAt = Number(game?.lastMoveAt);
  const createdAt = Number(game?.createdAt ?? lastMoveAt);
  if (!Number.isFinite(lastMoveAt) || !Number.isFinite(createdAt)) {
    return null;
  }

  const color = game?.players?.white?.user?.name?.toLowerCase() === userLower ? 'white' : 'black';

  const opponentUsername =
    color === 'white' ? game?.players?.black?.user?.name : game?.players?.white?.user?.name;

  let result: 'win' | 'loss' | 'draw';
  if (!game?.winner) {
    result = 'draw';
  } else {
    result = game.winner === color ? 'win' : 'loss';
  }

  let timeControl = '';
  if (game?.clock) {
    const initial = Math.round((game.clock.initial || 0) / 60);
    const increment = game.clock.increment || 0;
    timeControl = mapLichessTimeControl(initial, increment);
  }

  return {
    type: 'game',
    platform: 'lichess',
    duration: Math.max(0, Math.round((lastMoveAt - createdAt) / 60000)),
    playerColor: color,
    gameResult: result,
    timeControl,
    opponentUsername,
    openingName: typeof game?.opening?.name === 'string' ? game.opening.name : undefined,
    openingEco: typeof game?.opening?.eco === 'string' ? game.opening.eco : undefined,
    needsReview: true,
    gameComments: '',
    // Use the game's end time (lastMoveAt) as the session date, not the current sync time
    date: new Date(lastMoveAt),
  };
}

/**
 * The end times of every Lichess game already in the log, used to skip a game
 * on re-import.
 *
 * The only thing standing between a game and a second copy of it used to be the
 * `lichess-last-game-*` watermark — which lives in localStorage, so it is per
 * device. A desktop whose watermark has fallen behind the phone's re-imports
 * every game the phone logged in the meantime as a *fresh* session with
 * `needsReview: true`, dated at the original game, and cloud sync then spreads
 * those duplicates to every device. Games the user had already reviewed and
 * archived on the phone reappear in the review queue that way.
 *
 * `date` is the key because the importer sets it from the game's own
 * `lastMoveAt` in exact milliseconds: it is chosen by Lichess rather than by
 * the importing device, and survives the round trip through IndexedDB and
 * Firestore unchanged. So it identifies a copy imported months ago on another
 * device just as well as one imported a moment ago — including records written
 * before this check existed, which is what lets it work without a schema
 * migration. A game whose date the user has since edited by hand no longer
 * matches; nothing else the import records is stable enough to key on.
 */
async function loadImportedGameKeys(): Promise<Set<number>> {
  const sessions = await getAllSessions();
  const keys = new Set<number>();
  for (const session of sessions) {
    if (session.type !== 'game' || session.platform !== 'lichess') continue;
    const endedAt = new Date(session.date).getTime();
    if (Number.isFinite(endedAt)) keys.add(endedAt);
  }
  return keys;
}

// Global sync management
let currentSyncFunction: (() => void) | null = null;
let currentUsername: string | null = null;

export function startLichessSync(username: string) {
  // Stop any existing sync first
  if (currentSyncFunction) {
    debugLog(`🛑 [Lichess Sync] Stopping existing sync for: ${currentUsername}`);
    currentSyncFunction();
  }

  debugLog(`✅ [Lichess Sync] Starting sync for: ${username}`);
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
  debugLog(`📊 [Lichess Sync] Initial status:`, syncStatus);

  const key = `lichess-last-game-${username.toLowerCase()}`;
  const storedTimestamp = Number.parseInt(localStorage.getItem(key) ?? '', 10);

  // If no timestamp exists (first time), use current time to only sync future games
  let lastTimestamp =
    Number.isFinite(storedTimestamp) && storedTimestamp > 0 ? storedTimestamp : Date.now();

  // Save the initial timestamp if this is the first time
  if (!Number.isFinite(storedTimestamp) || storedTimestamp === 0) {
    localStorage.setItem(key, String(lastTimestamp));
    debugLog(`📝 [Lichess Sync] First time setup - starting from now: ${lastTimestamp}`);
  }

  debugLog(`📝 [Lichess Sync] localStorage key: ${key}, stored timestamp: ${lastTimestamp}`);
  let timer: ReturnType<typeof setInterval> | undefined;
  let isPollInFlight = false;

  const poll = async () => {
    if (isPollInFlight) {
      debugLog(`⏭️ [Lichess Sync Poll] Skipping: previous poll still in flight`);
      return;
    }

    isPollInFlight = true;
    try {
      debugLog(
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
        debugLog(`🔄 [Lichess Sync Poll] Requesting games since: ${Math.trunc(lastTimestamp + 1)}`);
      } else {
        debugLog(`🔄 [Lichess Sync Poll] No timestamp, fetching all recent games`);
      }

      const apiUrl = `/api/lichess/latest?${params.toString()}`;
      debugLog(`🔄 [Lichess Sync Poll] Fetching: ${apiUrl}`);
      const res = await fetch(apiUrl);
      debugLog(`🔄 [Lichess Sync Poll] Response status: ${res.status}`);

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[Lichess Sync Poll] API request failed:', res.status, errorText);
        const errorMessage = `Failed to fetch games from Lichess (${res.status})`;
        syncStatus.lastError = errorMessage;
        notifyError(errorMessage);
        syncStatus.isSyncing = false;
        notifyStatusChange();
        return;
      }

      const payload = (await res.json()) as { games?: any[] };
      debugLog(`✅ [Lichess Sync Poll] Received ${payload.games?.length || 0} games`);

      if (!Array.isArray(payload.games) || payload.games.length === 0) {
        // No new games - reset syncing state and update last sync time
        debugLog(`✅ [Lichess Sync Poll] No new games, sync complete`);
        syncStatus.isSyncing = false;
        syncStatus.lastSyncTime = new Date();
        syncStatus.lastError = null;
        notifyStatusChange();
        return;
      }

      const sortedGames = payload.games
        .slice()
        .sort((a, b) => finiteTimestamp(a?.lastMoveAt) - finiteTimestamp(b?.lastMoveAt));

      debugLog(`🔄 [Lichess Sync Poll] Processing ${sortedGames.length} games`);
      const userLower = username.toLowerCase();
      const importedKeys = await loadImportedGameKeys();
      let importedCount = 0;

      for (const game of sortedGames) {
        const lastMoveAt = Number(game?.lastMoveAt);
        if (!Number.isFinite(lastMoveAt) || lastMoveAt <= lastTimestamp) {
          debugLog(
            `⏭️ [Lichess Sync Poll] Skipping game (already processed): lastMoveAt=${lastMoveAt}`,
          );
          continue;
        }

        const session = buildSessionFromLichessGame(game, userLower);
        if (!session) {
          console.warn('⚠️ [Lichess Sync Poll] Skipping game with invalid timestamps');
          continue;
        }

        // Already logged — by this device on an earlier run, or by another
        // device whose games arrived over cloud sync. Advance the watermark
        // past it, but leave the existing session alone: it may carry mistake
        // tags and an archived review state that a fresh import would not.
        if (importedKeys.has(lastMoveAt)) {
          debugLog(`⏭️ [Lichess Sync Poll] Skipping already-logged game: id=${game?.id}`);
          lastTimestamp = lastMoveAt;
          localStorage.setItem(key, String(lastTimestamp));
          continue;
        }

        debugLog(`📥 [Lichess Sync Poll] Importing game: id=${game?.id}, lastMoveAt=${lastMoveAt}`);

        try {
          debugLog(`💾 [Lichess Sync Poll] Saving session to Firebase...`);
          await createSession(session);
          debugLog(`✅ [Lichess Sync Poll] Session saved successfully`);
        } catch (err) {
          console.error('[Lichess Sync Poll] Failed to save session:', err);
          break;
        }

        importedKeys.add(lastMoveAt);
        lastTimestamp = lastMoveAt;
        localStorage.setItem(key, String(lastTimestamp));
        debugLog(`📝 [Lichess Sync Poll] Updated timestamp to: ${lastTimestamp}`);
        importedCount++;
      }

      if (importedCount > 0) {
        debugLog(`✅ [Lichess Sync Poll] Imported games, invalidating queries`);
        queryClient.invalidateQueries({ queryKey: ['pending-review'] });
        queryClient.invalidateQueries({ queryKey: ['statistics'] });
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        syncStatus.gamesImported += importedCount;
      }

      // Update sync status on success
      syncStatus.isSyncing = false;
      syncStatus.lastSyncTime = new Date();
      syncStatus.lastError = null;
      notifyStatusChange();
      debugLog(`✅ [Lichess Sync Poll] Poll complete, next poll in ${POLL_INTERVAL / 1000}s`);
    } catch (err) {
      console.error('[Lichess Sync Poll] Poll error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown sync error';
      syncStatus.isSyncing = false;
      syncStatus.lastError = errorMessage;
      notifyError(errorMessage);
      notifyStatusChange();
    } finally {
      isPollInFlight = false;
    }
  };

  debugLog(`🚀 [Lichess Sync] Triggering initial poll...`);
  poll();
  debugLog(`⏰ [Lichess Sync] Setting up interval timer (${POLL_INTERVAL / 1000}s)`);
  timer = setInterval(poll, POLL_INTERVAL);

  const stopFunction = () => {
    debugLog(`🛑 [Lichess Sync] Stop function called for: ${username}`);
    if (timer) {
      clearInterval(timer);
      timer = undefined;
      debugLog(`⏰ [Lichess Sync] Timer cleared`);
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

    debugLog(`✅ [Lichess Sync] Sync stopped for: ${username}`);
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
    const importedKeys = await loadImportedGameKeys();
    let importedCount = 0;

    for (const game of sortedGames) {
      const lastMoveAt = Number(game?.lastMoveAt);
      if (!Number.isFinite(lastMoveAt) || lastMoveAt <= lastTimestamp) {
        continue;
      }

      const session = buildSessionFromLichessGame(game, userLower);
      if (!session) {
        console.warn('Skipping Lichess game with invalid timestamps');
        continue;
      }

      // Already logged; see loadImportedGameKeys. This matters most here —
      // a device with no watermark sends no `since`, so the proxy hands back
      // the last 50 games and every one of them would otherwise be re-created.
      if (importedKeys.has(lastMoveAt)) {
        lastTimestamp = lastMoveAt;
        localStorage.setItem(key, String(lastTimestamp));
        continue;
      }

      try {
        await createSession(session);
        importedKeys.add(lastMoveAt);
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
  debugLog(`Reset sync timestamp for ${usernameToReset}`);
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
