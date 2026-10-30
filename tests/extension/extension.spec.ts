import { expect, test } from './fixtures';

test('reads declared motion at rest and draws the print', async ({ panel }) => {
  await expect(panel.locator('h1')).toHaveText('127.0.0.1');
  await expect(panel.locator('.tier')).not.toHaveCount(0);
  const values = await panel.locator('.tier-value').allTextContents();
  expect(values).toContain('cubic-bezier(0.16, 1, 0.3, 1)');
  expect(values).toContain('cubic-bezier(0.2, 0.7, 0.2, 1)');
  // The menu's ease-in reads as an exit; the infinite spinner as a loop.
  const names = await panel.locator('.tier-name').allTextContents();
  expect(names).toEqual(expect.arrayContaining(['exit', 'loop']));
  await expect(panel.locator('#print svg path[data-tier]')).not.toHaveCount(0);
});

test('catches live WAAPI and fits JS-driven motion from its frames', async ({ panel, site }) => {
  await expect(panel.locator('.tier')).not.toHaveCount(0);
  await site.bringToFront();
  await site.evaluate(() => {
    (window as unknown as { runWaapi(): void }).runWaapi();
    (window as unknown as { runJs(): void }).runJs();
  });
  await site.waitForTimeout(1200);
  await panel.bringToFront();
  await expect(panel.locator('.tier-value', { hasText: 'cubic-bezier(0.34, 1.56, 0.64, 1)' })).toHaveCount(1);
  const fitted = panel.locator('.tier', { has: panel.locator('.fit') });
  await expect(fitted).toHaveCount(1);
  await expect(fitted.locator('.tier-dur')).toHaveText(/^(4[89]\d|5[01]\d)ms$/);
  await expect(panel.locator('.honest')).toContainText('fitted from their frames');
});

test('copies every format and the CSS carries exact values', async ({ panel }) => {
  await expect(panel.locator('#code')).toContainText('--ease-move: cubic-bezier(0.16, 1, 0.3, 1);');
  await expect(panel.locator('#code')).toContainText('--duration-move: 600ms;');
  for (const label of ['Tailwind 4', 'Tailwind 3', 'Motion', 'SwiftUI']) {
    await panel.getByRole('button', { name: label, exact: true }).click();
    await expect(panel.locator('#code')).toContainText('127.0.0.1');
  }
  await panel.getByRole('button', { name: 'Motion', exact: true }).click();
  await expect(panel.locator('#code')).toContainText('ease: [0.16, 1, 0.3, 1]');
});

test('demos run on the tier timing and scrub together', async ({ panel }) => {
  await expect(panel.locator('.tier')).not.toHaveCount(0);
  const timing = await panel.evaluate(() =>
    [...document.querySelectorAll('.tier')].map((row) => {
      const a = row.querySelector('[data-part]')!.getAnimations()[0]!;
      return { easing: (a.effect as KeyframeEffect).getTiming().easing, value: row.querySelector('.tier-value')!.textContent };
    }),
  );
  for (const t of timing) if (!t.value!.startsWith('linear(')) expect(t.easing).toBe(t.value);
  await panel.locator('#scrub').fill('300');
  const times = await panel.evaluate(() => [...document.querySelectorAll('.tier [data-part]')].map((el) => Number(el.getAnimations()[0]!.currentTime)));
  for (const t of times) expect(t).toBeLessThanOrEqual(300);
  expect(Math.max(...times)).toBe(300);
});

test('show outlines the elements on the page', async ({ panel, site }) => {
  const row = panel.locator('.tier', { has: panel.locator('.tier-value', { hasText: 'cubic-bezier(0.16, 1, 0.3, 1)' }) });
  await row.getByRole('button', { name: 'Show' }).click();
  await expect(row.getByRole('button')).toHaveText('2 shown');
  expect(await site.evaluate(() => Boolean(document.getElementById('__easeprint-hl')))).toBe(true);
});

test('honest notes come from the page', async ({ panel }) => {
  await expect(panel.locator('.honest')).toContainText('Checks for reduced motion: 1 CSS rule');
  await expect(panel.locator('.honest')).toContainText('Record from load');
});
