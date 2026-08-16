import { test, expect } from '@playwright/test';
import { stubFirebase } from './firebase-stubs';

test.beforeEach(async ({ page }) => {
  await stubFirebase(page);
});

test.skip('Google sign-in and sign-out flow', async ({ page }) => {
  // Requires full Firebase environment; covered in manual tests.
  await page.goto('/');
});

test('data management accessible only from the account page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /activity/i }).click();
  await expect(page.getByText(/data management/i)).toHaveCount(0);
  // The account page's nav entry is labelled "Settings" (see layout/navigation),
  // and Data management sits inside the collapsed "Developer options" section.
  await page.getByRole('button', { name: /settings/i }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole('button', { name: /developer options/i }).click();
  await expect(page.getByRole('button', { name: /^data management$/i })).toBeVisible();
});
