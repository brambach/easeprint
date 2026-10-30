import { easingFunction, parseEasing } from '../easing';

/**
 * The fingerprint: a site's tiers drawn as ridges. Nothing in it is decoration.
 *
 * - Each tier is one ridge. Its distance from the core is its duration, on a log scale, so fast sites have tight
 *   prints and slow ones open up.
 * - Along the ridge, its bulge is the curve: how far the easing runs ahead of (or behind) linear time at that
 *   point. An ease-out swells early, an ease-in late, an overshoot pushes past its neighbours.
 * - Heavier tiers (seen more often) get more strands. Loops are drawn broken.
 * - Each ridge leaves a gap at the bottom, where the curve starts and ends, which is what makes it read as a print.
 */
export interface PrintTier {
  timingFunction: string;
  durationMs: number;
  count: number;
  loop?: boolean;
}

export interface Ridge {
  d: string;
  /** Index of the tier it draws. */
  tier: number;
  strand: number;
  loop: boolean;
  /** Radius before the curve's bulge, in viewBox units. */
  radius: number;
  /** True for a tier ridge, false for one interpolated between them. */
  measured: boolean;
}

export interface Print {
  width: number;
  height: number;
  viewBox: string;
  ridges: Ridge[];
}

const W = 100;
const H = 120;
const CX = 50;
const CY = 62;
/** Taller than wide, like a finger. */
const OVAL = 1.16;
const R_MIN = 9;
const R_MAX = 42;
const GAP = 3.4;
const STRAND = 1.15;
const BULGE = 9;
const MS_LO = 60;
const MS_HI = 4000;

export function strandsFor(count: number): number {
  return Math.max(1, Math.min(3, 1 + Math.floor(Math.log2(Math.max(1, count)) / 2.2)));
}

