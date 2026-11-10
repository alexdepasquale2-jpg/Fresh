import { test, expect } from '@playwright/test';

type Hook = { __sallow: { go: (s: string) => void } };

test('boots and navigates all five screens at 390x844', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const screen = page.locator('main.screen');
  await expect(screen).toHaveAttribute('data-screen', 'bedroom');
  await expect(page.getByText('BOX 07/25')).toBeVisible();

  await page.getByRole('button', { name: 'Open the box' }).click();
  await expect(screen).toHaveAttribute('data-screen', 'box');
  await expect(page.locator('.k-slot')).toHaveCount(25);

  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(screen).toHaveAttribute('data-screen', 'dive');
  await expect(page.getByRole('button', { name: 'HOLD' })).toBeVisible();

  await page.evaluate(() => (window as unknown as Hook).__sallow.go('system'));
  await expect(screen).toHaveAttribute('data-screen', 'system');
  await expect(page.locator('.k-tile')).toHaveCount(6);

  await page.getByRole('button', { name: 'Watch the surface' }).click();
  await expect(screen).toHaveAttribute('data-screen', 'planet');
  await expect(page.getByText('THEIR CHRONICLE')).toBeVisible();

  await page.locator('[data-id=back-sky]').click();
  await expect(screen).toHaveAttribute('data-screen', 'system');
  expect(errors).toEqual([]);
});

test('dev gallery lists every unit demo', async ({ page }) => {
  await page.goto('/dev');
  await expect(page.locator('nav button')).toHaveCount(28);
});

test('planet surface renders from the sim Worker', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.screen')).toHaveAttribute('data-screen', 'bedroom');
  await page.evaluate(() => (window as unknown as Hook).__sallow.go('planet'));
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __sallow: { ctx: { sim: { latest(): unknown } } } }).__sallow.ctx.sim.latest() !== null))
    .toBe(true);
});
