import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { aliases } from './alias.config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'tests/**'],
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
