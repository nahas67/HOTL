import { test, expect } from '@playwright/test';

// Responsive regression coverage.
//
// The original cockpit check only covered /finance, /integrations and /autonomy at
// 390px, so a route nobody measured could break unnoticed -- and two did.
//
// Measurement note: this MUST use `waitUntil: 'networkidle'`. With
// `domcontentloaded` the viewport is measured before hydration renders the page and
// every route reported exactly its viewport width, producing a false pass. That false
// pass is how the defect below survived two rounds of work.

// `/settings` was missing from this sweep. It is the largest surface in the app (a
// two-column settings layout with its own `.ds-settings` grid) and the only route with a
// dedicated layout system, so it is the most likely place for a new overflow to appear
// and the least likely to be noticed.
const ROUTES = ['/', '/agents', '/approvals', '/products', '/orders', '/finance', '/integrations', '/autonomy', '/guardrails', '/activity', '/settings'];

// KNOWN DEFECT, measured 2026-09-09 with `networkidle`:
//   360px /products  document.scrollWidth = 671   viewport = 360
//   360px /orders    document.scrollWidth = 587   viewport = 360
//   390px /products  document.scrollWidth = 677   viewport = 390
//   390px /orders    document.scrollWidth = 593   viewport = 390
// `body.scrollWidth` stays at the viewport on both, so the overflow escapes the body.
// Adding `max-width`/`min-width` to `.table-scroll` changed nothing and was reverted
// rather than left in as cargo cult; the cause is still unidentified.
//
// These two are excluded so the suite stays green while the defect stays visible and
// tracked. THE FIX IS TO DELETE A ROUTE FROM THIS LIST: the sweep then fails on it
// immediately until the overflow is genuinely resolved.
const KNOWN_DEFECT_ROUTES: string[] = [];

test.describe('no horizontal overflow on any cockpit route', () => {
  for (const width of [360, 390]) {
    test(`no route overflows at ${width}px`, async ({ page }) => {
      const offenders: string[] = [];
      for (const route of ROUTES.filter(item => !KNOWN_DEFECT_ROUTES.includes(item))) {
        await page.setViewportSize({ width, height: 780 });
        await page.goto(route, { waitUntil: 'networkidle' });
        const measured = await page.evaluate(() => ({
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
          viewport: window.innerWidth,
        }));
        if (measured.document > measured.viewport || measured.body > measured.viewport) {
          offenders.push(`${route} document=${measured.document} body=${measured.body} viewport=${measured.viewport}`);
        }
      }
      expect(offenders, `routes wider than the viewport: ${offenders.join('; ')}`).toEqual([]);
    });
  }
});