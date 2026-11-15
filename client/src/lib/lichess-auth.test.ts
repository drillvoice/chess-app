import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  codeChallengeFor,
  completeLichessLogin,
  connectWithPersonalToken,
  disconnectLichess,
  getLichessConnection,
  LichessAuthError,
  startLichessLogin,
} from './lichess-auth';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('lichess-auth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('derives the RFC 7636 S256 challenge', async () => {
    // Test vector from RFC 7636 appendix B.
    expect(await codeChallengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('runs the full PKCE round trip', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      origin: 'https://app.example',
      assign,
    } as Location);

    await startLichessLogin('/focus');
    const authUrl = new URL(assign.mock.calls[0][0]);
    expect(authUrl.origin + authUrl.pathname).toBe('https://lichess.org/oauth');
    expect(authUrl.searchParams.get('redirect_uri')).toBe('https://app.example/lichess-callback');
    expect(authUrl.searchParams.get('scope')).toBe('puzzle:read puzzle:write');
    const state = authUrl.searchParams.get('state');

    let tokenForm: URLSearchParams | null = null;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/token')) {
        tokenForm = new URLSearchParams(init?.body as URLSearchParams);
        return jsonResponse({ access_token: 'lio_tok', expires_in: 3600 });
      }
      return jsonResponse({ username: 'PawnStar' });
    });

    const { returnPath, connection } = await completeLichessLogin(
      `?code=liu_code&state=${state}`,
      fetchImpl as typeof fetch,
    );
    expect(returnPath).toBe('/focus');
    expect(tokenForm!.get('code')).toBe('liu_code');
    expect(await codeChallengeFor(tokenForm!.get('code_verifier')!)).toBe(
      authUrl.searchParams.get('code_challenge'),
    );
    expect(connection.username).toBe('PawnStar');
    expect(getLichessConnection()?.accessToken).toBe('lio_tok');
  });

  it('rejects a mismatched state', async () => {
    localStorage.setItem(
      'lichess-oauth-pending',
      JSON.stringify({ verifier: 'v', state: 'good', returnPath: '/', redirectUri: 'x' }),
    );
    await expect(completeLichessLogin('?code=c&state=evil')).rejects.toThrow(/did not match/);
  });

  it('explains a declined consent', async () => {
    await expect(completeLichessLogin('?error=access_denied')).rejects.toThrow(/declined/);
  });

  it('drops expired or corrupt connections', () => {
    localStorage.setItem(
      'lichess-oauth',
      JSON.stringify({ accessToken: 't', username: 'u', expiresAt: Date.now() - 1 }),
    );
    expect(getLichessConnection()).toBeNull();
    localStorage.setItem('lichess-oauth', '{not json');
    expect(getLichessConnection()).toBeNull();
  });

  it('connects with a personal token and disconnects', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ username: 'PawnStar' }));
    await connectWithPersonalToken('  lip_x ', fetchImpl as typeof fetch);
    expect(getLichessConnection()).toEqual({
      accessToken: 'lip_x',
      username: 'PawnStar',
      expiresAt: null,
    });
    await disconnectLichess(fetchImpl as typeof fetch);
    expect(getLichessConnection()).toBeNull();
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'https://lichess.org/api/token',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('rejects a token Lichess refuses', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 401));
    await expect(connectWithPersonalToken('bad', fetchImpl as typeof fetch)).rejects.toBeInstanceOf(
      LichessAuthError,
    );
    expect(getLichessConnection()).toBeNull();
  });
});
