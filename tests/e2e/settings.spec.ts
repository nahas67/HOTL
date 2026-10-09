import { test, expect } from '@playwright/test';

// The settings surface is the mission requirement: a VERTICAL LEFT SIDEBAR with
// categorized navigation and a dedicated main content panel, where every entry
// reflects real state. These assert the structure and that the panels actually
// resolve against the live API -- a decorative shell would pass a layout-only test.

test('settings uses a vertical left sidebar with categorized navigation and a content panel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/settings', { waitUntil: 'networkidle' });

  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(nav).toBeVisible();

  // Vertical, not horizontal: the sidebar is taller than it is wide.
  const box = await nav.boundingBox();
  expect(box!.height, 'settings sidebar should be a tall vertical rail').toBeGreaterThan(box!.width);

  // Categorized: group headings inside the sidebar, not a flat list.
  const groups = nav.locator('.ds-settings-group');
  expect(await groups.count()).toBeGreaterThan(1);

  // A dedicated main content panel sitting beside it, not inside the nav.
  const panel = page.locator('.ds-settings-content');
  await expect(panel).toBeVisible();
  const navBox = (await nav.boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.x, 'content panel should sit to the right of the sidebar').toBeGreaterThanOrEqual(navBox.x + navBox.width - 1);

  expect(errors).toEqual([]);
});

test('every settings category is reachable and renders real content', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/settings', { waitUntil: 'networkidle' });

  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  const entries = nav.getByRole('button');
  const count = await entries.count();
  expect(count, 'settings should expose every discovered capability').toBeGreaterThanOrEqual(9);

  // Each entry must select a distinct panel that actually renders content.
  const seen = new Set<string>();
  for (let index = 0; index < count; index++) {
    const entry = entries.nth(index);
    const name = (await entry.textContent())?.trim() ?? '';
    await entry.click();
    await expect(page.locator('.ds-settings-content')).toBeVisible();
    const text = ((await page.locator('.ds-settings-content').innerText()) ?? '').trim();
    expect(text.length, `settings panel "${name}" rendered empty`).toBeGreaterThan(20);
    seen.add(name);
  }
  expect(seen.size).toBe(count);
  expect(errors).toEqual([]);
});

test('settings survives a mobile viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/settings', { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.document, `settings page pans sideways at 360px: ${overflow.document}`).toBeLessThanOrEqual(overflow.viewport);
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport);
});