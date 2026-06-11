/**
 * Dev/Express server's view of the Lichess proxy. The implementation lives in
 * api/_lichess.ts so the Vercel serverless function and this server can never
 * diverge in fetch behaviour, error handling, or response shape.
 *
 * The shared file sits inside api/ (not here) because the Vercel function must
 * not import across its directory boundary — see the header in api/_lichess.ts.
 */
export { fetchLichessGames, LichessProxyError, type LichessLatestResponse } from '../api/_lichess';
