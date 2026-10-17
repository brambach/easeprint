/**
 * pnpm summarize data/raw/<site>/<date>.json
 *
 * Ranks every (timing function, duration) pair in a raw file, with where it was seen, so an entry can be written
 * from the data instead of from memory. Read-only.
 */
import { readFileSync } from 'node:fs';
import { rawPairs, type RawFile } from '../src/lib/trace';

const file = process.argv[2];
if (!file) {
  console.error('Usage: pnpm summarize data/raw/<site>/<date>.json');
  process.exit(2);
}
process.stdout.on('error', () => process.exit(0));
const raw = JSON.parse(readFileSync(file, 'utf8')) as RawFile;
const pairs = rawPairs(raw);

console.log(`${raw.url}  ${raw.outcome}  status ${raw.status}  ${raw.date}`);
const fp = raw.fingerprint ?? {};
console.log(`fingerprint: ${JSON.stringify(fp)}`);
console.log(`stylesheets: ${JSON.stringify({ ...raw.stylesheets, cubicBeziers: undefined, keyframes: raw.stylesheets?.keyframes?.length })}`);
console.log(`scripts: ${JSON.stringify(raw.scripts)}`);
console.log(`inline sheets: ${JSON.stringify(raw.inlineSheets)}`);
console.log(`transition-all elements: ${raw.computed?.transitionAllElements}`);
console.log(`hovered: ${raw.hover?.hovered.length} of ${raw.hover?.candidates?.distinct} distinct candidates\n`);

const rows = [...pairs.values()].sort((a, b) => b.events - a.events || b.elements - a.elements);
for (const p of rows.slice(0, Number(process.argv[3] ?? 40))) {
  const where = [...p.phases].join('/');
  const props = [...p.properties].slice(0, 4).join(', ');
  console.log(
    `${p.timingFunction.padEnd(36)} ${p.duration.padStart(9)}  ev ${String(p.events).padStart(4)} el ${String(p.elements).padStart(4)}  ${[...p.kinds].join('/')}  ${where}  [${props}]  ${p.samples.slice(0, 2).join(' | ')}`,
  );
}
