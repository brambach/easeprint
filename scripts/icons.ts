/**
 * Draws the extension's icons from the print of easeprint's own tiers (motion.css). Run once when the tiers
 * change; the PNGs are committed so builds don't need a browser.
 */
import { chromium } from 'playwright';
import { fingerprintSvg } from '../src/lib/print/fingerprint';
import { chromiumPath } from './lib/browser';

const house = [
  { timingFunction: 'cubic-bezier(.2, .7, .2, 1)', durationMs: 140, count: 40 },
  { timingFunction: 'cubic-bezier(.2, .7, .2, 1)', durationMs: 320, count: 16 },
  { timingFunction: 'cubic-bezier(.4, 0, 1, 1)', durationMs: 220, count: 6 },
  { timingFunction: 'cubic-bezier(.34, 1.5, .64, 1)', durationMs: 900, count: 3 },
];

const executablePath = chromiumPath();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const sw = size <= 32 ? 1.5 : size <= 48 ? 1.1 : 0.8;
  const svg = fingerprintSvg(house, { ink: '#f7f6f3', strokeWidth: sw });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}div{width:${size}px;height:${size}px;border-radius:${size * 0.22}px;background:#22382b;display:grid;place-items:center;overflow:hidden}svg{width:${size * 0.82}px;height:${size * 0.82}px}</style><div>${svg}</div>`,
  );
  await page.locator('div').screenshot({ path: `extension/static/icons/${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons written');