/** Where each tier's ridge sits, in viewBox units from the core. */
export function radii(tiers: PrintTier[]): number[] {
  const order = tiers.map((t, i) => ({ i, t })).sort((a, b) => a.t.durationMs - b.t.durationMs || a.i - b.i);
  const out = new Array<number>(tiers.length);
  let prev = -Infinity;
  let prevStrands = 0;
  for (const { i, t } of order) {
    const k = (Math.log(Math.max(MS_LO, Math.min(MS_HI, t.durationMs))) - Math.log(MS_LO)) / (Math.log(MS_HI) - Math.log(MS_LO));
    let r = R_MIN + k * (R_MAX - R_MIN);
    r = Math.max(r, prev + GAP + (prevStrands - 1) * STRAND);
    out[i] = r;
    prev = r;
    prevStrands = strandsFor(t.count);
  }
  // Squeeze back inside the frame if spacing pushed the outer ridges out.
  const outer = Math.max(...out.map((r, i) => r + (strandsFor(tiers[i]!.count) - 1) * STRAND), R_MIN);
  if (outer > R_MAX) {
    const s = (R_MAX - R_MIN) / (outer - R_MIN);
    for (let i = 0; i < out.length; i++) out[i] = R_MIN + (out[i]! - R_MIN) * s;
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/*
 * Ridges between the tier ridges are interpolated from their neighbours, the way contour lines fill between
 * survey points, so the print reads as one surface. They're drawn thinner; the tier ridges carry the weight.
 */
const FIELD_STEP = 1.55;
const CORE = 2.2;

export function fingerprint(tiers: PrintTier[], points = 120): Print {
  const rs = radii(tiers);
  const profiles: { r: number; lead: number[]; tier: number }[] = [];
  tiers.forEach((t, i) => {
    let f: (x: number) => number;
    try {
      f = easingFunction(parseEasing(t.timingFunction));
    } catch {
      return;
    }
    profiles.push({ r: rs[i]!, tier: i, lead: Array.from({ length: points + 1 }, (_, p) => f(p / points) - p / points) });
  });
  profiles.sort((a, b) => a.r - b.r);
  const ridges: Ridge[] = [];
  if (!profiles.length) return { width: W, height: H, viewBox: `0 0 ${W} ${H}`, ridges };

  const leadAt = (rho: number): number[] => {
    const first = profiles[0]!;
    const last = profiles[profiles.length - 1]!;
    if (rho <= first.r) return first.lead.map((v) => v * (rho / first.r));
    if (rho >= last.r) return last.lead.map((v) => v * Math.max(0, 1 - (rho - last.r) / 10));
    const j = profiles.findIndex((p) => p.r >= rho);
    const a = profiles[j - 1]!;
    const b = profiles[j]!;
    const w = (rho - a.r) / (b.r - a.r || 1);
    return a.lead.map((v, k) => v + (b.lead[k]! - v) * w);
  };

  const draw = (rho: number, lead: number[], phase: number): string => {
    // Each ridge breaks once near the bottom, where its curve starts and ends. Where it breaks wanders from ridge to
    // ridge (deterministically, from the radius) so the ends scatter like real ridge endings.
    const jitter = Math.sin(rho * 12.9898) * 43758.5453;
    const wander = (jitter - Math.floor(jitter) - 0.5) * 1.1;
    const gapHalf = 0.09 + 0.6 / (rho + 4);
    const start = Math.PI / 2 + phase + wander + gapHalf;
    const span = Math.PI * 2 - gapHalf * 2;
    const oval = OVAL + Math.max(0, 0.25 - rho / 60);
    let d = '';
    for (let p = 0; p <= points; p++) {
      const x = p / points;
      const r = rho + BULGE * Math.max(-0.5, Math.min(0.5, lead[p]!)) * Math.min(1, rho / 14);
      const a = start + span * x;
      d += `${p === 0 ? 'M' : 'L'}${round(CX + r * Math.cos(a))} ${round(CY + r * Math.sin(a) * oval)}`;
    }
    return d;
  };

  const outer = profiles[profiles.length - 1]!.r + (strandsFor(tiers[profiles[profiles.length - 1]!.tier]!.count) - 1) * STRAND;
  const taken = profiles.flatMap((p) => {
    const n = strandsFor(tiers[p.tier]!.count);
    return [p.r - FIELD_STEP * 0.6, p.r + (n - 1) * STRAND + FIELD_STEP * 0.6];
  });
  for (let rho = CORE; rho <= Math.min(R_MAX + 4, outer + 4); rho += FIELD_STEP) {
    let blocked = false;
    for (let k = 0; k < taken.length; k += 2) if (rho > taken[k]! && rho < taken[k + 1]!) blocked = true;
    if (blocked) continue;
    ridges.push({ d: draw(rho, leadAt(rho), 0), tier: -1, strand: 0, loop: false, radius: rho, measured: false });
  }
  for (const p of profiles) {
    const t = tiers[p.tier]!;
    for (let s = 0; s < strandsFor(t.count); s++) {
      const rho = p.r + s * STRAND;
      ridges.push({ d: draw(rho, p.lead, 0), tier: p.tier, strand: s, loop: Boolean(t.loop), radius: rho, measured: true });
    }
  }
  return { width: W, height: H, viewBox: `0 0 ${W} ${H}`, ridges };
}

export interface SvgOptions {
  /** Stroke colour. Defaults to currentColor so the print takes the text ink. */
  ink?: string;
  strokeWidth?: number;
  title?: string;
  className?: string;
}

/** The print as a standalone SVG string. Used by the site, the extension and the saved image. */
export function fingerprintSvg(tiers: PrintTier[], o: SvgOptions = {}): string {
  const p = fingerprint(tiers);
  const ink = o.ink ?? 'currentColor';
  const sw = o.strokeWidth ?? 0.62;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const paths = p.ridges
    .map((r) =>
      r.measured
        ? `<path d="${r.d}" data-tier="${r.tier}"${r.loop ? ` stroke-dasharray="1.6 1.4"` : ''}/>`
        : `<path d="${r.d}" stroke-width="${round(sw * 0.6)}" opacity="0.62"/>`,
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${p.viewBox}"${o.className ? ` class="${esc(o.className)}"` : ''} role="img"${o.title ? ` aria-label="${esc(o.title)}"` : ' aria-hidden="true"'}>` +
    `<g fill="none" stroke="${esc(ink)}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`
  );
}
