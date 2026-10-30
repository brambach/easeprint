import BezierEasing from 'bezier-easing';
import { formatBezier, type Bezier } from '../easing';

/**
 * Motion driven from JavaScript (GSAP, Motion's springs, anything on requestAnimationFrame) never shows up in
 * computed styles. What does show up is the element's style, frame by frame. This turns those frames back into a
 * timing function: a cubic-bezier when one fits, or a linear() curve when it doesn't (springs that overshoot and
 * settle).
 */
export interface Frame {
  /** ms, any origin. */
  t: number;
  /** The same numeric components every frame: translate x, y, scale, rotation, opacity... */
  v: number[];
}

export interface Fit {
  timingFunction: string;
  durationMs: number;
  /** Mean absolute error between the frames and the curve, in progress units (0 to 1). */
  error: number;
  /** Which component moved most, as an index into Frame.v. */
  component: number;
  kind: 'cubic' | 'linear-fn';
}

/** Progress samples [x, y] in [0, 1] time, from frames. Null if nothing moved enough to measure. */
export function progressOf(frames: Frame[], minTravel = 0.5): { samples: [number, number][]; component: number; durationMs: number } | null {
  if (frames.length < 4) return null;
  const first = frames[0]!;
  const last = frames[frames.length - 1]!;
  let component = -1;
  let travel = 0;
  first.v.forEach((v0, k) => {
    const d = Math.abs(last.v[k]! - v0);
    // Opacity moves 0 to 1, pixels move tens; scale opacity up so a fade can still win when nothing translates.
    const weighted = k === first.v.length - 1 ? d * 40 : d;
    if (weighted > travel) {
      travel = weighted;
      component = k;
    }
  });
  if (component < 0 || travel < minTravel) return null;
  const durationMs = last.t - first.t;
  if (durationMs < 30) return null;
  const v0 = first.v[component]!;
  const v1 = last.v[component]!;
  const samples = frames.map((f): [number, number] => [(f.t - first.t) / durationMs, (f.v[component]! - v0) / (v1 - v0)]);
  return { samples, component, durationMs };
}

function errorFor(b: Bezier, samples: [number, number][]): number {
  if (b[0] < 0 || b[0] > 1 || b[2] < 0 || b[2] > 1) return Infinity;
  const f = BezierEasing(b[0], b[1], b[2], b[3]);
  let e = 0;
  for (const [x, y] of samples) e += Math.abs(f(x) - y);
  return e / samples.length;
}

/** Nelder-Mead over the four control values. Small, deterministic, good enough for 4 dimensions. */
export function fitBezier(samples: [number, number][]): { bezier: Bezier; error: number } {
  const starts: Bezier[] = [
    [0.25, 0.1, 0.25, 1],
    [0.16, 1, 0.3, 1],
    [0.42, 0, 0.58, 1],
    [0.42, 0, 1, 1],
    [0.3, 1.4, 0.5, 1],
  ];
  let best = { bezier: starts[0]!, error: Infinity };
  for (const s of starts) {
    const r = nelderMead((p) => errorFor(p as unknown as Bezier, samples), [...s], 400);
    if (r.value < best.error) best = { bezier: r.point as unknown as Bezier, error: r.value };
  }
  const rounded = best.bezier.map((n) => Math.round(n * 1000) / 1000) as unknown as Bezier;
  return { bezier: rounded, error: errorFor(rounded, samples) };
}

function nelderMead(f: (p: number[]) => number, start: number[], iterations: number): { point: number[]; value: number } {
  const n = start.length;
  let simplex = [start, ...start.map((_, i) => start.map((v, j) => (i === j ? v + 0.1 : v)))].map((p) => ({ p, v: f(p) }));
  for (let it = 0; it < iterations; it++) {
    simplex.sort((a, b) => a.v - b.v);
    const worst = simplex[n]!;
    const centroid = Array.from({ length: n }, (_, k) => simplex.slice(0, n).reduce((s, q) => s + q.p[k]!, 0) / n);
    const along = (t: number) => centroid.map((c, k) => c + t * (worst.p[k]! - c));
    const reflected = along(-1);
    const rv = f(reflected);
    if (rv < simplex[0]!.v) {
      const expanded = along(-2);
      const ev = f(expanded);
      simplex[n] = ev < rv ? { p: expanded, v: ev } : { p: reflected, v: rv };
    } else if (rv < simplex[n - 1]!.v) {
      simplex[n] = { p: reflected, v: rv };
    } else {
      const contracted = along(0.5);
      const cv = f(contracted);
      if (cv < worst.v) simplex[n] = { p: contracted, v: cv };
      else {
        const b = simplex[0]!.p;
        simplex = simplex.map((q, i) => {
          if (i === 0) return q;
          const p = q.p.map((v, k) => b[k]! + 0.5 * (v - b[k]!));
          return { p, v: f(p) };
        });
      }
    }
  }
  simplex.sort((a, b) => a.v - b.v);
  return { point: simplex[0]!.p, value: simplex[0]!.v };
}

/** A linear() curve through the samples, thinned to at most `stops` points. */
export function linearFrom(samples: [number, number][], stops = 24): string {
  const step = Math.max(1, Math.ceil(samples.length / stops));
  const picked = samples.filter((_, i) => i % step === 0);
  if (picked[picked.length - 1] !== samples[samples.length - 1]) picked.push(samples[samples.length - 1]!);
  const r = (n: number) => String(Math.round(n * 1000) / 1000);
  return `linear(${picked.map(([x, y], i) => (i === 0 || i === picked.length - 1 ? r(y) : `${r(y)} ${r(x * 100)}%`)).join(', ')})`;
}

/** Fits frames to the simplest curve that's honest about them. */
export function fitFrames(frames: Frame[], tolerance = 0.02): Fit | null {
  const p = progressOf(frames);
  if (!p) return null;
  const { bezier, error } = fitBezier(p.samples);
  if (error <= tolerance) {
    return { timingFunction: formatBezier(bezier), durationMs: Math.round(p.durationMs), error, component: p.component, kind: 'cubic' };
  }
  return { timingFunction: linearFrom(p.samples), durationMs: Math.round(p.durationMs), error: 0, component: p.component, kind: 'linear-fn' };
}
