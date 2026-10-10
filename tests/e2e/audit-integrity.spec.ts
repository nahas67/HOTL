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

// B-2 regression. `.metric-context` is authored for `.metric-card`, which supplies its
// own padding (18px 19px 16px). Reused as a direct child of `.panel` -- which supplies
// none -- the verdict row rendered 1px from the card's left and bottom border while the
// heading above it was inset 23px, so the row read as clipped by the card.
//
// Measured before the fix at 1440x900: row glyph left 271 vs panel left 270 (1px inset),
// row bottom 461.8 vs panel bottom 462.8 (1px inset). `.panel` is `padding:0` with
// `overflow:hidden`, so the clipping was real, not a screenshot artefact.
//
// The assertions are on GLYPH positions (via Range), not element boxes: the element box
// legitimately spans the full content width, so measuring the box would have passed
// before the fix and failed to catch the regression.
test('the audit chain verdict row sits inside the panel, aligned with its heading', async ({ page }) => {
  // 375 and 360 are in this list because their absence is exactly what let a regression
  // through: the fix carried a `@media(max-width:380px)` rule mirroring `.main-content`'s 13px
  // while `.panel-header` kept its 18px there, putting the row 5px left of the heading it
  // aligns with -- and the first version of this sweep stopped at 390, so it reported green.
  for (const width of [1440, 1024, 760, 390, 375, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/activity', { waitUntil: 'networkidle' });

    const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Audit chain integrity' }) });
    await expect(panel.getByText(/Chain verified|Chain state:/)).toBeVisible();

    const measured = await page.evaluate(() => {
      const panel = document.querySelector('section[aria-labelledby="audit-integrity-title"]')!;
      const row = panel.querySelector('.metric-context') as HTMLElement;
      const heading = panel.querySelector('h2') as HTMLElement;
      const textLeft = (el: Element) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect().left;
      };
      const box = panel.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      const style = getComputedStyle(row);
      return {
        alignmentDelta: textLeft(row) - textLeft(heading),
        leftInset: textLeft(row) - box.left,
        bottomInset: box.bottom - (rowBox.bottom - parseFloat(style.paddingBottom)),
        panelPadding: getComputedStyle(panel).paddingTop,
      };
    });

    expect(Math.abs(measured.alignmentDelta), `verdict row must align with the panel heading at ${width}px`).toBeLessThanOrEqual(1);
    expect(measured.leftInset, `verdict row must be inset from the panel border at ${width}px`).toBeGreaterThanOrEqual(16);
    expect(measured.bottomInset, `verdict row must be inset from the panel bottom at ${width}px`).toBeGreaterThanOrEqual(16);
    // The panel supplies no padding of its own -- the precondition for this defect.
    expect(measured.panelPadding, 'this test only means something while .panel stays un-padded').toBe('0px');
  }
});