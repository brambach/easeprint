import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = ['/', '/entries/cuberto/', '/entries/stripe/', '/compare/', '/convention/', '/method/'];

test.describe('accessibility', () => {
  for (const path of PAGES) {
    test(`${path} has no serious or critical axe violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    });
  }
});

test.describe('index', () => {
  test('lists 20 entries and filters by posture', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('.card');
    await expect(cards).toHaveCount(20);
    await page.getByRole('button', { name: /^spatial/i }).click();
    const visible = page.locator('.card:not([hidden])');
    const n = await visible.count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(20);
    for (const posture of await visible.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.posture))) {
      expect(posture).toBe('spatial');
    }
    await expect(page.locator('[data-filter-status]')).toContainText(`Showing ${n} spatial`);
    expect(page.url()).toContain('posture=spatial');
    await page.getByRole('button', { name: /^all/i }).click();
    await expect(page.locator('.card:not([hidden])')).toHaveCount(20);
  });
});

test.describe('compare', () => {
  test('overlays two chosen curves and copies B exactly', async ({ page, context, browserName }) => {
    await page.goto('/compare/?a=raycast:0&b=paco:0');
    await expect(page.locator('[data-tf="a"]')).toHaveText('cubic-bezier(0.165, 0.84, 0.44, 1)');
    await expect(page.locator('[data-tf="b"]')).toHaveText('ease');
    await expect(page.locator('[data-curve="a"]')).toHaveAttribute('d', /^M/);
    await page.locator('[data-pick="b"]').selectOption('vaul:0');
    await expect(page.locator('[data-tf="b"]')).toHaveText('cubic-bezier(0.32, 0.72, 0, 1)');
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      // Vaul's statement is a keyframe animation, so B copies animation timing.
      await expect(page.locator('[data-copy-side="b"]')).toHaveText('Copy animation timing');
      await page.locator('[data-copy-side="b"]').click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('animation-duration: 0.5s;\nanimation-timing-function: cubic-bezier(0.32, 0.72, 0, 1);');
      await page.locator('[data-copy-side="a"]').click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('transition: transform 2s cubic-bezier(0.165, 0.84, 0.44, 1);');
    }
  });

  test('plays both on one clock', async ({ page }) => {
    await page.goto('/compare/');
    await page.getByRole('button', { name: 'Play both' }).click();
    const durations = await page.locator('[data-puck]').evaluateAll((els) => els.map((e) => e.getAnimations()[0]?.effect?.getTiming().duration));
    expect(durations).toEqual([1200, 1000]);
  });
});

test.describe('reduced motion, whole site', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const path of ['/', '/entries/cuberto/', '/compare/', '/convention/']) {
    test(`${path}: nothing is animating, before or after pressing play`, async ({ page }) => {
      await page.goto(path);
      const play = page.locator('[data-play], [data-play-both]').first();
      if (await play.count()) await play.click();
      const running = await page.evaluate(() =>
        document.getAnimations().filter((a) => a.playState === 'running' && Number(a.effect?.getComputedTiming().duration) > 0),
      );
      expect(running.length).toBe(0);
    });
  }

  test('compare demos jump instead of moving', async ({ page }) => {
    await page.goto('/compare/');
    await page.getByRole('button', { name: 'Play both' }).click();
    expect(await page.locator('[data-puck="a"]').evaluate((el) => el.getAnimations().length)).toBe(0);
    await expect(page.locator('[data-status]')).toContainText('Reduced motion is on');
  });
});

test.describe('accessibility, dark', () => {
  test.use({ colorScheme: 'dark' });
  for (const path of ['/', '/entries/raycast/', '/convention/', '/compare/']) {
    test(`${path} has no serious or critical axe violations in dark mode`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    });
  }
});
