import { defineConfig, devices } from '@playwright/test';
import { chromiumPath } from './scripts/lib/browser';

const executablePath = chromiumPath();

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4321',
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
