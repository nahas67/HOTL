import { test, expect } from '@playwright/test';

// B-4 regression: an unknown cockpit path previously rendered Overview with a 200,
// making `/nonexistent` and a deliberate `/overview` indistinguishable to the owner.
// A route that does not exist must say so.

test.describe('unknown cockpit routes are refused honestly', () => {
  test('an unknown section answers 404 instead of rendering Overview', async ({ page }) => {
    const response = await page.goto('/definitely-not-a-cockpit-screen');
    expect(response?.status(), 'an unknown route must not report success').toBe(404);

    // The honest failure must not look like the Overview screen.
    await expect(page.getByRole('heading', { name: /overview/i })).toHaveCount(0);
  });

  test('a deeper path than one segment is not a cockpit screen', async ({ page }) => {
    // The catch-all would otherwise render Overview for `/overview/anything`.
    const response = await page.goto('/overview/not-a-sub-page');
    expect(response?.status()).toBe(404);
  });

  test('every real section still renders', async ({ page }) => {
    const sections = [
      'overview', 'agents', 'approvals', 'products', 'orders',
      'finance', 'integrations', 'autonomy', 'guardrails', 'activity', 'settings',
    ];
    const offenders: string[] = [];
    for (const section of sections) {
      const response = await page.goto(`/${section}`);
      if (response?.status() !== 200) offenders.push(`${section} -> ${response?.status()}`);
    }
    // The guard is derived from the navigation, so adding a screen must not require
    // editing this list. A screen that stopped routing is the defect this catches.
    expect(offenders, `sections stopped routing:\n${offenders.join('\n')}`).toEqual([]);
  });
});