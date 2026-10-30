import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromiumPath } from '../../scripts/lib/browser';

/**
 * Loads extension/dist-test (built with `pnpm ext:build --test`, which adds host access so tests don't need a
 * toolbar click) into a real Chromium, serves the fixture page, and opens the panel as a tab pointed at it.
 */
const root = new URL('../..', import.meta.url).pathname;

export const test = base.extend<
  { page: Page; panel: Page; site: Page },
  { ctx: BrowserContext; extId: string; origin: string; server: Server }
>({
  server: [
    async ({}, use) => {
      const html = readFileSync(join(root, 'tests/fixtures/ext/index.html'));
      const server = createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(html);
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      await use(server);
      server.close();
    },
    { scope: 'worker' },
  ],
  origin: [
    async ({ server }, use) => {
      const addr = server.address();
      await use(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`);
    },
    { scope: 'worker' },
  ],
  ctx: [
    async ({}, use) => {
      const ext = join(root, 'extension/dist-test');
      const executablePath = chromiumPath();
      const ctx = await chromium.launchPersistentContext('', {
        // Extensions need full Chromium; Playwright's default headless shell can't load them.
        ...(executablePath ? { executablePath } : { channel: 'chromium' }),
        headless: true,
        args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
        viewport: { width: 1200, height: 900 },
      });
      await use(ctx);
      await ctx.close();
    },
    { scope: 'worker' },
  ],
  extId: [
    async ({ ctx }, use) => {
      let [sw] = ctx.serviceWorkers();
      sw ??= await ctx.waitForEvent('serviceworker');
      await use(new URL(sw.url()).host);
    },
    { scope: 'worker' },
  ],
  site: async ({ ctx, origin }, use) => {
    const site = await ctx.newPage();
    await site.goto(`${origin}/`);
    await use(site);
    await site.close();
  },
  panel: async ({ ctx, extId, site }, use) => {
    const panel = await ctx.newPage();
    // The panel finds its tab by id; ask the extension for the fixture tab's id.
    await panel.goto(`chrome-extension://${extId}/panel.html?tab=-1`);
    const tabId = await panel.evaluate(async (url) => (await chrome.tabs.query({})).find((t) => t.url?.startsWith(url))?.id, site.url());
    await panel.setViewportSize({ width: 420, height: 1400 });
    await panel.goto(`chrome-extension://${extId}/panel.html?tab=${tabId}`);
    await use(panel);
    await panel.close();
  },
});

export const expect = test.expect;
