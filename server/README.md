# Server

Express app for local development (`npm run dev`) and self-hosting (`npm run start`).

All user data lives client-side (IndexedDB + Firebase Firestore), so this server is not a
data backend. It serves the built client and proxies the Lichess API (CORS-friendly). In
production on Vercel, the equivalent proxy lives in `api/index.ts`.

## Architecture

- **Entry point**: `index.ts` creates the Express app, registers routes, and wires up Vite
  in dev / static serving in production.
- **Routes**: `routes.ts` exposes the `/api/lichess/latest` proxy.

## Development

- `npm run dev` – starts the server with hot reloading.
- `npm test` – run unit tests.
- `npm run test:coverage` – generate coverage report in `coverage/`.
