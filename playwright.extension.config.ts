import { defineConfig } from '@playwright/test';

/** The extension runs in its own persistent Chromium; see tests/extension/fixtures.ts. */
export default defineConfig({
  testDir: 'tests/extension',
  outputDir: 'test-results/extension',
  reporter: [['list']],
  workers: 1,
  timeout: 60_000,
});
