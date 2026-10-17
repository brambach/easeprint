import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDuration } from './easing';
import type { RawFile } from './trace';

/**
 * The honest notes on an entry, computed from its raw files at build time so nobody types them by hand.
 */
export type ReducedVerdict = 'honored' | 'partial' | 'not-honored' | 'no-movement' | 'unknown';

export interface Honesty {
  reducedMotion: ReducedVerdict;
  reducedMotionEvidence: string;
  motionEvents: number;
  reducedMotionEvents: number | null;
  movementEvents: number;
  reducedMovementEvents: number | null;
  stylesheetReducedQueries: number;
  scriptReducedQueries: number;
  transitionAllElements: number;
  transitionAllDeclarations: number;
  motionInJs: boolean;
  jsLibraries: string[];
  motionInCanvas: boolean;
  hovered: number;
  tell: PostureTell;
}

/**
 * The glossary's quick posture test: "read the property list. Transform and opacity on top means spatial. Shadow and
 * colour on top means material." Counted over transitions every element carries at rest at the end of the visit,
 * so it's evidence beside the posture an entry chooses, not a verdict: utility classes inflate the surface side, and
 * motion that only exists after a click isn't at rest.
 */
export interface PostureTell {
  moving: number;
  surface: number;
  looping: number;
  suggests: 'spatial' | 'material';
}

const MOVING_PROPS = new Set(['transform', 'translate', 'scale', 'rotate', 'opacity']);

export function postureTell(raw: RawFile): PostureTell {
  let moving = 0;
  let surface = 0;
  for (const r of raw.computed?.transitions ?? []) {
    if (r.property === 'all' || r.property === 'none') continue;
    if (MOVING_PROPS.has(r.property ?? '')) moving += r.count;
    else surface += r.count;
  }
  const looping = (raw.computed?.animations ?? []).filter((r) => r.iterations === 'infinite').reduce((n, r) => n + r.count, 0);
  return { moving, surface, looping, suggests: moving >= surface ? 'spatial' : 'material' };
}

export function readRaw(path: string): RawFile {
  return JSON.parse(readFileSync(resolve(process.env.EASEPRINT_ROOT ?? process.cwd(), path), 'utf8')) as RawFile;
}

function ms(d: string): number {
  try {
    return parseDuration(d);
  } catch {
    return 0;
  }
}

/** Every time the browser ran a timed animation or transition during the visit (zero-length ones don't count). */
export function motionEvents(raw: RawFile): number {
  return (raw.observed ?? []).filter((r) => ms(r.duration) > 0).reduce((n, r) => n + r.count, 0);
}

const MOVES = /^(transform|translate|scale|rotate|top|left|right|bottom|inset.*|margin.*|width|height|max-height|max-width|offset.*|background-position.*|d|x|y|cx|cy)$/;
const moves = (props: string) => props.split(',').some((p) => MOVES.test(p.trim()));

/**
 * Timed events that move something: transform, position or size. Opacity and colour fades don't count, since
 * swapping movement for a fade is a fair reduced-motion strategy. CSS animations count unless the raw file says
 * their keyframes only touch non-moving properties (tool 1.1 records that; 1.0 didn't, so those count).
 */
export function movementEvents(raw: RawFile): number {
  return (raw.observed ?? [])
    .filter((r) => ms(r.duration) > 0)
    .filter((r) => {
      if (r.kind === 'animation') return r.keyframeProperties === undefined || r.keyframeProperties === '' || moves(r.keyframeProperties);
      return moves(r.property ?? '');
    })
    .reduce((n, r) => n + r.count, 0);
}

export function verdict(normal: number, reduced: number | null): ReducedVerdict {
  if (reduced === null || normal === 0) return 'unknown';
  const ratio = reduced / normal;
  if (ratio <= 0.2) return 'honored';
  if (ratio <= 0.75) return 'partial';
  return 'not-honored';
}

