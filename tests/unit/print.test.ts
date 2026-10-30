import BezierEasing from 'bezier-easing';
import { describe, expect, it } from 'vitest';
import { parseEasing } from '../../src/lib/easing';
import { exportTiers, FORMATS } from '../../src/lib/print/export';
import { fingerprint, radii, strandsFor } from '../../src/lib/print/fingerprint';
import { fitBezier, fitFrames, linearFrom, type Frame } from '../../src/lib/print/fit';
import { buildTiers, curveDistance, durationLabel, isExitShape, type Observation } from '../../src/lib/print/tiers';

const obs = (timingFunction: string, durationMs: number, count: number, extra: Partial<Observation> = {}): Observation => ({
  kind: 'transition',
  property: 'transform',
  timingFunction,
  durationMs,
  count,
  ...extra,
});

describe('tiers', () => {
  it('folds near twins into the heavier tier and keeps its exact string', () => {
    const { tiers } = buildTiers([
      obs('cubic-bezier(0.16, 1, 0.3, 1)', 600, 10),
      obs('cubic-bezier(0.17, 1, 0.3, 1)', 620, 2),
      obs('ease', 200, 5),
    ]);
    expect(tiers).toHaveLength(2);
    const move = tiers.find((t) => t.durationMs === 600)!;
    expect(move.timingFunction).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(move.count).toBe(12);
  });

  it('names tiers by job: duration bands, ease-in as exit, infinite as loop', () => {
    const { tiers } = buildTiers([
      obs('ease-out', 120, 3),
      obs('ease-out', 240, 9),
      obs('cubic-bezier(0.16, 1, 0.3, 1)', 1200, 2),
      obs('ease-in', 140, 4),
      obs('linear', 2000, 1, { kind: 'animation', iterations: 'infinite' }),
    ]);
    expect(tiers.map((t) => t.name)).toEqual(['micro', 'exit', 'utility', 'statement', 'loop']);
  });

  it('numbers repeats in a role by weight', () => {
    const { tiers } = buildTiers([obs('ease', 200, 2), obs('cubic-bezier(0.2, 0.7, 0.2, 1)', 300, 8)]);
    expect(tiers.find((t) => t.count === 8)!.name).toBe('utility');
    expect(tiers.find((t) => t.count === 2)!.name).toBe('utility-2');
  });

  it('ignores trick durations and unparseable values', () => {
    const { tiers } = buildTiers([obs('ease', 10, 50), obs('nonsense', 300, 5), obs('ease', 300, 1)]);
    expect(tiers).toHaveLength(1);
  });

  it('caps the tier count and reports what it dropped', () => {
    const many = Array.from({ length: 12 }, (_, i) => obs(`cubic-bezier(0.${i + 1}, 0, 0.5, 1)`, 100 + i * 150, 12 - i));
    const { tiers, dropped } = buildTiers(many, { max: 8 });
    expect(tiers).toHaveLength(8);
    expect(dropped).toBe(4 + 3 + 2 + 1);
  });

  it('helpers', () => {
    expect(curveDistance('ease', 'ease')).toBe(0);
    expect(isExitShape('ease-in')).toBe(true);
    expect(isExitShape('ease-out')).toBe(false);
    expect(durationLabel(800)).toBe('800ms');
    expect(durationLabel(1200)).toBe('1.2s');
  });
});

describe('fingerprint', () => {
  const tiers = [
    { timingFunction: 'ease-out', durationMs: 200, count: 30 },
    { timingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)', durationMs: 900, count: 4 },
    { timingFunction: 'linear', durationMs: 3000, count: 1, loop: true },
  ];

  it('puts slower tiers further from the core', () => {
    const r = radii(tiers);
    expect(r[0]!).toBeLessThan(r[1]!);
    expect(r[1]!).toBeLessThan(r[2]!);
  });

  it('draws one ridge per strand for each tier, plus the field between', () => {
    const p = fingerprint(tiers);
    const measured = p.ridges.filter((r) => r.measured);
    expect(measured).toHaveLength(tiers.reduce((n, t) => n + strandsFor(t.count), 0));
    expect(p.ridges.length).toBeGreaterThan(measured.length);
    expect(measured.filter((r) => r.loop).length).toBe(strandsFor(1));
  });

  it('is deterministic and stays in frame', () => {
    const a = fingerprint(tiers);
    expect(fingerprint(tiers).ridges.map((r) => r.d)).toEqual(a.ridges.map((r) => r.d));
    for (const r of a.ridges) {
      for (const [, x, y] of r.d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)) {
        expect(Number(x)).toBeGreaterThanOrEqual(0);
        expect(Number(x)).toBeLessThanOrEqual(100);
        expect(Number(y)).toBeGreaterThanOrEqual(0);
        expect(Number(y)).toBeLessThanOrEqual(120);
      }
    }
  });

  it('changes shape when the curve changes, not only the radius', () => {
    const a = fingerprint([{ timingFunction: 'ease-out', durationMs: 400, count: 1 }]).ridges.find((r) => r.measured)!;
    const b = fingerprint([{ timingFunction: 'ease-in', durationMs: 400, count: 1 }]).ridges.find((r) => r.measured)!;
    expect(a.radius).toBe(b.radius);
    expect(a.d).not.toBe(b.d);
  });
});

