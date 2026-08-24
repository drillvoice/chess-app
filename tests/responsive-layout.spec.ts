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

/**
 * Regression: the modal body never actually scrolled.
 *
 * `.mobile-modal` puts `max-height` + `overflow: hidden` on shadcn's DialogContent,
 * which is `display: grid` — and grid auto rows size to max-content, so the max-height
 * never shrank the form. The `overflow-y-auto` body therefore had nothing to scroll and
 * the tail of the form was silently clipped, while the `position: sticky` footer (which
 * had no scrolling ancestor) stuck to the viewport and painted over what was left.
 *
 * The user-visible symptom was the "+ Add" mistake-tag input opening below the fold with
 * no way to reach it. jsdom does no layout, so only a real browser can catch this.
 */
test('log game modal scrolls to the add-tag input when the vocabulary is long', async ({
  page,
}) => {
  // Deliberately short, so the form is guaranteed to exceed the modal's max-height.
  await page.setViewportSize({ width: 412, height: 640 });
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('button', { name: 'Log game' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log game' });
  await expect(dialog).toBeVisible();

  const tagInput = dialog.getByPlaceholder('e.g. hung a piece');

  const openAddInput = async () => {
    // The dashed trigger is unmounted while the input row is open, so this only ever
    // matches the trigger; the submit button below is matched separately.
    await dialog
      .getByRole('button', { name: /^(Add|Add first tag)$/ })
      .first()
      .click();
    await expect(tagInput).toBeVisible();
  };

  // Reproduce the reported state: several tags already saved.
  const tags = [
    'Alignment pin',
    'Checks',
    'Discovered attack',
    'Missed an attack threat',
    'Passed pawn',
    'Skewer',
  ];
  for (const tag of tags) {
    await openAddInput();
    await tagInput.fill(tag);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog.getByText(tag, { exact: true })).toBeVisible();
  }

  // Now the case that broke: open the input with a full vocabulary in place.
  await openAddInput();

  const metrics = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const body = dialog.querySelector('form > div') as HTMLElement;
    const footer = dialog.querySelector('form > div:last-child') as HTMLElement;
    const input = document.querySelector('input[placeholder="e.g. hung a piece"]') as HTMLElement;

    const dialogRect = dialog.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();

    return {
      bodyScrolls: body.scrollHeight > body.clientHeight,
      dialogOverflowPx: dialog.scrollHeight - dialog.clientHeight,
      // The clipped edge, not the border box: `overflow: hidden` cuts at clientHeight.
      inputWithinDialog:
        inputRect.top >= dialogRect.top - 1 &&
        inputRect.bottom <= dialogRect.top + dialog.clientHeight + 1,
      footerOverlapsBody: footerRect.top < bodyRect.bottom - 1,
    };
  });

  // Without the fix the body grows to fit its content instead of scrolling.
  expect(metrics.bodyScrolls).toBe(true);
  // ...and the excess is clipped by `overflow: hidden` with no way to reach it.
  expect(metrics.dialogOverflowPx).toBe(0);
  expect(metrics.inputWithinDialog).toBe(true);
  expect(metrics.footerOverlapsBody).toBe(false);
});
