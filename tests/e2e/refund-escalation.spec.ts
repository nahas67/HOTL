import { test, expect } from '@playwright/test';

// Owner refund escalation must report what actually happened.
//
// The guardrail emits `decision: "escalated"` (apps/guardrail-service/src/engine.ts:589,
// 596, 658) when a refund exceeds the automatic threshold. The cockpit compared
// `result.decision` against "escalate" and "interrupt" -- neither of which the service
// ever produces -- so the escalation branch was unreachable and every escrow escalation
// reported "Refund evaluation recorded. Review the order and audit trail for its outcome."
//
// That is materially wrong on a financial surface: nothing had been paid, the money was
// held in escrow, and a second owner decision was still outstanding. This locks the
// honest message in, and locks the success path so the fix cannot swallow it.

async function evaluateRefund(page: import('@playwright/test').Page, orderId: string, amount: string, reason: string) {
  await page.goto('/orders', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(orderId) }).first().click();
  await page.getByRole('button', { name: 'Request refund' }).click();
  await page.getByLabel(/Refund amount/).fill(amount);
  await page.getByLabel(/Refund reason/).fill(reason);

  // Toasts auto-dismiss. Observe the DOM so the assertion cannot race the timer.
  await page.evaluate(() => {
    const w = window as unknown as { __toasts: string[] };
    w.__toasts = [];
    new MutationObserver(muts => {
      for (const m of muts)
        for (const n of m.addedNodes)
          if (n.nodeType === 1) {
            const t = (n as HTMLElement).innerText?.trim();
            if (t) w.__toasts.push(t);
          }
    }).observe(document.body, { childList: true, subtree: true });
  });

  await page.getByRole('button', { name: 'Evaluate refund' }).click();
  await page.waitForTimeout(2500);
  return page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts);
}

test('a refund above the automatic threshold reports that it was not paid', async ({ page }) => {
  // $25 is the configured automatic refund threshold; $50 must escalate to escrow.
  const toasts = await evaluateRefund(page, 'ORD-1030', '50', 'Escalation honesty regression check.');

  expect(toasts.join(' | ')).toContain('Refund not paid');
  expect(toasts.join(' | ')).toContain('waiting in Approvals');
  // The old, incorrect message must never be shown for an escalation.
  expect(toasts.join(' | ')).not.toContain('Refund evaluation recorded');
});

test('a refund inside the automatic threshold is not reported as an escalation', async ({ page }) => {
  const toasts = await evaluateRefund(page, 'ORD-1031', '15', 'Below-threshold auto refund regression check.');
  const text = toasts.join(' | ');

  expect(text).not.toContain('Refund not paid');
  expect(text).not.toContain('held in escrow');
});

test('the refund amount cannot exceed the unrefunded remainder of the order', async ({ page }) => {
  await page.goto('/orders', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /ORD-1033/ }).first().click();
  await page.getByRole('button', { name: 'Request refund' }).click();

  const amount = page.getByLabel(/Refund amount/);
  // ORD-1033 totals $83.00, so the ceiling is the order total, never a larger constant.
  await expect(amount).toHaveAttribute('max', '83');
  await expect(amount).toHaveAttribute('min', '0.01');
});
