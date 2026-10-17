import { describe, expect, it } from 'vitest';
import {
  easingFunction,
  formatBezier,
  initialSlope,
  parseDuration,
  parseEasing,
  splitList,
} from '../../src/lib/easing';

describe('parseEasing', () => {
  it('reads cubic-bezier as computed by Chrome', () => {
    expect(parseEasing('cubic-bezier(0.19, 1, 0.22, 1)')).toEqual({ kind: 'cubic', bezier: [0.19, 1, 0.22, 1] });
  });

  it('maps keywords to their beziers', () => {
    expect(parseEasing('ease-out')).toEqual({ kind: 'cubic', bezier: [0, 0, 0.58, 1], keyword: 'ease-out' });
    expect(parseEasing('ease')).toMatchObject({ bezier: [0.25, 0.1, 0.25, 1] });
  });

  it('allows overshoot in y but not x', () => {
    expect(parseEasing('cubic-bezier(0.2, 1.4, 0.4, 1)')).toMatchObject({ bezier: [0.2, 1.4, 0.4, 1] });
    expect(() => parseEasing('cubic-bezier(1.2, 0, 0.4, 1)')).toThrow();
  });

  it('reads linear() with and without positions', () => {
    const e = parseEasing('linear(0, 0.25 75%, 1)');
    expect(e).toEqual({
      kind: 'linear-fn',
      stops: [
        { value: 0, at: 0 },
        { value: 0.25, at: 0.75 },
        { value: 1, at: 1 },
      ],
    });
    const f = easingFunction(e);
    expect(f(0.375)).toBeCloseTo(0.125);
  });

  it('spreads missing linear() positions evenly', () => {
    const e = parseEasing('linear(0, 0.5, 0.8, 1)');
    expect(e.kind === 'linear-fn' && e.stops.map((s) => s.at)).toEqual([0, 1 / 3, 2 / 3, 1]);
  });

  it('reads steps()', () => {
    const f = easingFunction(parseEasing('steps(4, end)'));
    expect([0, 0.24, 0.25, 0.99, 1].map(f)).toEqual([0, 0, 0.25, 0.75, 1]);
    const g = easingFunction(parseEasing('steps(4, jump-start)'));
    expect(g(0)).toBe(0.25);
  });

  it('rejects nonsense', () => {
    expect(() => parseEasing('bouncy')).toThrow();
  });
});

describe('durations and lists', () => {
  it('parses seconds and milliseconds', () => {
    expect(parseDuration('0.9s')).toBe(900);
    expect(parseDuration('140ms')).toBe(140);
    expect(parseDuration('0.35s')).toBe(350);
  });

  it('splits computed lists at top-level commas only', () => {
    expect(splitList('opacity, cubic-bezier(0.4, 0, 0.2, 1), ease')).toEqual([
      'opacity',
      'cubic-bezier(0.4, 0, 0.2, 1)',
      'ease',
    ]);
  });

  it('formats beziers the way Chrome serializes them', () => {
    expect(formatBezier([0.19, 1, 0.22, 1])).toBe('cubic-bezier(0.19, 1, 0.22, 1)');
  });
});

describe('initialSlope', () => {
  it('is y1/x1 for cubics', () => {
    expect(initialSlope(parseEasing('cubic-bezier(0.19, 1, 0.22, 1)'))).toBeCloseTo(5.263, 2);
    expect(initialSlope(parseEasing('ease-out'))).toBe(1);
  });
});
