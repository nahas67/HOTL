import { test, expect } from '@playwright/test';

// The Constitution tablist set aria-controls on all six tabs while only the selected panel was
// rendered, leaving five of six pointing at elements that were never in the DOM. An independent
// browser audit found this. These assert the ARIA relationship is actually valid, not merely
// present -- an attribute that points at nothing is worse than no attribute.

const tabNames = ['Strategy & goals', 'Autonomy modes', 'Financial limits', 'Markets & rules', 'Version history'];

async function auditTabs(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
    return tabs.map(tab => {
      const controls = tab.getAttribute('aria-controls');
      return {
        label: (tab.textContent ?? '').trim(),
        selected: tab.getAttribute('aria-selected') === 'true',
        controls,
        targetExists: controls ? Boolean(document.getElementById(controls)) : null,
        labelledBy: tab.id || null,
      };
    });
  });
}

test('only the selected constitution tab points at a panel that exists', async ({ page }) => {
  await page.goto('/autonomy', { waitUntil: 'networkidle' });
  const tabs = await auditTabs(page);
  expect(tabs.length).toBeGreaterThanOrEqual(5);

  for (const tab of tabs) {
    if (tab.selected) {
      expect(tab.controls, `selected tab "${tab.label}" must reference its panel`).toBeTruthy();
      expect(tab.targetExists, `selected tab "${tab.label}" points at a missing element`).toBe(true);
    } else {
      // Inactive tabs may omit aria-controls entirely, but must never point at nothing.
      expect(tab.controls, `inactive tab "${tab.label}" points at a missing element`).toBeNull();
    }
  }

  // The rendered panel is labelled back by its tab.
  const panel = page.locator('[role="tabpanel"]').first();
  await expect(panel).toBeVisible();
  const labelledBy = await panel.getAttribute('aria-labelledby');
  expect(labelledBy, 'tabpanel must be labelled by its tab').toBeTruthy();
  expect(await page.locator(`#${labelledBy}`).count()).toBe(1);
});

test('the tab relationship stays valid across every constitution tab', async ({ page }) => {
  await page.goto('/autonomy', { waitUntil: 'networkidle' });
  for (const name of tabNames) {
    const tab = page.getByRole('tab', { name });
    if ((await tab.count()) === 0) continue;
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    const tabs = await auditTabs(page);
    const selected = tabs.filter(entry => entry.selected);
    expect(selected, `"${name}" should leave exactly one selected tab`).toHaveLength(1);
    expect(selected[0].targetExists, `"${name}" panel is missing`).toBe(true);
    for (const inactive of tabs.filter(entry => !entry.selected)) {
      expect(inactive.controls, `"${name}" left "${inactive.label}" pointing at nothing`).toBeNull();
    }
  }
});