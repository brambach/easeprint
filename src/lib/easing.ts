import BezierEasing from 'bezier-easing';

/**
 * Every timing function a browser can compute, parsed into something we can plot and replay.
 * Input strings are the exact values `getComputedStyle` returns, e.g. "cubic-bezier(0.19, 1, 0.22, 1)".
 */
export type Bezier = readonly [number, number, number, number];

export type Easing =
  | { kind: 'cubic'; bezier: Bezier; keyword?: string }
  | { kind: 'linear-fn'; stops: readonly { value: number; at: number }[] }
  | { kind: 'steps'; count: number; position: StepPosition };

export type StepPosition = 'jump-start' | 'jump-end' | 'jump-none' | 'jump-both';

export const KEYWORDS: Readonly<Record<string, Bezier>> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?`;
const CUBIC = new RegExp(String.raw`^cubic-bezier\(\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*\)$`, 'i');

export function parseEasing(input: string): Easing {
  const s = input.trim().toLowerCase();
  if (s in KEYWORDS) return { kind: 'cubic', bezier: KEYWORDS[s]!, keyword: s };
  if (s === 'step-start') return { kind: 'steps', count: 1, position: 'jump-start' };
  if (s === 'step-end') return { kind: 'steps', count: 1, position: 'jump-end' };

  const cubic = CUBIC.exec(s);
  if (cubic) {
    const b = cubic.slice(1, 5).map(Number) as unknown as Bezier;
    if (b[0] < 0 || b[0] > 1 || b[2] < 0 || b[2] > 1) throw new Error(`cubic-bezier x values must be in [0, 1]: ${input}`);
    return { kind: 'cubic', bezier: b };
  }

  const steps = /^steps\(\s*(\d+)\s*(?:,\s*([a-z-]+)\s*)?\)$/.exec(s);
  if (steps) {
    const position = normalizeStepPosition(steps[2] ?? 'end');
    return { kind: 'steps', count: Number(steps[1]), position };
  }

  const linear = /^linear\((.*)\)$/s.exec(s);
  if (linear) return { kind: 'linear-fn', stops: parseLinearStops(linear[1]!) };

  throw new Error(`Unrecognised timing function: ${input}`);
}

function normalizeStepPosition(p: string): StepPosition {
  switch (p) {
    case 'start':
    case 'jump-start':
      return 'jump-start';
    case 'end':
    case 'jump-end':
      return 'jump-end';
    case 'jump-none':
      return 'jump-none';
    case 'jump-both':
      return 'jump-both';
    default:
      throw new Error(`Unknown step position: ${p}`);
  }
}

/** CSS Easing Level 2 `linear()`: each stop is a value with zero, one or two percentages. */
function parseLinearStops(body: string): { value: number; at: number }[] {
  const raw: { value: number; at: number | null }[] = [];
  for (const part of body.split(',')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 3) throw new Error(`Bad linear() stop: ${part}`);
    const value = Number(tokens[0]);
    if (!Number.isFinite(value)) throw new Error(`Bad linear() value: ${part}`);
    const pcts = tokens.slice(1).map((t) => {
      if (!t.endsWith('%')) throw new Error(`Bad linear() position: ${part}`);
      return Number(t.slice(0, -1)) / 100;
    });
    if (pcts.length === 0) raw.push({ value, at: null });
    for (const at of pcts) raw.push({ value, at });
  }
  if (raw.length < 2) throw new Error('linear() needs at least two stops');
  if (raw[0]!.at === null) raw[0]!.at = 0;
  if (raw[raw.length - 1]!.at === null) raw[raw.length - 1]!.at = 1;
  // Positions never go backwards.
  let max = -Infinity;
  for (const stop of raw) {
    if (stop.at !== null) {
      stop.at = Math.max(stop.at, max);
      max = stop.at;
    }
  }
  // Runs of missing positions spread evenly between their neighbours.
  for (let i = 0; i < raw.length; i++) {
    if (raw[i]!.at !== null) continue;
    let j = i;
    while (raw[j]!.at === null) j++;
    const from = raw[i - 1]!.at!;
    const to = raw[j]!.at!;
    for (let k = i; k < j; k++) raw[k]!.at = from + ((to - from) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  return raw.map((s) => ({ value: s.value, at: s.at! }));
}

/** Returns y for progress x in [0, 1]. */
export function easingFunction(easing: Easing): (x: number) => number {
  switch (easing.kind) {
    case 'cubic': {
      const [x1, y1, x2, y2] = easing.bezier;
      const f = BezierEasing(x1, y1, x2, y2);
      return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : f(x));
    }
    case 'linear-fn': {
      const stops = easing.stops;
      return (x) => {
        if (x <= stops[0]!.at) return stops[0]!.value;
        for (let i = 1; i < stops.length; i++) {
          const a = stops[i - 1]!;
          const b = stops[i]!;
          if (x <= b.at) return b.at === a.at ? b.value : a.value + ((b.value - a.value) * (x - a.at)) / (b.at - a.at);
        }
        return stops[stops.length - 1]!.value;
      };
    }
    case 'steps': {
      const { count, position } = easing;
      const jumps = position === 'jump-none' ? count - 1 : position === 'jump-both' ? count + 1 : count;
      return (x) => {
        if (x >= 1) return 1;
        let step = Math.floor(x * count);
        if (position === 'jump-start' || position === 'jump-both') step += 1;
        return Math.min(step, jumps) / jumps;
      };
    }
  }
}

/** n + 1 evenly spaced samples of [x, y], x from 0 to 1. */
export function sampleEasing(easing: Easing, n = 64): [number, number][] {
  const f = easingFunction(easing);
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = i / n;
    return [x, f(x)];
  });
}

/** Lowest and highest y a curve reaches, so plots can show overshoot. */
export function yRange(easing: Easing): [number, number] {
  const ys = sampleEasing(easing, 200).map(([, y]) => y);
  return [Math.min(0, ...ys), Math.max(1, ...ys)];
}

/**
 * How steep the curve leaves the start, as dy/dx near x = 0. For a cubic-bezier this is y1 / x1.
 * "Aggressive ease-out" in the convention page means a steep start.
 */
export function initialSlope(easing: Easing): number {
  if (easing.kind === 'cubic') {
    const [x1, y1] = easing.bezier;
    return x1 === 0 ? (y1 === 0 ? 1 : Infinity) : y1 / x1;
  }
  const f = easingFunction(easing);
  return f(0.02) / 0.02;
}

/** Share of the distance covered by 25% of the time. A plain-language "how front-loaded is it". */
export function progressAtQuarter(easing: Easing): number {
  return easingFunction(easing)(0.25);
}

/** "0.9s" | "900ms" | "0s" -> milliseconds. */
export function parseDuration(input: string): number {
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+))(ms|s)\s*$/i.exec(input);
  if (!m) throw new Error(`Unrecognised duration: ${input}`);
  const n = Number(m[1]);
  return Math.round((m[2]!.toLowerCase() === 's' ? n * 1000 : n) * 1000) / 1000;
}

/** Splits a computed list value at top-level commas: "a, cubic-bezier(0, 0, 1, 1)" -> two items. */
export function splitList(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(value.slice(start).trim());
  return out.filter((s) => s.length > 0);
}

/** A cubic-bezier written the way the browser serializes it. */
export function formatBezier(b: Bezier): string {
  return `cubic-bezier(${b.map((n) => String(Number(n.toFixed(4)))).join(', ')})`;
}

export function formatMs(ms: number): string {
  return `${Number(ms.toFixed(3))}ms`;
}
