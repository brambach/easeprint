import { expect, test, type Page } from '@playwright/test';

/** Samples the puck's transform for a while after a click. */
async function sampleTransforms(page: Page, selector: string, ms = 500) {
  return page.evaluate(
    async ([sel, duration]) => {
      const puck = document.querySelector(`${sel} [data-puck]`)!;
      (document.querySelector(`${sel} .stage-hit`) as HTMLButtonElement).click();
      const seen: string[] = [];
      const start = performance.now();
      while (performance.now() - start < duration) {
        seen.push(getComputedStyle(puck).transform);
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { seen, running: puck.getAnimations().length };
    },
    [selector, ms] as const,
  );
}

test.describe('copy button', () => {
  test.skip(({ browserName }) => browserName !== 'chromium');

  test('puts the exact transition string on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/entries/cuberto/');
    const statement = page.locator('[data-demo]').first();
    await statement.getByRole('button', { name: 'Copy transition' }).click();
    await expect(statement.locator('[data-copy-status]')).toContainText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);');

    await statement.getByRole('button', { name: 'Copy custom properties' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      '--ease-statement: cubic-bezier(0.16, 1, 0.3, 1);\n--duration-statement: 1.2s;',
    );
  });
});

test.describe('demo', () => {
  test('moves through intermediate positions when motion is allowed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/entries/cuberto/');
    const { seen } = await sampleTransforms(page, '[data-demo]:first-of-type', 600);
    expect(new Set(seen).size).toBeGreaterThan(5);
  });

  test('slow-mo plays at 10% speed', async ({ page }) => {
    await page.goto('/entries/cuberto/');
    const demo = page.locator('[data-demo]').first();
    await demo.getByRole('button', { name: 'Slow-mo 10%' }).click();
    await expect(demo.getByRole('button', { name: 'Slow-mo 10%' })).toHaveAttribute('aria-pressed', 'true');
    await demo.getByRole('button', { name: 'Replay' }).click();
    const duration = await demo.locator('[data-puck]').evaluate((el) => el.getAnimations()[0]?.effect?.getTiming().duration);
    expect(duration).toBe(12000);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('demos do not move: a click jumps to the end state', async ({ page }) => {
    await page.goto('/entries/cuberto/');
    const { seen, running } = await sampleTransforms(page, '[data-demo]:first-of-type', 400);
    expect(running).toBe(0);
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]).not.toBe('none');
    await expect(page.locator('[data-demo]').first().locator('[data-status]')).toContainText('Reduced motion is on');
  });

  test('no element on the page is animating after load', async ({ page }) => {
    await page.goto('/entries/raycast/');
    await page.locator('[data-demo] .stage-hit').first().click();
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  });
});
