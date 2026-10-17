import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'astro/zod';
import { parseDuration, parseEasing } from './easing';
import { readRaw } from './honesty';
import { findInRaw } from './trace';

/**
 * The shape of an entry. Rules live here first: a value that can't be parsed, or can't be found in the raw file
 * it names, fails the build. Vocabulary follows the house glossary: spatial and material postures, ambient split
 * three ways. Honesty notes (reduced motion, `transition: all`, JS and canvas) are computed from the raw files in
 * src/lib/honesty.ts, so they aren't fields here.
 */
export const POSTURES = ['spatial', 'material', 'ambient'] as const;
export const AMBIENT_KINDS = ['decorative', 'diagrammatic', 'character'] as const;
export const ROLES = ['statement', 'secondary', 'signature', 'utility', 'exit', 'ambient'] as const;
export const PHASES = ['load', 'scroll', 'hover', 'unhover', 'click', 'final'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

const timingFunction = z.string().refine(
  (s) => {
    try {
      parseEasing(s);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'not a timing function the browser could compute' },
);

const duration = z.string().refine(
  (s) => {
    try {
      return parseDuration(s) >= 0;
    } catch {
      return false;
    }
  },
  { message: 'not a CSS duration like "0.9s" or "200ms"' },
);

const exists = (p: string) => existsSync(resolve(process.env.EASEPRINT_ROOT ?? process.cwd(), p));

/** A file under data/raw that exists on disk. Paths are relative to the repo root (EASEPRINT_ROOT in tests). */
export const rawPath = z
  .string()
  .regex(/^data\/raw\/[a-z0-9.-]+\/\d{4}-\d{2}-\d{2}\.json$/, 'expected data/raw/<site>/<YYYY-MM-DD>.json')
  .refine(exists, { message: 'raw measurement file does not exist' });

export const rawReducedPath = z
  .string()
  .regex(/^data\/raw\/[a-z0-9.-]+\/\d{4}-\d{2}-\d{2}-reduced\.json$/, 'expected data/raw/<site>/<YYYY-MM-DD>-reduced.json')
  .refine(exists, { message: 'reduced-motion measurement file does not exist' });

export const tierSchema = z
  .strictObject({
    role: z.enum(ROLES),
    /** How the site runs it: a CSS transition, a CSS keyframe animation, or the Web Animations API. */
    kind: z.enum(['transition', 'animation', 'waapi']),
    /** What moves, in plain words: "nav link underline". */
    label: z.string().min(3),
    /** The CSS property the site animates. Our demo still only moves transform and opacity. */
    property: z.string().min(1),
    /** Exactly as computed by the browser, so it can be found in the raw file. */
    timingFunction,
    duration,
    durationMs: z.number().nonnegative(),
    /** Which part of the measurement run saw it. */
    phase: z.enum(PHASES),
    /** A sample selector, exactly as the raw file has it. */
    selector: z.string().min(1),
    /** Count on the matching raw record: events seen, or elements carrying it for phase "final". */
    count: z.number().int().positive(),
  })
  .refine((t) => Math.abs(parseDuration(t.duration) - t.durationMs) < 0.001, {
    message: 'durationMs must equal duration',
    path: ['durationMs'],
  });

/** Values from Bryce's own notes. Never mixed with measured values; always dated. */
export const noteSchema = z.strictObject({
  date: isoDate,
  label: z.string().min(3),
  timingFunction: timingFunction.optional(),
  duration: duration.optional(),
  text: z.string().min(1),
});

export const entrySchema = z
  .strictObject({
    name: z.string().min(1),
    site: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'bare hostname, e.g. "linear.app"'),
    url: z.url(),
    captured: isoDate,
    raw: rawPath,
    rawReduced: rawReducedPath.optional(),
    status: z.enum(['measured', 'partial', 'unmeasurable']),
    /** Why a site is partial or unmeasurable. Required for both. */
    statusReason: z.string().min(10).optional(),
    posture: z.enum(POSTURES),
    ambientKind: z.enum(AMBIENT_KINDS).optional(),
    summary: z.string().min(20),
    tiers: z.array(tierSchema),
    /** Anything the computed honesty notes can't say on their own. */
    honestyNote: z.string().min(10).optional(),
    notes: z.array(z.string().min(1)),
    fromNotes: z.array(noteSchema).default([]),
  })
  .superRefine((e, ctx) => {
    if (e.posture === 'ambient' && !e.ambientKind) {
      ctx.addIssue({ code: 'custom', path: ['ambientKind'], message: 'ambient posture needs an ambientKind' });
    }
    if (e.posture !== 'ambient' && e.ambientKind) {
      ctx.addIssue({ code: 'custom', path: ['ambientKind'], message: 'ambientKind only applies to ambient posture' });
    }
    if (e.status !== 'measured' && !e.statusReason) {
      ctx.addIssue({ code: 'custom', path: ['statusReason'], message: `${e.status} entries must say why` });
    }
    if (e.status !== 'unmeasurable' && e.tiers.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['tiers'], message: 'a measured entry needs at least one tier' });
    }
    if (!e.raw.endsWith(`/${e.captured}.json`) || !e.raw.includes(`/${e.site}/`)) {
      ctx.addIssue({ code: 'custom', path: ['raw'], message: 'raw file must be data/raw/<site>/<captured>.json' });
    }
    if (e.rawReduced && e.rawReduced !== e.raw.replace(/\.json$/, '-reduced.json')) {
      ctx.addIssue({ code: 'custom', path: ['rawReduced'], message: 'reduced run must sit beside the raw file, same date' });
    }
    if (e.tiers.filter((t) => t.role === 'statement').length > 1) {
      ctx.addIssue({ code: 'custom', path: ['tiers'], message: 'at most one statement tier per site' });
    }
    // Every tier must be found, exactly, in the raw file. This is the trace rule, enforced at build time.
    if (!exists(e.raw)) return;
    const raw = readRaw(e.raw);
    e.tiers.forEach((tier, i) => {
      const hit = findInRaw(raw, tier);
      if (!hit.found) ctx.addIssue({ code: 'custom', path: ['tiers', i], message: `untraced: ${hit.reason}` });
    });
  });

export type Entry = z.infer<typeof entrySchema>;
export type Tier = z.infer<typeof tierSchema>;
