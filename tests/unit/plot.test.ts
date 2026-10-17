import BezierEasing from 'bezier-easing';
import { describe, expect, it } from 'vitest';
import { plot } from '../../src/lib/plot';

/** Plotted points, read back into curve space, must match bezier-easing at every sample. */
const curves: [string, [number, number, number, number]][] = [
  ['cubic-bezier(0.16, 1, 0.3, 1)', [0.16, 1, 0.3, 1]],
  ['cubic-bezier(0.34, 4.56, 0.64, 1)', [0.34, 4.56, 0.64, 1]],
  ['cubic-bezier(0.2, 1.4, 0.4, 1)', [0.2, 1.4, 0.4, 1]],
  ['cubic-bezier(0.165, 0.84, 0.44, 1)', [0.165, 0.84, 0.44, 1]],
  ['ease', [0.25, 0.1, 0.25, 1]],
  ['ease-out', [0, 0, 0.58, 1]],
  ['ease-in', [0.42, 0, 1, 1]],
];

describe('plot', () => {
  for (const [tf, b] of curves) {
    it(`${tf} matches bezier-easing`, () => {
      const p = plot(tf, { size: 240, pad: 16 });
      const ease = BezierEasing(...b);
      const inner = p.size - p.pad * 2;
      expect(p.points.length).toBe(97);
      p.points.forEach(([x, y], i) => {
        const t = (x - p.pad) / inner;
        const progress = p.yMin + (1 - (y - p.pad) / inner) * (p.yMax - p.yMin);
        expect(t).toBeCloseTo(i / 96, 3);
        // SVG coordinates are rounded to 0.01px, so allow that much in curve units.
        expect(Math.abs(progress - ease(t))).toBeLessThan(0.0005 * (p.yMax - p.yMin) + 0.0001);
      });
    });
  }

  it('starts at (0, 0) and ends at (1, 1) in its own frame', () => {
    const p = plot('cubic-bezier(0.19, 1, 0.22, 1)');
    expect(p.points[0]).toEqual(p.toSvg(0, 0));
    expect(p.points[p.points.length - 1]).toEqual(p.toSvg(1, 1));
  });

  it('widens the y range for overshoot', () => {
    const p = plot('cubic-bezier(0.34, 4.56, 0.64, 1)');
    expect(p.yMax).toBeGreaterThan(1.5);
    expect(p.yMin).toBe(0);
  });

  it('draws steps as risers and treads', () => {
    const p = plot('steps(4, end)');
    const ys = new Set(p.samples.map(([, y]) => y));
    expect([...ys].sort()).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});
