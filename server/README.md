# Server

Express backend providing REST APIs for training sessions and statistics.

## Architecture
- **Entry point**: `index.ts` creates the Express app and registers routes from `routes.ts`.
- **Storage**: `storage.ts` implements an in-memory store used by the routes.
- **Routes**: `routes.ts` exposes CRUD endpoints for sessions and goal management.

## Development
- `npm run dev` – starts the server with hot reloading.
- `npm test` – run unit tests.
- `npm run test:coverage` – generate coverage report in `coverage/`.
