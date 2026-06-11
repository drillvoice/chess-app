import path from 'path';

// Single source of truth for bundler path aliases, shared by vite.config.ts
// and vitest.config.ts. Keep in sync with "paths" in tsconfig.json, which the
// TypeScript compiler reads directly.
export const aliases = {
  '@': path.resolve(import.meta.dirname, 'client', 'src'),
  '@shared': path.resolve(import.meta.dirname, 'shared'),
  '@assets': path.resolve(import.meta.dirname, 'attached_assets'),
};
