import { test, expect } from '@playwright/test';

// The guardrail computes an audit-chain integrity verdict on GET /api/audit-log and
// returned it to the cockpit proxy, but NO UI surface called it. The Activity page showed
// individual hash/prevHash values in its detail dialog while the service's own verdict was
// never displayed. These lock in that it is now surfaced, and that it fails honestly.

test('the activity page surfaces the guardrail-computed audit chain verdict', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto('/activity', { waitUntil: 'networkidle' });

  const heading = page.getByRole('heading', { name: 'Audit chain integrity' });
  await expect(heading).toBeVisible();

  // The verdict is the service's, not a locally invented string.
  const panel = page.locator('section', { has: heading });
  await expect(panel.getByText(/Chain verified|Chain state:/)).toBeVisible();

  // "Re-verify chain" must perform a real request, not reload the page.
  const before = await page.evaluate(() => performance.getEntriesByType('resource').length);
  await panel.getByRole('button', { name: 'Re-verify chain' }).click();
  await expect(panel.getByText(/Chain verified|Chain state:/)).toBeVisible();
  const after = await page.evaluate(() => performance.getEntriesByType('resource').length);
  expect(after, 're-verify should issue a real request').toBeGreaterThan(before);

  expect(failures).toEqual([]);
});

test('the audit chain verdict never renders as healthy when the log cannot be read', async ({ page }) => {
  await page.route('**/api/audit-log', route => route.abort('failed'));
  await page.goto('/activity', { waitUntil: 'domcontentloaded' });
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Audit chain integrity' }) });
  await expect(panel.getByRole('alert')).toBeVisible();
  // It must not claim the chain is verified while it is unknown.
  await expect(panel.getByText(/Chain verified/)).toHaveCount(0);
});