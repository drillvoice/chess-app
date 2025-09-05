import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT) || 5000;

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  webServer: {
    command: 'npm run dev',
    port,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
  },
});
