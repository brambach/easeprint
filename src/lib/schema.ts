import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'astro/zod';
import { parseDuration, parseEasing } from './easing';

/**
 * The shape of an entry. Rules live here first: a value that can't be traced or parsed fails the build.
 * Vocabulary follows the house glossary: spatial and material postures, ambient split three ways.
 */
export const POSTURES = ['spatial', 'material', 'ambient'] as const;
export const AMBIENT_KINDS = ['decorative', 'diagrammatic', 'character'] as const;
export const ROLES = ['statement', 'signature', 'utility', 'exit', 'ambient'] as const;
export const PHASES = ['load', 'scroll', 'hover', 'final'] as const;

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

/** A file under data/raw that exists on disk. Paths are relative to the repo root. */
export const rawPath = z
  .string()
  .regex(/^data\/raw\/[a-z0-9.-]+\/\d{4}-\d{2}-\d{2}\.json$/, 'expected data/raw/<site>/<YYYY-MM-DD>.json')
  .refine((p) => existsSync(resolve(process.cwd(), p)), { message: 'raw measurement file does not exist' });

export const tierSchema = z
  .strictObject({
    role: z.enum(ROLES),
    /** What moves, in plain words: "nav link underline". */
    label: z.string().min(3),
    /** The CSS property the site animates. Our demo still only moves transform and opacity. */
    property: z.string().min(1),
    /** Exactly as computed by the browser, so it can be found in the raw file. */
    timingFunction,
    duration,
    durationMs: z.number().nonnegative(),
    delay: duration.optional(),
    /** Which part of the measurement run saw it. */
    phase: z.enum(PHASES),
    /** A sample selector from the raw file. */
    selector: z.string().min(1),
    /** How many elements or events carried this exact pair. */
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
    status: z.enum(['measured', 'partial', 'unmeasurable']),
    /** Why a site is partial or unmeasurable. Required for both. */
    statusReason: z.string().min(10).optional(),
    posture: z.enum(POSTURES),
    ambientKind: z.enum(AMBIENT_KINDS).optional(),
    summary: z.string().min(20),
    tiers: z.array(tierSchema),
    honesty: z.strictObject({
      reducedMotion: z.enum(['honored', 'partial', 'not-found', 'unknown']),
      reducedMotionEvidence: z.string().min(10),
      transitionAll: z.strictObject({
        /** Elements whose computed transition-property included `all` at the end of the run. */
        computedElements: z.number().int().nonnegative(),
        /** `transition: all` or `transition-property: all` declarations in the CSS the page loaded. */
        declarations: z.number().int().nonnegative(),
      }),
      motionInJs: z.boolean(),
      motionInCanvas: z.boolean(),
    }),
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
    if (!e.raw.includes(`/${e.captured}.json`)) {
      ctx.addIssue({ code: 'custom', path: ['raw'], message: 'raw file date must match captured' });
    }
    const roles = e.tiers.map((t) => t.role);
    if (roles.filter((r) => r === 'statement').length > 1) {
      ctx.addIssue({ code: 'custom', path: ['tiers'], message: 'at most one statement tier per site' });
    }
  });

export type Entry = z.infer<typeof entrySchema>;
export type Tier = z.infer<typeof tierSchema>;