const JS_LIBS: Record<string, string> = {
  gsap: 'GSAP',
  scrollTrigger: 'ScrollTrigger',
  lenis: 'Lenis',
  locomotiveScroll: 'Locomotive Scroll',
  framerMotion: 'Framer Motion / Motion',
  three: 'three.js',
  pixi: 'PixiJS',
  ogl: 'OGL',
  barba: 'Barba',
  swup: 'Swup',
  lottie: 'Lottie',
  rive: 'Rive',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function honesty(raw: RawFile, reduced: RawFile | null): Honesty {
  const normal = motionEvents(raw);
  const usable = reduced && reduced.outcome === 'ok' ? reduced : null;
  const reducedEvents = usable ? motionEvents(usable) : null;
  const moving = movementEvents(raw);
  const reducedMoving = usable ? movementEvents(usable) : null;
  // Judge on movement. Fades and colour changes are fine under reduced motion, so a page that moves nothing has
  // nothing to reduce (as far as CSS and WAAPI show).
  const v = usable === null ? 'unknown' : moving > 0 ? verdict(moving, reducedMoving) : 'no-movement';
  const fp = (raw.fingerprint ?? {}) as Record<string, unknown>;
  const libs = Object.entries(raw.scripts?.libraries ?? {})
    .filter(([k, on]) => on && k in JS_LIBS)
    .map(([k]) => JS_LIBS[k]!);
  if (fp.gsap && !libs.includes('GSAP')) libs.unshift('GSAP');
  if (fp.lenis && !libs.includes('Lenis')) libs.push('Lenis');
  const waapi = (raw.observed ?? []).some((r) => r.kind === 'waapi' || r.kind === 'gsap');
  const stylesheetReducedQueries = (raw.stylesheets?.reducedMotionQueries ?? 0) + (raw.inlineSheets?.reducedMotionRules ?? 0);
  const scriptReducedQueries = Number(fp.reducedMotionQueryCount ?? 0);

  const pct = (a: number, b: number | null) => (b === null || a === 0 ? '' : ` (${Math.round((b / a) * 100)}%)`);
  const evidence =
    reducedEvents === null
      ? `No reduced-motion run on file. ${plural(stylesheetReducedQueries, "prefers-reduced-motion query", "prefers-reduced-motion queries")} in stylesheets; scripts asked matchMedia about it ${plural(scriptReducedQueries, "time", "times")}.`
      : `Movement (transform, position, size): ${moving} events in the normal run, ${reducedMoving} with reduced motion on${pct(moving, reducedMoving)}. ` +
        `All timed CSS and WAAPI motion: ${normal}, then ${reducedEvents}${pct(normal, reducedEvents)}. ` +
        `${plural(stylesheetReducedQueries, "prefers-reduced-motion query", "prefers-reduced-motion queries")} in stylesheets; scripts asked matchMedia about it ${plural(scriptReducedQueries, "time", "times")}.`;

  return {
    reducedMotion: v,
    reducedMotionEvidence: evidence,
    motionEvents: normal,
    reducedMotionEvents: reducedEvents,
    movementEvents: moving,
    reducedMovementEvents: reducedMoving,
    stylesheetReducedQueries,
    scriptReducedQueries,
    transitionAllElements: raw.computed?.transitionAllElements ?? 0,
    transitionAllDeclarations: (raw.stylesheets?.transitionAllCount ?? 0) + (raw.inlineSheets?.transitionAll.length ?? 0),
    motionInJs: waapi || libs.some((l) => ['GSAP', 'Lenis', 'Framer Motion / Motion', 'Locomotive Scroll', 'ScrollTrigger'].includes(l)),
    jsLibraries: libs,
    motionInCanvas: Number(fp.webglContexts ?? 0) > 0 && Number(fp.viewportSizedCanvases ?? 0) > 0,
    hovered: raw.hover?.hovered.length ?? 0,
    tell: postureTell(raw),
  };
}
