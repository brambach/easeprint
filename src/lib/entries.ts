import { getCollection, type CollectionEntry } from 'astro:content';
import { honesty, readRaw, type Honesty } from './honesty';

export type EntryWithHonesty = CollectionEntry<'entries'> & { honesty: Honesty };

const ROLE_ORDER = ['statement', 'secondary', 'signature', 'utility', 'exit', 'ambient'];

/** All entries, A to Z, each with its honesty notes computed from its raw files and tiers in role order. */
export async function loadEntries(): Promise<EntryWithHonesty[]> {
  const entries = await getCollection('entries');
  return entries
    .map((e) => {
      const raw = readRaw(e.data.raw);
      const reduced = e.data.rawReduced ? readRaw(e.data.rawReduced) : null;
      e.data.tiers.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || b.durationMs - a.durationMs);
      return Object.assign(e, { honesty: honesty(raw, reduced) });
    })
    .sort((a, b) => a.data.name.localeCompare(b.data.name));
}

/** The tier that represents a site on the index and in comparisons: its statement, or its longest move. */
export function leadTier(e: CollectionEntry<'entries'>) {
  return e.data.tiers.find((t) => t.role === 'statement') ?? [...e.data.tiers].sort((a, b) => b.durationMs - a.durationMs)[0];
}

export const rawHref = (path: string) => `/${path.replace(/^data\//, '')}`;
