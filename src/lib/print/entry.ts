import type { CollectionEntry } from 'astro:content';
import type { PrintTier } from './fingerprint';

/** An entry's measured tiers as print input. Ambient tiers draw as broken ridges, like loops in the extension. */
export function entryPrintTiers(e: CollectionEntry<'entries'>): PrintTier[] {
  return e.data.tiers.map((t) => ({ timingFunction: t.timingFunction, durationMs: t.durationMs, count: t.count, loop: t.role === 'ambient' }));
}
