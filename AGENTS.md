# Repository Guidelines

## Project Structure & Module Organization
- `client/` – React 18 + Vite app. Source in `client/src/` (components, pages, hooks, lib). Static assets in `client/public/`.
- `server/` – Node/Express entry points and routes.
- `shared/` – Cross‑package TypeScript types and Zod/Drizzle schemas (e.g., `shared/schema.ts`).
- `tests/` – Playwright E2E tests. Unit/integration tests live next to code as `*.test.ts(x)`.
- `public/` – App icons/manifests for deployment.
- `scripts/` – Dev/CI helper scripts.

## Build, Test, and Development Commands
- `npm run dev` – Start local server (development).
- `npm run build` – Build client (Vite) and bundle server (esbuild) into `dist/`.
- `npm start` – Run production build from `dist/`.
- `npm test` – Run unit/integration tests with Vitest.
- `npm run test:e2e` – Run Playwright end‑to‑end tests (use `npm run pretest:e2e` once to install browsers).
- `npm run lint` / `npm run lint:fix` – Lint and auto‑fix.
- `npm run format` – Format with Prettier.
- `npm run type-check` – TypeScript type checks.
- `npm run validate` – Type, lint, and test in one go (use before PRs).

## Coding Style & Naming Conventions
- TypeScript throughout; React components in `*.tsx`.
- Use Prettier defaults and ESLint rules; 2‑space indentation.
- Filenames: kebab‑case (e.g., `tactics-modal.tsx`).
- Variables/functions: `camelCase`. Components/types: `PascalCase`.
- Keep changes minimal and aligned with existing patterns.

## Testing Guidelines
- Framework: Vitest (+ Testing Library for React), Playwright for E2E.
- Place unit tests alongside code: `foo.ts` → `foo.test.ts`.
- Prefer focused unit tests for changed logic; add tests when modifying schemas, reducers, or hooks.
- Run `npm run validate` locally; ensure tests pass without relying on network.

## Commit & Pull Request Guidelines
- Use Conventional Commits where possible (e.g., `feat(tactics): add puzzles ratio`).
- PRs should include:
  - Clear description of the change and rationale.
  - Linked issue (if applicable) and screenshots/GIFs for UI changes.
  - Notes on migration/backward compatibility when touching `shared/schema.ts`.
  - Updated/added tests and passing `npm run validate`.

## Security & Configuration Tips
- Do not commit secrets. Firebase and third‑party credentials must come from environment/config.
- Local development favors offline storage; avoid introducing hard network dependencies in tests.
