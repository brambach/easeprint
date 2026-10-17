import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { entrySchema } from '../../src/lib/schema';

/** The brief's list, exactly. A replacement site means changing this list on purpose. */
const SITES = [
  'cuberto.com', 'obys.agency', 'family.co', 'raycast.com', 'linear.app', 'attio.com', 'resend.com', 'vercel.com',
  'paco.me', 'rauno.me', 'emilkowal.ski', 'sonner.emilkowal.ski', 'vaul.emilkowal.ski', 'brycerambach.com',
  'basement.studio', 'darkroom.engineering', 'locomotive.ca', 'stripe.com', 'motion.dev', 'arc.net',
];

const root = resolve(__dirname, '../..');
const dir = join(root, 'src/content/entries');
const entries = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

describe('the 20 entries', () => {
  it('cover exactly the sites in the brief', () => {
    expect(entries.map((e) => e.site).sort()).toEqual([...SITES].sort());
  });

  for (const e of entries) {
    it(`${e.site} passes the schema with a raw file and a reduced-motion run`, () => {
      const result = entrySchema.safeParse(e);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      expect(e.raw).toMatch(new RegExp(`^data/raw/${e.site.replace(/\./g, '\\.')}/\\d{4}-\\d{2}-\\d{2}\\.json$`));
      expect(e.rawReduced).toBe(e.raw.replace('.json', '-reduced.json'));
    });
  }
});
