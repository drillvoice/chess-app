# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pawn Star Chess Log — a PWA for logging chess training sessions (tactics, games, studies, goals) with offline-first IndexedDB storage, optional Firebase cloud sync, and Lichess game auto-import. Built with React 19 + Vite. There is no traditional application database: all user data lives in the browser (IndexedDB) and syncs to Firebase Firestore. The Express server exists only for local dev and as a thin Lichess API proxy.

## Commands

```bash
npm run dev              # Dev server (port 5000 by default)
npm run build            # Vite client build + esbuild server bundle → dist/
npm run start            # Production server from dist/
npm test                 # Vitest unit tests
npm run test:watch       # Vitest watch mode
npx vitest run path/to/file.test.ts  # Run a single test file
npm run test:e2e         # Playwright E2E tests (tests/ directory)
npm run lint             # ESLint
npm run lint:fix         # ESLint with auto-fix
npm run format           # Prettier
npm run format:check     # Prettier check only
npm run type-check       # TypeScript type checking
npm run validate         # type-check + lint + test (run before PRs)
```

Deployment is via **Vercel** (see `vercel.json`): `vite build` produces the static client
in `dist/public`, and all requests are rewritten to the serverless function at
`api/index.ts`. There is no `npm run deploy` script and no Firebase Hosting config.

## Architecture

### Directory Layout

- `client/src/` — React SPA (components, pages, hooks, lib); the real app and data layer
- `server/` — Express app for `npm run dev`/`npm run start` (Vite dev integration + a
  Lichess proxy). Its in-memory `MemStorage` CRUD routes are not used by the client.
- `api/index.ts` — Vercel serverless entry used in production; proxy-only (Lichess) + SPA fallback
- `shared/` — `schema.ts`: Drizzle (pg-core) table + Zod schemas used to derive shared
  TypeScript types and validation. Note: there is no live Postgres connection — Drizzle is
  used here for schema/type definitions only.
- `tests/` — Playwright E2E tests
- `public/` — PWA manifest, service worker, app icons

### Path Aliases

- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`

### Tech Stack

- **Routing:** Wouter (lightweight SPA router)
- **State:** TanStack React Query for server state, React hooks for local state
- **UI:** shadcn/ui (Radix primitives) + Tailwind CSS + Lucide icons
- **Forms:** React Hook Form + Zod resolvers
- **Storage:** IndexedDB (via `idb`) for offline-first local data, Firebase Firestore for cloud sync
- **Auth:** Firebase Auth (Google sign-in)
- **Schema/types:** Drizzle (`pg-core`) + Zod in `shared/schema.ts` for type and validation
  definitions only — no live database is connected

### Data Flow

Sessions are validated through type-specific Zod schemas in `shared/schema.ts` (tacticsSessionSchema, gameSessionSchema, studySessionSchema, goalSessionSchema). The single `training_sessions` table uses discriminated fields based on session `type`. Each type schema omits fields belonging to other types via `buildOmit`.

Client storage operations are in `client/src/lib/storage/` (IndexedDB). Firebase sync logic is in `client/src/lib/firebase/`. The app works fully offline and syncs when connectivity is available.

### Key Patterns

- Unit tests are colocated: `foo.ts` → `foo.test.ts`
- Filenames use kebab-case; components/types use PascalCase; functions/variables use camelCase
- Lazy loading for non-critical pages (Activity, Info)
- Custom hooks in `client/src/hooks/` for cross-cutting concerns (auth, sync, goals, PWA)

## Conventions

- Conventional Commits preferred (e.g., `feat(tactics): add puzzles ratio`)
- Prettier: single quotes, semicolons, 100 char width, trailing commas
- TypeScript strict mode enabled
- When modifying `shared/schema.ts`, note migration/backward compatibility implications
