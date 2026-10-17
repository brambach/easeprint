/**
 * pnpm screenshot <path> [<path>...] [--out evidence] [--base http://localhost:4321] [--mobile] [--full]
 * Screenshots pages of our own built site (run `pnpm preview` first). Never used on measured sites.
 */
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';
import { chromiumPath } from './lib/browser';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1]! : fallback;
};
const out = opt('--out', 'evidence');
const base = opt('--base', 'http://localhost:4321');
const paths = args.filter((a, i) => !a.startsWith('--') && !['--out', '--base'].includes(args[i - 1] ?? ''));
const mobile = flag('--mobile');
const scheme = flag('--dark') ? 'dark' : 'light';

mkdirSync(out, { recursive: true });
const executablePath = chromiumPath();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext(
  mobile ? { ...devices['Pixel 7'], colorScheme: scheme } : { viewport: { width: 1440, height: 900 }, colorScheme: scheme },
);
const page = await context.newPage();
for (const path of paths) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const name = `${(path.replace(/^\/|\/$/g, '').replace(/[/#?=]+/g, '-') || 'index')}${mobile ? '-mobile' : '-desktop'}${scheme === 'dark' ? '-dark' : ''}.png`;
  await page.screenshot({ path: `${out}/${name}`, fullPage: flag('--full') });
  console.log(`${out}/${name}`);
}
await browser.close();
