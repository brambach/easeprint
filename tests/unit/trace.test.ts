import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRaw } from '../../src/lib/honesty';
import { findInRaw, pairKey, rawPairs } from '../../src/lib/trace';

/**
 * Every curve and duration on every entry appears in the raw file the entry names, on one record with the same
 * phase, property, selector and count. The schema enforces this at build time too; this test says it plainly.
 */
const root = resolve(__dirname, '../..');
const dir = join(root, 'src/content/entries');
const entries = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, data: JSON.parse(readFileSync(join(dir, f), 'utf8')) }));

describe('trace', () => {
  it('has entries to check', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  for (const { file, data } of entries) {
    describe(file, () => {
      const raw = readRaw(data.raw);

      it('names a raw file from the same site and date that measured successfully', () => {
        expect(data.raw).toBe(`data/raw/${data.site}/${data.captured}.json`);
        expect(raw.date).toBe(data.captured);
        if (data.status !== 'unmeasurable') expect(raw.outcome).toBe('ok');
      });

      for (const tier of data.tiers) {
        it(`${tier.role} "${tier.label}": ${tier.timingFunction} ${tier.duration} is in the raw file`, () => {
          expect(rawPairs(raw).has(pairKey(tier.timingFunction, tier.duration))).toBe(true);
          const hit = findInRaw(raw, tier);
          expect(hit.found, hit.reason).toBe(true);
        });
      }
    });
  }
});
