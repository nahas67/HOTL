import { test, expect } from '@playwright/test';

// Keyboard and assistive-technology reachability of the owner decision modal for a refund.
//
// Why this surface: it is one of the few places where a human approves or rejects money
// leaving escrow. A keyboard trap, a missing dialog name, or a decision group whose armed
// option is not exposed programmatically stops the single human in the loop from acting
// at all -- and none of that shows up in a click-driven test.
//
// Scope: read-only. The seeded refund proposal is opened and dismissed with Escape and is
// never resolved, so this file cannot move ledger state for the specs that run after it.

const REFUND_CARD = 'Refund needs your approval';
const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex="0"]';

const trigger = (page: import('@playwright/test').Page) =>
  page.locator('.full-approval').filter({ hasText: REFUND_CARD }).getByRole('button', { name: 'Review decision' });

async function openRefundDecision(page: import('@playwright/test').Page) {
  await page.goto('/approvals', { waitUntil: 'networkidle' });
  await expect(page.locator('.full-approval').filter({ hasText: REFUND_CARD })).toBeVisible();
  await trigger(page).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('the refund decision modal is a named, focus-trapped dialog that returns focus', async ({ page }) => {
  await page.goto('/approvals', { waitUntil: 'networkidle' });
  await trigger(page).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // A modal that is only visually a modal is not announced as one.
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toHaveAccessibleName(REFUND_CARD);

  // Opening it moves focus inside, so a keyboard user is not left behind on the page.
  expect(
    await dialog.evaluate(node => node.contains(document.activeElement)),
    'focus must enter the dialog when it opens',
  ).toBe(true);

  const first = dialog.locator(FOCUSABLE).first();
  const last = dialog.locator(FOCUSABLE).last();
  await expect(first).toHaveAccessibleName('Close dialog');
  await expect(dialog.getByLabel(/Decision note/)).toBeVisible();

  // Tab from the last control wraps to the first and Shift+Tab from the first wraps to the
  // last. Without both halves the user can walk out of a financial dialog mid-decision.
  await last.focus();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();

  // Escape closes and hands focus back to the control that opened it.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
});

test('the armed decision is exposed programmatically, not only by colour', async ({ page }) => {
  const dialog = await openRefundDecision(page);
  const group = dialog.getByRole('group', { name: 'Your decision' });
  await expect(group).toBeVisible();

  const options = group.getByRole('button');
  await expect(options).toHaveCount(3);
  await expect(options.nth(0), 'Approve').toHaveAttribute('aria-pressed', 'true');
  await expect(options.nth(1), 'Reject').toHaveAttribute('aria-pressed', 'false');
  await expect(options.nth(2), 'Modify').toHaveAttribute('aria-pressed', 'false');

  // Switching with the keyboard alone must re-arm exactly one option.
  await options.nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(options.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(options.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await expect(options.nth(2)).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('Escape');
});

test('the refund decision modal stays usable at a phone width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const dialog = await openRefundDecision(page);

  expect(
    await dialog.evaluate(node => {
      const box = node.getBoundingClientRect();
      return box.left >= -0.5 && box.right <= window.innerWidth + 0.5;
    }),
    'the modal must not spill outside a 360px viewport',
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'opening the modal must not create a horizontal scrollbar',
  ).toBe(true);

  // Every decision control must be a real touch target, not a hairline strip.
  for (const control of await dialog.getByRole('group', { name: 'Your decision' }).getByRole('button').all()) {
    expect((await control.boundingBox())!.height, 'decision option touch target').toBeGreaterThanOrEqual(44);
  }
  for (const control of await dialog.locator('.modal-footer').getByRole('button').all()) {
    expect((await control.boundingBox())!.height, 'modal footer touch target').toBeGreaterThanOrEqual(40);
  }

  await page.keyboard.press('Escape');
});
