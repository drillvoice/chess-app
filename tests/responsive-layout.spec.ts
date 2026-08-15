import { test, expect } from '@playwright/test';
import { stubFirebase } from './firebase-stubs';

test.beforeEach(async ({ page }) => {
  await stubFirebase(page);
});

const viewports = [
  { name: 'pixel-10', width: 412, height: 915 },
  { name: 'narrow-fallback', width: 360, height: 800 },
];

for (const viewport of viewports) {
  test(`responsive home and modal fit (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: 'Log game' })).toBeVisible();

    const pageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(pageOverflows).toBeFalsy();

    await page.getByRole('button', { name: 'Activity' }).click();
    await expect(page).toHaveURL(/\/activity$/);

    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole('button', { name: 'Log game' }).click();
    const dialog = page.getByRole('dialog', { name: 'Log game' });
    await expect(dialog).toBeVisible();

    await expect(page.getByRole('button', { name: 'Classical' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Over the Board' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width + 1);

    const modalPageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(modalPageOverflows).toBeFalsy();
  });
}
