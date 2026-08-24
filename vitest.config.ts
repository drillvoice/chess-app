import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { aliases } from './alias.config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // 'tests/**' is Playwright's. '.claude/**' keeps agent worktrees — full
    // checkouts of other branches inside the repo — from being collected as
    // if they were this branch's tests.
    exclude: [...configDefaults.exclude, 'tests/**', '.claude/**'],
    setupFiles: ['vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: aliases,
  },
});
