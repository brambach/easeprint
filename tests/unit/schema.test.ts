import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { entrySchema } from '../../src/lib/schema';

const root = resolve(__dirname, '../..');
const fixtures = join(root, 'tests/fixtures');
const valid = JSON.parse(readFileSync(join(fixtures, 'entries-valid/example.json'), 'utf8'));

function parse(entry: unknown) {
  const previous = process.env.EASEPRINT_ROOT;
  process.env.EASEPRINT_ROOT = fixtures;
  try {
    return entrySchema.safeParse(entry);
  } finally {
    if (previous === undefined) delete process.env.EASEPRINT_ROOT;
    else process.env.EASEPRINT_ROOT = previous;
  }
}

describe('entry schema', () => {
  it('accepts the valid fixture', () => {
    const result = parse(valid);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  const required = ['name', 'site', 'url', 'captured', 'raw', 'status', 'posture', 'summary', 'tiers', 'honesty', 'notes'];
  it.each(required)('rejects an entry missing %s', (field) => {
    const entry = structuredClone(valid);
    delete entry[field];
    expect(parse(entry).success).toBe(false);
  });

  it.each(['timingFunction', 'duration', 'durationMs', 'phase', 'selector', 'count', 'role'])(
    'rejects a tier missing %s',
    (field) => {
      const entry = structuredClone(valid);
      delete entry.tiers[0][field];
      expect(parse(entry).success).toBe(false);
    },
  );

  it('rejects unknown keys, so a typo cannot hide a value', () => {
    expect(parse({ ...valid, postur: 'spatial' }).success).toBe(false);
  });

  it('rejects a durationMs that disagrees with duration', () => {
    const entry = structuredClone(valid);
    entry.tiers[0].durationMs = 300;
    expect(parse(entry).success).toBe(false);
  });

  it('rejects a timing function the browser would not compute', () => {
    const entry = structuredClone(valid);
    entry.tiers[0].timingFunction = 'springy';
    expect(parse(entry).success).toBe(false);
  });

  it('rejects a raw file that does not exist', () => {
    expect(parse({ ...valid, raw: 'data/raw/example.com/2020-01-01.json' }).success).toBe(false);
  });

  it('requires an ambientKind for ambient posture and a reason for partial status', () => {
    expect(parse({ ...valid, posture: 'ambient' }).success).toBe(false);
    expect(parse({ ...valid, posture: 'ambient', ambientKind: 'decorative' }).success).toBe(true);
    expect(parse({ ...valid, status: 'partial' }).success).toBe(false);
  });
});

describe('astro build', () => {
  let scratch: string;
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'easeprint-build-'));
  });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  function build(entriesDir: string) {
    return spawnSync('pnpm', ['exec', 'astro', 'build'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        EASEPRINT_ROOT: fixtures,
        EASEPRINT_ENTRIES: entriesDir,
        EASEPRINT_BUILD_DIR: join(scratch, entriesDir.split('/').pop()!),
      },
    });
  }

  it('builds the valid fixture (control)', () => {
    const result = build('./tests/fixtures/entries-valid');
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it('fails when a fixture entry is missing a field', () => {
    const result = build('./tests/fixtures/entries-missing-field');
    const output = result.stdout + result.stderr;
    expect(result.status).not.toBe(0);
    expect(output).toMatch(/InvalidContentEntryDataError|does not match collection schema/);
    expect(output).toMatch(/posture/);
  });
});
