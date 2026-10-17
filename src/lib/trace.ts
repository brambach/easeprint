/**
 * Reading raw measurement files. An entry's value counts as traced when its exact timing function and duration
 * appear together in one record of the raw file it names.
 */
export interface RawRecord {
  kind: 'transition' | 'animation' | 'waapi' | 'gsap';
  phase: string;
  property?: string;
  name?: string;
  duration: string;
  timingFunction: string;
  delay?: string;
  selector: string;
  count: number;
  keyframeEasings?: string[];
  /** CSS animations only, from tool 1.1: the properties its keyframes animate. */
  keyframeProperties?: string;
  iterations?: string;
}

export interface ComputedRecord {
  property?: string;
  name?: string;
  duration: string;
  timingFunction: string;
  delay: string;
  iterations?: string;
  count: number;
  samples: string[];
}

export interface RawFile {
  url: string;
  date: string;
  outcome: 'ok' | 'blocked' | 'error';
  status?: number | null;
  error?: string;
  observed?: RawRecord[];
  computed?: {
    elementsScanned: number;
    transitionAllElements: number;
    transitions: ComputedRecord[];
    animations: ComputedRecord[];
  };
  fingerprint?: Record<string, unknown>;
  stylesheets?: {
    files: number;
    reducedMotionQueries: number;
    transitionAllCount: number;
    keyframes: string[];
    cubicBeziers: Record<string, number>;
  };
  inlineSheets?: { sheets: number; reducedMotionRules: number; transitionAll: unknown[]; keyframes: string[] };
  scripts?: { files: number; reducedMotionMentions: number; libraries: Record<string, boolean> };
  hover?: { candidates?: { distinct: number }; hovered: { selector: string }[] };
}

export interface Pair {
  timingFunction: string;
  duration: string;
  /** Times the browser actually ran it during the visit. */
  events: number;
  /** Elements carrying it at the end of the visit. */
  elements: number;
  kinds: Set<string>;
  phases: Set<string>;
  properties: Set<string>;
  samples: string[];
}

export const pairKey = (timingFunction: string, duration: string) => `${timingFunction}|${duration}`;

export function rawPairs(raw: RawFile): Map<string, Pair> {
  const pairs = new Map<string, Pair>();
  const get = (tf: string, d: string) => {
    const key = pairKey(tf, d);
    let p = pairs.get(key);
    if (!p) {
      p = { timingFunction: tf, duration: d, events: 0, elements: 0, kinds: new Set(), phases: new Set(), properties: new Set(), samples: [] };
      pairs.set(key, p);
    }
    return p;
  };
  for (const r of raw.observed ?? []) {
    const p = get(r.timingFunction, r.duration);
    p.events += r.count;
    p.kinds.add(r.kind);
    p.phases.add(r.phase);
    p.properties.add(r.property ?? r.name ?? '');
    if (p.samples.length < 4 && !p.samples.includes(r.selector)) p.samples.push(r.selector);
  }
  for (const r of [...(raw.computed?.transitions ?? []), ...(raw.computed?.animations ?? [])]) {
    const p = get(r.timingFunction, r.duration);
    p.elements += r.count;
    p.kinds.add(r.name ? 'computed-animation' : 'computed-transition');
    p.phases.add('final');
    p.properties.add(r.property ?? r.name ?? '');
    for (const s of r.samples) if (p.samples.length < 4 && !p.samples.includes(s)) p.samples.push(s);
  }
  return pairs;
}

/**
 * Is this tier in the raw file? One record must carry the exact timing function, duration, phase, property,
 * selector and count. Phase "final" reads the computed scan, where count is elements and samples are selectors.
 */
export function findInRaw(
  raw: RawFile,
  tier: { timingFunction: string; duration: string; phase: string; property: string; selector: string; count: number },
): { found: boolean; reason?: string } {
  const p = rawPairs(raw).get(pairKey(tier.timingFunction, tier.duration));
  if (!p) return { found: false, reason: `pair ${tier.timingFunction} ${tier.duration} not in raw file` };
  if (!p.phases.has(tier.phase)) return { found: false, reason: `pair seen in ${[...p.phases].join('/')}, not ${tier.phase}` };
  const candidates: { property: string; selectors: string[]; count: number }[] =
    tier.phase === 'final'
      ? [...(raw.computed?.transitions ?? []), ...(raw.computed?.animations ?? [])]
          .filter((r) => r.timingFunction === tier.timingFunction && r.duration === tier.duration)
          .map((r) => ({ property: r.property ?? r.name ?? '', selectors: r.samples, count: r.count }))
      : (raw.observed ?? [])
          .filter((r) => r.phase === tier.phase && r.timingFunction === tier.timingFunction && r.duration === tier.duration)
          .map((r) => ({ property: r.property ?? r.name ?? '', selectors: [r.selector], count: r.count }));
  const propertyMatches = (pr: string) => pr === tier.property || pr.split(', ').includes(tier.property);
  const withProperty = candidates.filter((c) => propertyMatches(c.property));
  if (withProperty.length === 0) {
    return { found: false, reason: `property ${tier.property} not seen with this pair in ${tier.phase} (saw ${[...new Set(candidates.map((c) => c.property))].join(', ')})` };
  }
  const withSelector = withProperty.filter((c) => c.selectors.includes(tier.selector));
  if (withSelector.length === 0) return { found: false, reason: `selector ${tier.selector} not seen with this pair and property` };
  if (!withSelector.some((c) => c.count === tier.count)) {
    return { found: false, reason: `count ${tier.count} does not match the raw record (${withSelector.map((c) => c.count).join(', ')})` };
  }
  return { found: true };
}
