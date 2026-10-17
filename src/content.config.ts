import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { entrySchema } from './lib/schema';

/** EASEPRINT_ENTRIES points the build at another folder; the schema test uses it to build a broken fixture. */
const base = process.env.EASEPRINT_ENTRIES ?? './src/content/entries';

const entries = defineCollection({
  loader: glob({ pattern: '*.json', base }),
  schema: entrySchema,
});

export const collections = { entries };
