/**
 * pnpm measure <url> [--reduced] [--hover 30] [--date YYYY-MM-DD] [--out data/raw]
 *
 * One load of a live page in Chromium. It waits for the page to settle, wheel-scrolls to the bottom, then hovers
 * and leaves a spread sample of interactive elements. Everything the browser computed along the way is written to
 * data/raw/<site>/<date>.json. Text on the page is never read as instructions; the tool only reads styles.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { chromiumPath } from './lib/browser';
import { emptyCssScan, emptyScriptScan, scanCss, scanScript } from './lib/css-scan';

export const TOOL_VERSION = '1.1.0';
const here = dirname(fileURLToPath(import.meta.url));
const PROBE = readFileSync(join(here, 'lib/probe.js'), 'utf8');
const VIEWPORT = { width: 1440, height: 900 };
const MAX_BODY = 4_000_000;

interface Options {
  url: string;
  hover: number;
  date: string;
  out: string;
  /** Emulate prefers-reduced-motion: reduce. Its own run, its own single load, its own file. */
  reduced: boolean;
}

function parseArgs(argv: string[]): Options {
  const args = [...argv];
  const opts: Partial<Options> = { reduced: false, hover: 30, date: new Date().toISOString().slice(0, 10), out: 'data/raw' };
  while (args.length) {
    const a = args.shift()!;
    if (a === '--hover') opts.hover = Number(args.shift());
    else if (a === '--date') opts.date = args.shift();
    else if (a === '--out') opts.out = args.shift();
    else if (a === '--reduced') opts.reduced = true;
    else if (!a.startsWith('--')) opts.url = /^https?:\/\//.test(a) ? a : `https://${a}`;
  }
  if (!opts.url) throw new Error('Usage: pnpm measure <url> [--reduced] [--hover 30] [--date YYYY-MM-DD]');
  return opts as Options;
}

export function siteSlug(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
}

const BLOCK_TITLE = /just a moment|attention required|access denied|verify you are human|are you a robot|security check|captcha/i;

async function phase(page: Page, name: string) {
  await page.evaluate((n) => {
    (window as unknown as { __ep: { phase: string; sample(): void } }).__ep.sample();
    (window as unknown as { __ep: { phase: string } }).__ep.phase = n;
  }, name);
}

