import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRoute, GetStaticPaths } from 'astro';

/** Serves every raw measurement file at /raw/<site>/<file>, unchanged, so each number on the site links to its source. */
const root = join(process.cwd(), 'data/raw');

export const getStaticPaths = (() =>
  readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(root, d.name))
        .filter((f) => f.endsWith('.json'))
        .map((file) => ({ params: { site: d.name, file } })),
    )) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) =>
  new Response(readFileSync(join(root, params.site!, params.file!), 'utf8'), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
