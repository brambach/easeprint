/**
 * pnpm records data/raw/<site>/<date>.json "<timing function>" "<duration>"
 * Prints every record in a raw file with that exact pair: phase, property, selector, count.
 */
import { readFileSync } from 'node:fs';
import type { RawFile } from '../src/lib/trace';

const [file, tf, duration] = process.argv.slice(2);
if (!file || !tf || !duration) {
  console.error('Usage: pnpm records <raw file> "<timing function>" "<duration>"');
  process.exit(2);
}
process.stdout.on('error', () => process.exit(0));
const raw = JSON.parse(readFileSync(file, 'utf8')) as RawFile;
for (const r of raw.observed ?? []) {
  if (r.timingFunction === tf && r.duration === duration) {
    console.log(`observed ${r.kind.padEnd(10)} ${r.phase.padEnd(8)} ${(r.property ?? r.name ?? '').padEnd(24)} x${r.count}  ${r.selector}`);
  }
}
for (const r of [...(raw.computed?.transitions ?? []), ...(raw.computed?.animations ?? [])]) {
  if (r.timingFunction === tf && r.duration === duration) {
    console.log(`computed ${'final'.padEnd(19)} ${(r.property ?? r.name ?? '').padEnd(24)} x${r.count}  ${r.samples.join(' | ')}`);
  }
}
