import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173', viewport: { width: 390, height: 844 }, hasTouch: true,
    // Set PW_CHROMIUM to use a preinstalled browser instead of `npx playwright install`.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: { command: 'npx vite build && npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 120_000 },
});
