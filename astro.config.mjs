// @ts-check
import { defineConfig } from 'astro/config';

// The schema test builds fixtures into a scratch folder so it never touches the real dist/ or cache.
const scratch = process.env.EASEPRINT_BUILD_DIR;

export default defineConfig({
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  ...(scratch ? { outDir: `${scratch}/dist`, cacheDir: `${scratch}/cache` } : {}),
});
