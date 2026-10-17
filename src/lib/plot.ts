import { easingFunction, parseEasing, sampleEasing, yRange, type Easing } from './easing';

/**
 * Geometry for a curve plot. x is time (left to right), y is progress (bottom to top). Pure, so the server, the
 * browser and the tests all draw the same line.
 */
export interface PlotBox {
  size: number;
  pad: number;
  /** Fixed y range, for overlaying curves on one scale. Defaults to the curve's own range. */
  yMin?: number;
  yMax?: number;
}

export interface Plot {
  easing: Easing;
  size: number;
  pad: number;
  yMin: number;
  yMax: number;
  /** Curve samples in curve space, [t, progress]. */
  samples: [number, number][];
  /** The same samples in SVG space. */
  points: [number, number][];
  d: string;
  toSvg(t: number, y: number): [number, number];
  /** Bezier control points in SVG space, for cubic curves. */
  handles: [[number, number], [number, number]] | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function plot(timingFunction: string, box: PlotBox = { size: 240, pad: 16 }, n = 96): Plot {
  const easing = parseEasing(timingFunction);
  const [lo, hi] = yRange(easing);
  const yMin = box.yMin ?? lo;
  const yMax = box.yMax ?? hi;
  const inner = box.size - box.pad * 2;
  const toSvg = (t: number, y: number): [number, number] => [
    round(box.pad + t * inner),
    round(box.pad + (1 - (y - yMin) / (yMax - yMin)) * inner),
  ];
  const samples = easing.kind === 'steps' ? stepSamples(easing, n) : sampleEasing(easing, n);
  const points = samples.map(([t, y]) => toSvg(t, y));
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const handles =
    easing.kind === 'cubic'
      ? ([toSvg(easing.bezier[0], easing.bezier[1]), toSvg(easing.bezier[2], easing.bezier[3])] as [[number, number], [number, number]])
      : null;
  return { easing, size: box.size, pad: box.pad, yMin, yMax, samples, points, d, toSvg, handles };
}

/** Steps draw as risers and treads, so sample either side of every jump. */
function stepSamples(easing: Easing, n: number): [number, number][] {
  const f = easingFunction(easing);
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const prev = out.length ? out[out.length - 1]![1] : f(0);
    const y = f(t);
    if (out.length && y !== prev) out.push([t, prev]);
    out.push([t, y]);
  }
  return out;
}

/** Shared y range for overlaying several curves on one plot. */
export function sharedRange(timingFunctions: string[]): { yMin: number; yMax: number } {
  let yMin = 0;
  let yMax = 1;
  for (const tf of timingFunctions) {
    const [lo, hi] = yRange(parseEasing(tf));
    yMin = Math.min(yMin, lo);
    yMax = Math.max(yMax, hi);
  }
  return { yMin, yMax };
}
