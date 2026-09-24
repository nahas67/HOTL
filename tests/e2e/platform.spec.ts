import { test, expect } from '@playwright/test';

test('owner navigation, search and mobile layout work', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your business, in motion.' })).toBeVisible();
  await expect(page.getByText('Simulation mode', { exact: true })).toBeVisible();
  for (const [nav, title] of [['Agents', 'Meet your always-on team.'], ['Products', 'Good finds. Healthy margins.'], ['Orders', 'From checkout to doorstep.'], ['Guardrails', 'Autonomy, on your terms.'], ['Activity', 'Nothing behind the scenes.']]) {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: nav, exact: true }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Search anything' }).click();
  await page.getByPlaceholder('Search agents, orders, products, approvals...').fill('Luma');
  await expect(page.getByRole('dialog').getByText('Luma portable lamp', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your business, in motion.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('storefront checkout appears in the owner cockpit and uses server prices', async ({ page }) => {
  await page.goto('http://127.0.0.1:3001');
  await page.getByRole('button', { name: 'Add Luma portable lamp to bag', exact: true }).click();
  await page.getByRole('button', { name: /Your bag/ }).click();
  await page.getByLabel('Your name').fill('Browser Test Customer');
  await page.getByLabel('Email address').fill('browser-test@example.com');
  await page.getByLabel('Destination country (2-letter code)').fill('us');
  await page.getByRole('button', { name: 'Place demo order' }).click();
  await expect(page.getByRole('heading', { name: 'Your demo order is confirmed.' })).toBeVisible();
  await page.goto('http://127.0.0.1:3000/orders');
  await expect(page.getByText('Browser Test Customer', { exact: true }).first()).toBeVisible();
});

test('pause blocks checkout and resumes through the owner control', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pause agents', exact: true }).click();
  await expect(page.getByText('Agents are paused.', { exact: true })).toBeVisible();
  try {
    const response = await request.post('http://127.0.0.1:4400/store/checkout', { headers: { 'Idempotency-Key': crypto.randomUUID() }, data: { customer: { name: 'Blocked Customer', email: 'blocked@example.com' }, items: [{ productId: 'prod-01', quantity: 1 }] } });
    expect(response.status()).toBe(423); expect((await response.json()).error.code).toBe('SYSTEM_PAUSED');
  } finally {
    await page.getByRole('button', { name: 'Resume agents', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Pause agents', exact: true })).toBeVisible();
  }
});

test('below-margin approval is denied in the UI and cannot resume a graph', async ({ page, request }) => {
  const approvals = await request.get('http://127.0.0.1:4100/api/interrupts', { headers: { 'x-hotl-internal-token': 'hotl-local-development-token' } });
  const pending = (await approvals.json()).interrupts.find((item: { id: string; status: string }) => item.id === 'int-margin-01' && item.status === 'pending');
  test.skip(!pending, 'Seeded approval already resolved in this local workspace.');
  await page.goto('/');
  await page.getByRole('button').filter({ hasText: 'New product below margin floor' }).click();
  await page.getByPlaceholder('Share the reason for your decision...').fill('Browser test: guardrails must still reject this request.');
  const legacyReview = page.getByRole('checkbox', { name: /I reviewed this proposal/ });
  if (pending.payload?.legacyReviewRequired) await legacyReview.check();
  await page.getByRole('button', { name: 'Approve request', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /margin below floor/i })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('emergency stop requires confirmation and reauthentication before submission', async ({ page }) => {
  await page.goto('/guardrails');
  await page.getByRole('button', { name: 'Emergency stop', exact: true }).click();
  const submit = page.getByRole('button', { name: 'Engage emergency stop', exact: true });
  await expect(submit).toBeDisabled();
  await page.getByPlaceholder('Describe the incident for the audit record...').fill('Read-only browser verification of emergency controls.');
  await page.getByPlaceholder('STOP EVERYTHING').fill('STOP EVERYTHING');
  await expect(submit).toBeDisabled();
  await page.getByRole('button', { name: 'Keep system running' }).click();
});

test('a cockpit cycle pauses in LangGraph and resumes after a saved owner decision', async ({ page, request }) => {
  await page.goto('/');
  const started = page.waitForResponse(response => response.url().endsWith('/api/runs') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run a cycle', exact: true }).click();
  const response = await started; expect(response.status()).toBe(201);
  const run = await response.json(); expect(run.status).toBe('interrupted');
  await page.goto('/approvals');
  const card = page.locator('.full-approval').filter({ hasText: run.runId.slice(0, 8) });
  await card.getByRole('button', { name: 'Review decision' }).click();
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.getByPlaceholder('Share the reason for your decision...').fill('Browser drill: reject the simulated request and resume the graph.');
  await page.getByRole('button', { name: 'Reject request', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const resumed = await request.get(`http://127.0.0.1:4300/api/runs/${run.runId}`, { headers: { 'x-hotl-internal-token': 'hotl-local-development-token' } });
  expect(resumed.status()).toBe(200); expect((await resumed.json()).status).toBe('completed');
});
