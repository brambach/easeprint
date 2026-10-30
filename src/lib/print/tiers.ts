import { easingFunction, parseEasing, progressAtQuarter, type Easing } from '../easing';

/**
 * Turns everything a visit saw into a site's tiers: the handful of timing pairs it actually uses, named by job.
 * Pure, so the extension, the site and the tests all agree on what a site's fingerprint is.
 */
export type ObservationKind = 'transition' | 'animation' | 'waapi' | 'gsap' | 'fitted';

export interface Observation {
  kind: ObservationKind;
  /** What moved: "transform", "opacity, transform". */
  property: string;
  /** Exactly as the browser computed it, or as the fitter wrote it for JS motion. */
  timingFunction: string;
  durationMs: number;
  /** Events seen, or elements carrying it at rest. */
  count: number;
  /** "infinite" for loops. */
  iterations?: string;
  selector?: string;
  /** For fitted curves: mean absolute error of the fit, in progress units. */
  fitError?: number;
}

export type Role = 'micro' | 'utility' | 'move' | 'statement' | 'exit' | 'loop';

export interface Tier {
  /** Token name: "utility", "move-2". */
  name: string;
  role: Role;
  timingFunction: string;
  durationMs: number;
  count: number;
  properties: string[];
  selectors: string[];
  kinds: ObservationKind[];
  /** Set when every observation behind it was fitted from JS motion rather than read from the browser. */
  fitted: boolean;
  /** observationKey() of every observation folded into it, so the page can find its elements again. */
  keys: string[];
}

/** One timing pair, as a string: the key both the probe and the tiers use. */
export const observationKey = (o: Pick<Observation, 'timingFunction' | 'durationMs'>) => `${o.timingFunction}|${Math.round(o.durationMs)}`;

export interface TierOptions {
  /** Most tiers to return. The rest are counted in `dropped`. */
  max?: number;
  /** Shortest duration worth a tier. Sites use 1ms and 10ms transitions as tricks, not motion. */
  minMs?: number;
}

/** Duration bands for naming. Upper bounds, in ms. */
export const BANDS: readonly [Role, number][] = [
  ['micro', 150],
  ['utility', 350],
  ['move', 700],
  ['statement', Infinity],
];

const SAMPLES = 24;

function curveOf(tf: string): number[] | null {
  let e: Easing;
  try {
    e = parseEasing(tf);
  } catch {
    return null;
  }
  const f = easingFunction(e);
  return Array.from({ length: SAMPLES + 1 }, (_, i) => f(i / SAMPLES));
}

/** Largest gap between two curves, sampled. 0 means the same shape. */
export function curveDistance(a: string, b: string): number {
  const ca = curveOf(a);
  const cb = curveOf(b);
  if (!ca || !cb) return Infinity;
  return Math.max(...ca.map((y, i) => Math.abs(y - cb[i]!)));
}

/** An ease-in shape: slow start, the curve exits that way. */
export function isExitShape(tf: string): boolean {
  try {
    const e = parseEasing(tf);
    if (e.kind !== 'cubic' || e.keyword === 'linear') return false;
    const [x1, y1, x2, y2] = e.bezier;
    if (x1 === 0 && y1 === 0 && x2 === 1 && y2 === 1) return false;
    return progressAtQuarter(e) < 0.12;
  } catch {
    return false;
  }
}

interface Cluster {
  obs: Observation[];
  lead: Observation;
  count: number;
  loop: boolean;
}

export function buildTiers(observations: Observation[], options: TierOptions = {}): { tiers: Tier[]; dropped: number } {
  const max = options.max ?? 8;
  const minMs = options.minMs ?? 50;
  const usable = observations.filter((o) => o.durationMs >= minMs && curveOf(o.timingFunction) !== null && o.count > 0);

  // Exact pairs first, then fold near twins into the heavier one: the same curve within 0.03 and duration within 8%.
  const exact = new Map<string, Cluster>();
  for (const o of usable) {
    const loop = o.iterations === 'infinite';
    const key = `${o.timingFunction.toLowerCase()}|${Math.round(o.durationMs)}|${loop}`;
    const c = exact.get(key);
    if (c) {
      c.obs.push(o);
      c.count += o.count;
      if (o.count > c.lead.count) c.lead = o;
    } else exact.set(key, { obs: [o], lead: o, count: o.count, loop });
  }
  const clusters = [...exact.values()].sort((a, b) => b.count - a.count);
  const merged: Cluster[] = [];
  for (const c of clusters) {
    const home = merged.find(
      (m) =>
        m.loop === c.loop &&
        Math.abs(m.lead.durationMs - c.lead.durationMs) <= 0.08 * Math.max(m.lead.durationMs, c.lead.durationMs) &&
        curveDistance(m.lead.timingFunction, c.lead.timingFunction) <= 0.03,
    );
    if (home) {
      home.obs.push(...c.obs);
      home.count += c.count;
    } else merged.push({ ...c, obs: [...c.obs] });
  }

  const kept = merged.slice(0, max);
  const dropped = merged.slice(max).reduce((n, c) => n + c.count, 0);

  const tiers: Tier[] = kept.map((c) => {
    const role: Role = c.loop
      ? 'loop'
      : isExitShape(c.lead.timingFunction)
        ? 'exit'
        : BANDS.find(([, upTo]) => c.lead.durationMs <= upTo)![0];
    const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
    return {
      name: role,
      role,
      timingFunction: c.lead.timingFunction,
      durationMs: c.lead.durationMs,
      count: c.count,
      properties: uniq(c.obs.flatMap((o) => o.property.split(/\s*,\s*/))).slice(0, 6),
      selectors: uniq(c.obs.map((o) => o.selector)).slice(0, 5),
      kinds: uniq(c.obs.map((o) => o.kind)) as ObservationKind[],
      fitted: c.obs.every((o) => o.kind === 'fitted'),
      keys: uniq(c.obs.map(observationKey)),
    };
  });

  // Fast to slow, so names read in order. Repeats in a role get -2, -3 by weight.
  tiers.sort((a, b) => Number(a.role === 'loop') - Number(b.role === 'loop') || a.durationMs - b.durationMs);
  const byRole = new Map<Role, Tier[]>();
  for (const t of tiers) byRole.set(t.role, [...(byRole.get(t.role) ?? []), t]);
  for (const group of byRole.values()) {
    if (group.length < 2) continue;
    [...group].sort((a, b) => b.count - a.count).forEach((t, i) => (t.name = i === 0 ? t.role : `${t.role}-${i + 1}`));
  }
  return { tiers, dropped };
}

/** "0.8s", "325ms": how a duration reads in copied code. Whole tenths of a second read as seconds. */
export function durationLabel(ms: number): string {
  const r = Math.round(ms);
  if (r >= 1000 && r % 100 === 0) return `${r / 1000}s`;
  return `${r}ms`;
}
