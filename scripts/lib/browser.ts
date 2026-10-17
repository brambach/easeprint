import { existsSync } from 'node:fs';

/**
 * The cloud container ships a Chromium that may not match this Playwright's pinned revision.
 * Prefer an explicit path when one exists; otherwise let Playwright find its own.
 */
export function chromiumPath(): string | undefined {
  const candidates = [process.env.EASEPRINT_CHROMIUM, '/opt/pw-browsers/chromium'];
  return candidates.find((p): p is string => Boolean(p && existsSync(p)));
}
