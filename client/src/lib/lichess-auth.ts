/**
 * "Connect Lichess account" via OAuth2 PKCE, done entirely in the browser.
 * Lichess needs no app registration for PKCE: any client_id works, and its
 * /oauth, /api/token and /api/account endpoints are CORS-enabled.
 *
 * The access token is kept in localStorage on this device only. It is never
 * written to IndexedDB or synced to Firestore.
 */

const LICHESS = 'https://lichess.org';
const CLIENT_ID = 'pawn-star-chess-log';
export const LICHESS_SCOPES = ['puzzle:read', 'puzzle:write'];
export const CALLBACK_PATH = '/lichess-callback';

const TOKEN_KEY = 'lichess-oauth';
const PENDING_KEY = 'lichess-oauth-pending';
const CHANGE_EVENT = 'lichess-auth-change';

export interface LichessConnection {
  accessToken: string;
  username: string;
  /** Epoch ms, or null if Lichess didn't say (personal tokens). */
  expiresAt: number | null;
}

interface PendingLogin {
  verifier: string;
  state: string;
  returnPath: string;
  redirectUri: string;
}

export class LichessAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LichessAuthError';
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLength: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    throw new LichessAuthError(
      `Could not save Lichess sign-in on this device (storage blocked?): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** Current connection, or null. Expired or malformed entries are cleared. */
export function getLichessConnection(): LichessConnection | null {
  const stored = readJson<Partial<LichessConnection>>(TOKEN_KEY);
  if (!stored) return null;
  const expiresAt = Number.isFinite(stored.expiresAt) ? (stored.expiresAt as number) : null;
  if (
    typeof stored.accessToken !== 'string' ||
    !stored.accessToken ||
    typeof stored.username !== 'string' ||
    (expiresAt !== null && expiresAt <= Date.now())
  ) {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing more we can do; the entry is ignored either way.
    }
    return null;
  }
  return { accessToken: stored.accessToken, username: stored.username, expiresAt };
}

function setConnection(connection: LichessConnection | null) {
  writeJson(TOKEN_KEY, connection);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Subscribe to connect/disconnect, including changes made in other tabs. */
export function subscribeLichessConnection(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Send the browser to Lichess to approve access; it comes back to CALLBACK_PATH. */
export async function startLichessLogin(returnPath: string): Promise<void> {
  const verifier = randomString(64);
  const state = randomString(16);
  const redirectUri = `${window.location.origin}${CALLBACK_PATH}`;
  writeJson(PENDING_KEY, { verifier, state, returnPath, redirectUri } satisfies PendingLogin);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: LICHESS_SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: await codeChallengeFor(verifier),
    state,
  });
  window.location.assign(`${LICHESS}/oauth?${params}`);
}

async function fetchUsername(accessToken: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(`${LICHESS}/api/account`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new LichessAuthError(`Lichess rejected the token (status ${response.status})`);
  }
  const account = (await response.json()) as { username?: unknown };
  if (typeof account.username !== 'string') {
    throw new LichessAuthError('Lichess account response had no username');
  }
  return account.username;
}

/**
 * Handle the redirect back from Lichess. Returns the path to send the user to.
 * Throws LichessAuthError with a user-presentable message on any failure.
 */
export async function completeLichessLogin(
  search: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ returnPath: string; connection: LichessConnection }> {
  const params = new URLSearchParams(search);
  const pending = readJson<PendingLogin>(PENDING_KEY);
  writeJson(PENDING_KEY, null);

  const error = params.get('error');
  if (error) {
    const reason = params.get('error_description') ?? error;
    throw new LichessAuthError(
      error === 'access_denied' ? 'You declined access on Lichess.' : `Lichess said: ${reason}`,
    );
  }
  if (!pending) {
    throw new LichessAuthError(
      'This sign-in was started in a different window or browser. Please try connecting again.',
    );
  }
  const code = params.get('code');
  if (!code || params.get('state') !== pending.state) {
    throw new LichessAuthError('Lichess sign-in response did not match. Please try again.');
  }

  const response = await fetchImpl(`${LICHESS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: pending.verifier,
      redirect_uri: pending.redirectUri,
      client_id: CLIENT_ID,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 160);
    throw new LichessAuthError(
      `Lichess token exchange failed (status ${response.status})${detail ? `: ${detail}` : ''}`,
    );
  }
  const token = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof token.access_token !== 'string') {
    throw new LichessAuthError('Lichess token response had no access token');
  }
  const expiresIn = Number(token.expires_in);
  const connection: LichessConnection = {
    accessToken: token.access_token,
    username: await fetchUsername(token.access_token, fetchImpl),
    expiresAt: Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : null,
  };
  setConnection(connection);
  return { returnPath: pending.returnPath || '/', connection };
}

/**
 * Fallback for when the redirect flow can't complete (e.g. some installed-PWA
 * setups): connect with a personal API token created on lichess.org.
 */
export async function connectWithPersonalToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LichessConnection> {
  const accessToken = token.trim();
  if (!accessToken) throw new LichessAuthError('Paste a token first');
  const connection = {
    accessToken,
    username: await fetchUsername(accessToken, fetchImpl),
    expiresAt: null,
  };
  setConnection(connection);
  return connection;
}

export const PERSONAL_TOKEN_URL = `${LICHESS}/account/oauth/token/create?${LICHESS_SCOPES.map(
  (s) => `scopes[]=${encodeURIComponent(s)}`,
).join('&')}&description=${encodeURIComponent('Pawn Star Chess Log')}`;

/** Forget the token locally and ask Lichess to revoke it (best effort). */
export async function disconnectLichess(fetchImpl: typeof fetch = fetch): Promise<void> {
  const connection = getLichessConnection();
  setConnection(null);
  if (!connection) return;
  try {
    await fetchImpl(`${LICHESS}/api/token`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${connection.accessToken}` },
    });
  } catch (error) {
    console.warn('[Lichess auth] Token revoke failed; it was still removed locally', error);
  }
}

/** Call when Lichess answers 401: the token is dead, so drop it. */
export function handleLichessUnauthorized() {
  setConnection(null);
}