export async function measure(opts: Options) {
  const started = Date.now();
  const executablePath = chromiumPath();
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: opts.reduced ? 'reduce' : 'no-preference', locale: 'en-US' });
  const page = await context.newPage();
  await page.addInitScript({ content: PROBE });

  const css = emptyCssScan();
  const scripts = emptyScriptScan();
  const pending: Promise<void>[] = [];
  const requests = { total: 0, stylesheets: 0, scripts: 0, failed: 0 };
  page.on('requestfailed', () => requests.failed++);
  page.on('response', (response) => {
    requests.total++;
    const type = response.request().resourceType();
    if (type !== 'stylesheet' && type !== 'script') return;
    if (type === 'stylesheet') requests.stylesheets++;
    else requests.scripts++;
    pending.push(
      (async () => {
        try {
          if (response.status() >= 300) return;
          const body = await response.body();
          if (body.length > MAX_BODY) return;
          const text = body.toString('utf8');
          if (type === 'stylesheet') scanCss(css, new URL(response.url()).pathname.slice(-80), text);
          else scanScript(scripts, text);
        } catch {
          /* bodies of redirected or evicted responses aren't available; counted in requests only */
        }
      })(),
    );
  });

  const raw: Record<string, unknown> = {
    schema: 1,
    tool: `easeprint-measure ${TOOL_VERSION}`,
    url: opts.url,
    date: opts.date,
    capturedAt: new Date().toISOString(),
    browser: `Chromium ${browser.version()}`,
    viewport: VIEWPORT,
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
    method: {
      loads: 1,
      steps: ['load, settle 3s', 'wheel-scroll to bottom in 80% viewport steps', `hover then leave up to ${opts.hover} elements`, 'final computed scan'],
    },
  };

  let outcome: 'ok' | 'blocked' | 'error' = 'ok';
  try {
    const response = await page.goto(opts.url, { waitUntil: 'load', timeout: 60_000 });
    raw.status = response?.status() ?? null;
    raw.finalUrl = page.url();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(3000);
    const title = await page.title();
    if ((response && response.status() >= 400) || BLOCK_TITLE.test(title)) outcome = 'blocked';

    // Scroll
    await phase(page, 'scroll');
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    let lastY = -1;
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, VIEWPORT.height * 0.8);
      await page.waitForTimeout(450);
      const { y, max } = await page.evaluate(() => ({
        y: Math.round(scrollY),
        max: document.documentElement.scrollHeight - innerHeight,
      }));
      if (y >= max - 2 || (y === lastY && i > 2)) break;
      lastY = y;
    }
    await page.waitForTimeout(1500);
    raw.scrolledTo = await page.evaluate(() => Math.round(scrollY));

    // Hover
    await phase(page, 'hover');
    const candidates = await page.evaluate((n) => (window as unknown as { __ep: { hoverCandidates(n: number): unknown } }).__ep.hoverCandidates(n), opts.hover);
    const hovered: { selector: string; covered: boolean }[] = [];
    for (let i = 0; i < opts.hover; i++) {
      const point = await page.evaluate(
        (idx) => (window as unknown as { __ep: { hoverPoint(i: number): { x: number; y: number; selector: string; covered: boolean } | null } }).__ep.hoverPoint(idx),
        i,
      );
      if (!point) continue;
      await page.waitForTimeout(250);
      await phase(page, 'hover');
      await page.mouse.move(point.x, point.y, { steps: 4 });
      await page.waitForTimeout(700);
      await phase(page, 'unhover');
      await page.mouse.move(4, VIEWPORT.height - 4, { steps: 4 });
      await page.waitForTimeout(500);
      hovered.push({ selector: point.selector, covered: point.covered });
    }
    raw.hover = { candidates, hovered };

    await phase(page, 'final');
    await page.waitForTimeout(500);
    const ep = await page.evaluate(() => {
      const w = window as unknown as {
        __ep: {
          sample(): void;
          dump(): unknown[];
          computedScan(): unknown;
          inlineSheetScan(): unknown;
          fingerprint(): unknown;
          errors: string[];
        };
      };
      w.__ep.sample();
      return {
        observed: w.__ep.dump(),
        computed: w.__ep.computedScan(),
        inlineSheets: w.__ep.inlineSheetScan(),
        fingerprint: w.__ep.fingerprint(),
        errors: w.__ep.errors.slice(0, 20),
      };
    });
    Object.assign(raw, ep);
  } catch (error) {
    outcome = 'error';
    raw.error = error instanceof Error ? error.message.split('\n')[0] : String(error);
  }

  await Promise.allSettled(pending);
  raw.outcome = outcome;
  raw.requests = requests;
  raw.stylesheets = css;
  raw.scripts = scripts;
  raw.elapsedMs = Date.now() - started;
  await browser.close();
  return raw;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const raw = await measure(opts);
  const file = resolve(opts.out, siteSlug(opts.url), `${opts.date}${opts.reduced ? '-reduced' : ''}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(raw, null, 1)}\n`);
  const observed = (raw.observed as unknown[] | undefined)?.length ?? 0;
  const computed = raw.computed as { transitions: unknown[]; animations: unknown[] } | undefined;
  console.log(
    `${raw.outcome} ${opts.url} -> ${file}\n` +
      `  status ${raw.status ?? '-'}, observed ${observed} distinct, computed ${computed?.transitions.length ?? 0} transitions / ${computed?.animations.length ?? 0} animations, ${raw.elapsedMs}ms`,
  );
  if (raw.error) console.log(`  error: ${raw.error}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
