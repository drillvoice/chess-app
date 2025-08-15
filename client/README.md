# Client

React frontend built with Vite.

## Architecture
- **Entry point**: `src/main.tsx` bootstraps the React app and service worker.
- **State & Data**: React Query manages remote state; Firebase utilities handle auth and cloud sync.
- **Offline Support**: `src/lib/offline-storage.ts` wraps IndexedDB for caching sessions and stats.
- **Styling**: Tailwind CSS with Radix UI components.

## Development
- `npm run dev` – start client and server concurrently.
- `npm test` – run unit tests.
- `npm run test:coverage` – generate coverage report in `coverage/`.
