import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { measure } from '../../scripts/measure';
import { honesty } from '../../src/lib/honesty';
import { findInRaw, rawPairs, type RawFile } from '../../src/lib/trace';

/** Runs the real measure tool against a local page whose motion we wrote, so we know the right answers. */
const site = resolve(__dirname, '../fixtures/site');
let server: Server;
let url: string;
let raw: RawFile;
let reduced: RawFile;

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url === '/' ? '/index.html' : req.url!;
    try {
      const body = readFileSync(join(site, path));
      res.writeHead(200, { 'content-type': path.endsWith('.css') ? 'text/css' : 'text/html' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const opts = { url, hover: 5, date: '2026-10-17', out: '' };
  raw = (await measure({ ...opts, reduced: false })) as unknown as RawFile;
  reduced = (await measure({ ...opts, reduced: true })) as unknown as RawFile;
}, 120_000);

afterAll(() => server?.close());

describe('pnpm measure', () => {
  it('loads the page once and succeeds', () => {
    expect(raw.outcome).toBe('ok');
    expect(raw.status).toBe(200);
  });

  it('records the hover transition with its exact computed values', () => {
    const hit = findInRaw(raw, {
      timingFunction: 'cubic-bezier(0.19, 1, 0.22, 1)',
      duration: '0.9s',
      phase: 'hover',
      property: 'transform',
      selector: 'a.card',
      count: 1,
    });
    expect(hit.found, hit.reason).toBe(true);
    expect(rawPairs(raw).has('ease-in|0.14s')).toBe(true);
  });

  it('records CSS animations and WAAPI calls', () => {
    expect(raw.observed!.some((r) => r.kind === 'animation' && r.name === 'spin' && r.duration === '1.5s')).toBe(true);
    expect(raw.observed!.some((r) => r.kind === 'waapi' && r.timingFunction === 'cubic-bezier(0.2, 1.4, 0.4, 1)' && r.duration === '640ms')).toBe(true);
  });

  it('finds transition: all in computed styles and in stylesheets', () => {
    expect(raw.computed!.transitionAllElements).toBeGreaterThanOrEqual(1);
    expect(raw.stylesheets!.transitionAllCount).toBe(1);
    expect(raw.inlineSheets!.transitionAll.length).toBe(1);
    expect(raw.stylesheets!.keyframes).toContain('spin');
    expect(raw.stylesheets!.reducedMotionQueries).toBe(1);
  });

  it('sees less motion in the reduced run', () => {
    expect(reduced.outcome).toBe('ok');
    expect(reduced.observed!.some((r) => r.name === 'spin')).toBe(false);
    const h = honesty(raw, reduced);
    expect(h.reducedMotionEvents).toBeLessThan(h.motionEvents);
  });
});
