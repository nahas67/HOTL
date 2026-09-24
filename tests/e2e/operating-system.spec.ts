import { test, expect } from '@playwright/test';

const headers = { 'x-hotl-internal-token': 'hotl-local-development-token' };

test('Constitution versions preserve owner edits and expose all twenty domains', async ({ page, context, request }) => {
  await page.goto('/autonomy');
  await expect(page.getByLabel('Workspace name')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/autonomy');
  await expect(other.getByLabel('Workspace name')).toBeVisible();
  const initial = (await (await request.get('http://127.0.0.1:4100/api/constitution', { headers })).json()).constitution;
  await page.getByLabel('Workspace name').fill('Commerce OS browser drill');
  await page.getByLabel('Reason for this change').fill('Verify versioned business identity');
  await page.getByRole('button', { name: 'Save constitution' }).click();
  await expect(page.getByRole('status').filter({ hasText: /saved/i })).toBeVisible();
  await expect(page).toHaveTitle(/Commerce OS browser drill/);
  await other.getByLabel('Workspace name').fill('Stale browser must not overwrite');
  await other.getByLabel('Reason for this change').fill('Verify stale policy conflict');
  await other.getByRole('button', { name: 'Save constitution' }).click();
  await expect(other.locator('.os-error[role="alert"]')).toContainText(/changed|version|conflict/i);
  const saved = (await (await request.get('http://127.0.0.1:4100/api/constitution', { headers })).json()).constitution;
  expect(saved.projectName).toBe('Commerce OS browser drill');
  expect(saved.version).toBe(initial.version + 1);
  await page.getByRole('tab', { name: 'Autonomy modes' }).click();
  await expect(page.locator('.os-domain-row')).toHaveCount(20);
  await page.getByRole('button', { name: /^Custom / }).click();
  await page.getByRole('combobox', { name: 'Sourcing mode', exact: true }).selectOption('MANUAL');
  await expect(page.getByRole('combobox', { name: 'Sourcing mode', exact: true })).toHaveValue('MANUAL');
  // Restore only fields this drill changed, using the current version.
  const restored = await request.patch('http://127.0.0.1:4100/api/guardrails/v1/constitution', {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { expectedVersion: saved.version, projectName: initial.projectName, reason: 'Restore workspace name after isolated browser drill' },
  });
  expect(restored.ok()).toBe(true);
  await other.close();
});

test('manual product edit preserves a newer owner update and records a successful edit', async ({ page, request }) => {
  await page.goto('/products');
  await page.getByText('Luma portable lamp', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Edit product', exact: true }).click();
  await expect(page.getByLabel('Available inventory')).toBeVisible();
  const products = (await (await request.get('http://127.0.0.1:4100/api/products', { headers })).json()).products;
  const product = products.find((value: { id: string }) => value.id === 'prod-01');
  const constitution = (await (await request.get('http://127.0.0.1:4100/api/constitution', { headers })).json()).constitution;
  const concurrent = await request.post('http://127.0.0.1:4100/api/guardrails/v1/products/prod-01/update', {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { expectedConstitutionVersion: constitution.version, expectedRevision: product.revision, inventory: product.inventory + 1, reason: 'Concurrent owner inventory correction' },
  });
  expect(concurrent.ok()).toBe(true);
  await page.getByLabel('Available inventory').fill(String(product.inventory + 5));
  await page.getByLabel('Reason for change', { exact: true }).fill('Stale product inventory correction');
  await page.getByRole('button', { name: 'Save product changes' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(/changed|revision|version|conflict/i);
  await expect(page.getByLabel('Available inventory')).toHaveValue(String(product.inventory + 5));
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.reload();
  await page.getByText('Luma portable lamp', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Edit product', exact: true }).click();
  await page.getByLabel('Available inventory').fill(String(product.inventory));
  await page.getByLabel('Reason for change', { exact: true }).fill('Reviewed latest inventory and restored count');
  await page.getByRole('button', { name: 'Save product changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const final = (await (await request.get('http://127.0.0.1:4100/api/products', { headers })).json()).products.find((value: { id: string }) => value.id === product.id);
  expect(final.inventory).toBe(product.inventory);
  expect(final.revision).toBe(product.revision + 2);
});

test('connection setup rejects an unsafe host and never invents connection health', async ({ page, request }) => {
  await page.goto('/integrations');
  await expect(page.getByText('These credential-based connectors stay read only.', { exact: false })).toBeVisible();
  const shopify = page.getByRole('region', { name: 'Shopify staging commerce' });
  await expect(shopify).toBeVisible();
  await expect(shopify.getByText('Shopify installation is not configured on the server.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  await page.getByLabel('Connection name').fill('Rejected local address');
  await page.getByLabel('Shop domain').fill('127.0.0.1');
  await page.getByLabel('Admin API access token').fill('invalid-browser-drill-token');
  await page.getByRole('button', { name: 'Save credentials' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const data = await (await request.get('http://127.0.0.1:4100/api/integrations', { headers })).json();
  expect(data.connections).toHaveLength(0);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('invalid-browser-drill-token');
});

test('finance exposes missing costs honestly and new controls fit mobile dark mode', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/finance');
  await expect(page.getByRole('heading', { name: 'Know what your business earns.' })).toBeVisible();
  await expect(page.getByText('Net operating profit', { exact: true })).toBeVisible();
  await expect(page.getByText('Unavailable', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Finance period').selectOption('all');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/finance', '/integrations', '/autonomy']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
