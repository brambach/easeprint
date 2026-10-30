/**
 * pnpm ext:build: bundles extension/ into extension/dist (load it unpacked from there) and zips it to
 * public/easeprint-extension.zip so the site can offer it. `--test` adds host access to every site, for the e2e
 * tests only: the real extension reads a page only after you click it.
 */
import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const test = process.argv.includes('--test');
const root = new URL('..', import.meta.url).pathname;
const out = join(root, test ? 'extension/dist-test' : 'extension/dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'fonts'), { recursive: true });

await build({
  entryPoints: {
    panel: join(root, 'extension/src/panel.ts'),
    background: join(root, 'extension/src/background.ts'),
  },
  outdir: out,
  bundle: true,
  format: 'esm',
  target: 'chrome116',
  minify: !test,
  legalComments: 'none',
});
// The probe is injected as a classic script, so it can't be a module.
await build({
  entryPoints: [join(root, 'extension/src/probe.ts')],
  outfile: join(out, 'probe.js'),
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  minify: !test,
  legalComments: 'none',
});

const css = [
  readFileSync(join(root, 'vendor/design-tokens/tokens.css'), 'utf8'),
  readFileSync(join(root, 'vendor/design-tokens/auto-dark.css'), 'utf8'),
  readFileSync(join(root, 'extension/src/panel.css'), 'utf8'),
].join('\n');
writeFileSync(join(out, 'panel.css'), css);

const manifest = JSON.parse(readFileSync(join(root, 'extension/static/manifest.json'), 'utf8'));
if (test) manifest.host_permissions = ['<all_urls>'];
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
cpSync(join(root, 'extension/static/panel.html'), join(out, 'panel.html'));
cpSync(join(root, 'extension/static/icons'), join(out, 'icons'), { recursive: true });

const fonts: [string, string][] = [
  ['@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2', 'instrument-serif.woff2'],
  ['@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2', 'instrument-sans.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', 'jetbrains-mono-400.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2', 'jetbrains-mono-500.woff2'],
];
for (const [from, to] of fonts) cpSync(join(root, 'node_modules', from), join(out, 'fonts', to));

if (!test) {
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else files[`easeprint/${relative(out, p)}`] = readFileSync(p);
    }
  };
  walk(out);
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'public/easeprint-extension.zip'), zipSync(files, { level: 9, mtime: new Date('2026-10-30T00:00:00Z') }));
}
console.log(`extension built to ${relative(root, out)}`);
