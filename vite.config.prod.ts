import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

const apiPort = Number(process.env.PORT) || 5000;
const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

function manualChunks(id: string): string | undefined {
  if (id.includes('node_modules/firebase/')) {
    return 'firebase';
  }

  if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
    return 'vendor';
  }

  if (id.includes('node_modules/@radix-ui/react-')) {
    return 'ui';
  }

  return undefined;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@assets': path.resolve(__dirname, './attached_assets'),
    },
  },
  build: {
    outDir: 'dist/public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