describe('fit', () => {
  const framesFor = (f: (x: number) => number, ms = 600, fps = 60): Frame[] =>
    Array.from({ length: Math.round((ms / 1000) * fps) + 1 }, (_, i) => {
      const x = Math.min(1, i / ((ms / 1000) * fps));
      return { t: 1000 + x * ms, v: [0, 40 * f(x), 1, 0, 1] };
    });

  for (const b of [
    [0.16, 1, 0.3, 1],
    [0.42, 0, 0.58, 1],
    [0.25, 0.1, 0.25, 1],
    [0.2, 0.7, 0.2, 1],
  ] as const) {
    it(`recovers cubic-bezier(${b.join(', ')}) from 60fps frames`, () => {
      const fit = fitFrames(framesFor(BezierEasing(b[0], b[1], b[2], b[3])));
      expect(fit?.kind).toBe('cubic');
      expect(fit!.durationMs).toBe(600);
      expect(fit!.component).toBe(1);
      expect(fit!.error).toBeLessThan(0.005);
      expect(curveDistance(fit!.timingFunction, `cubic-bezier(${b.join(', ')})`)).toBeLessThan(0.02);
    });
  }

  it('falls back to linear() for a spring that overshoots and settles', () => {
    const spring = (x: number) => 1 - Math.exp(-6 * x) * Math.cos(14 * x);
    const fit = fitFrames(framesFor(spring, 900));
    expect(fit?.kind).toBe('linear-fn');
    const e = parseEasing(fit!.timingFunction);
    expect(e.kind).toBe('linear-fn');
    expect(Math.max(...(e.kind === 'linear-fn' ? e.stops.map((s) => s.value) : []))).toBeGreaterThan(1.1);
  });

  it('notices a fade when nothing translates', () => {
    const frames = Array.from({ length: 20 }, (_, i) => ({ t: i * 16, v: [0, 0, 1, 0, i / 19] }));
    expect(fitFrames(frames)?.component).toBe(4);
  });

  it('returns null when nothing moved', () => {
    expect(fitFrames(Array.from({ length: 10 }, (_, i) => ({ t: i * 16, v: [0, 0, 1, 0, 1] })))).toBeNull();
  });

  it('linear() output parses and keeps its ends', () => {
    const s = linearFrom([
      [0, 0],
      [0.5, 0.8],
      [1, 1],
    ]);
    expect(s).toBe('linear(0, 0.8 50%, 1)');
    expect(fitBezier([[0, 0], [0.5, 0.5], [1, 1]]).error).toBeLessThan(0.01);
  });
});

describe('export', () => {
  const input = {
    site: 'example.com',
    date: '2026-10-30',
    tiers: [
      { name: 'utility', timingFunction: 'cubic-bezier(0.2, 0.7, 0.2, 1)', durationMs: 220, fitted: false },
      { name: 'statement', timingFunction: 'linear(0, 1.1 60%, 1)', durationMs: 1200, fitted: true },
      { name: 'loop', timingFunction: 'steps(4, end)', durationMs: 800, fitted: false },
    ],
  };

  it('every format names every tier', () => {
    for (const { id } of FORMATS) {
      const out = exportTiers(input, id);
      expect(out).toContain('example.com');
      expect(out).not.toMatch(/[–—]/);
    }
  });

  it('CSS carries the exact strings', () => {
    const css = exportTiers(input, 'css');
    expect(css).toContain('--ease-utility: cubic-bezier(0.2, 0.7, 0.2, 1);');
    expect(css).toContain('--duration-statement: 1.2s;');
    expect(css).toContain('--ease-loop: steps(4, end);');
    expect(css).toContain('fitted from JS motion');
  });

  it('Motion gets bezier arrays and a linear() helper', () => {
    const m = exportTiers(input, 'motion');
    expect(m).toContain('export const utility = { duration: 0.22, ease: [0.2, 0.7, 0.2, 1] };');
    expect(m).toContain('const linear = (stops)');
    expect(m).toContain('[0.6, 1.1]');
    expect(m).toContain('no Motion equivalent');
  });

  it('SwiftUI uses timingCurve and approximates springs out loud', () => {
    const s = exportTiers(input, 'swiftui');
    expect(s).toContain('static let utility = Animation.timingCurve(0.2, 0.7, 0.2, 1, duration: 0.22)');
    expect(s).toContain('Approximated from its 10% overshoot');
  });
});
