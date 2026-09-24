import { test, expect } from '@playwright/test';

test('an expired proposal replans from the cockpit without approving its old action', async ({ page, request }) => {
  const headers = { 'x-hotl-internal-token': 'hotl-local-development-token' };
  const policyUrl = 'http://127.0.0.1:4100/api/constitution';
  const writePolicy = async (mode: string) => {
    const current = (await (await request.get(policyUrl, { headers })).json()).constitution;
    const response = await request.patch('http://127.0.0.1:4100/api/guardrails/v1/constitution', {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { expectedVersion: current.version, mode, reason: 'Isolated browser recovery drill' },
    });
    expect(response.ok()).toBe(true);
  };
  const original = (await (await request.get(policyUrl, { headers })).json()).constitution;
  await writePolicy('COPILOT');
  try {
    const started = await request.post('http://127.0.0.1:4300/api/runs', {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { cycle: 'daily' },
    });
    expect(started.status()).toBe(201);
    const run = await started.json();
    expect(run.status).toBe('interrupted');
    await writePolicy('MANUAL');
    await page.goto('/approvals');
    await page.getByRole('button', { name: 'View expired proposals' }).click();
    const card = page.locator('.full-approval').filter({ hasText: run.runId.slice(0, 8) });
    const replan = card.getByRole('button', { name: 'Replan run', exact: true });
    await expect(replan).toBeEnabled();
    const response = page.waitForResponse(response => response.url().endsWith(`/runs/${run.runId}/resume`) && response.request().method() === 'POST');
    await replan.click();
    const resumed = await response;
    expect(resumed.ok()).toBe(true);
    expect((await resumed.json()).status).toBe('completed');
    await expect(card.getByRole('status').filter({ hasText: /Run completed/ })).toBeVisible();
    const approvals = (await (await request.get('http://127.0.0.1:4100/api/interrupts', { headers })).json()).interrupts;
    expect(approvals.find((item: { id: string }) => item.id === run.interruptId).status).toBe('expired');
  } finally {
    await writePolicy(original.mode);
  }
});
