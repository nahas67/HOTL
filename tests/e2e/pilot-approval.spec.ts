import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

/**
 * The pilot approval path, through the real cockpit UI.
 *
 * CP-03B proved the gate HOLDS in the browser (Approve stayed disabled at 38 -> 42 -> 7 -> 6 gaps).
 * That is only the negative path. This spec drives the same screen to a genuinely gap-free
 * 35-input draft, saves it, and approves it -- so the "authorised" half of this feature is
 * executed in the browser at least once, not only in the deterministic guardrail test
 * (`apps/guardrail-service/test/pilot-approval.test.ts`, which is where the authorisation
 * guarantees are actually proven).
 *
 * Scope of the claim: this confirms the UI reaches and renders the real `allow` and that the
 * guardrail persisted matching authority. It does NOT weaken the unit test to make this easier,
 * and it is not a substitute for it -- a browser test can only see what the screen chooses to
 * show. The digest binding, replay protection and denial paths are proven deterministically.
 *
 * This runs against the labelled local simulation stack. The owner identity and every business
 * value below are test fixtures; nothing here carries external authority.
 */

const GUARDRAIL = 'http://127.0.0.1:4100';
const HEADERS = { 'x-hotl-internal-token': 'hotl-local-development-token' };
const FORMULA = 'HOTL-PILOT-UNIT-ECONOMICS-v1';
const OWNER_EVIDENCE = 'Owner pilot worksheet, signed review';
const CONTRACT_EVIDENCE = 'Supplier contract and rate card';

// The guardrail's canonicalisation, replicated so the recorded digest is checked against an
// independent computation rather than against the UI's own copy of the value.
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, item) => (item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item));
const digest = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');

type Datum = { section: 'profile' | 'economics' | 'capital'; key: string; value: string; provenance: string; evidence: string };

// A complete, gap-free draft. The three derived figures are the HOTL-PILOT-UNIT-ECONOMICS-v1
// results for the costs below, so the cockpit's own calculation check agrees with them.
const FIELDS: Datum[] = [
  { section: 'profile', key: 'country', value: 'US', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'profile', key: 'salesChannel', value: 'SHOPIFY_DEVELOPMENT_STORE', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'profile', key: 'customerProfile', value: 'Development store test customer', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'profile', key: 'productCategory', value: 'Home', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'profile', key: 'supplierModel', value: 'Contracted supplier', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'profile', key: 'fulfillmentModel', value: 'Merchant fulfilled', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'profile', key: 'currency', value: 'USD', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'profile', key: 'returnModel', value: 'Owner managed returns', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'profile', key: 'expectedOrderValue', value: '100', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'profile', key: 'initialSalesTarget', value: '1000', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },

  { section: 'economics', key: 'supplierProductCost', value: '30', provenance: 'CONTRACTUAL', evidence: CONTRACT_EVIDENCE },
  { section: 'economics', key: 'inboundFreight', value: '2', provenance: 'CONTRACTUAL', evidence: CONTRACT_EVIDENCE },
  { section: 'economics', key: 'outboundShipping', value: '4', provenance: 'CONTRACTUAL', evidence: CONTRACT_EVIDENCE },
  { section: 'economics', key: 'packaging', value: '1', provenance: 'CONTRACTUAL', evidence: CONTRACT_EVIDENCE },
  { section: 'economics', key: 'storeFees', value: '2', provenance: 'CONTRACTUAL', evidence: CONTRACT_EVIDENCE },
  { section: 'economics', key: 'paymentFees', value: '3', provenance: 'CONTRACTUAL', evidence: CONTRACT_EVIDENCE },
  { section: 'economics', key: 'advertisingAcquisition', value: '5', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'economics', key: 'refundAllowance', value: '2', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'economics', key: 'returnAllowance', value: '2', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'economics', key: 'fulfillmentExpense', value: '3', provenance: 'CONTRACTUAL', evidence: CONTRACT_EVIDENCE },
  { section: 'economics', key: 'taxHandling', value: 'Synthetic fixture tax treatment', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'economics', key: 'taxAndDutyPerOrder', value: '0', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'economics', key: 'targetContribution', value: '46', provenance: 'CALCULATED', evidence: FORMULA },
  { section: 'economics', key: 'breakEvenCac', value: '51', provenance: 'CALCULATED', evidence: FORMULA },
  { section: 'economics', key: 'breakEvenRoas', value: '1.9608', provenance: 'CALCULATED', evidence: FORMULA },

  { section: 'capital', key: 'maxPilotCapital', value: '10000', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'capital', key: 'protectedReserve', value: '1000', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'capital', key: 'maxDailySpend', value: '1000', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'capital', key: 'maxWeeklySpend', value: '3000', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'capital', key: 'maxMonthlySpend', value: '5000', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'capital', key: 'maxAdvertisingExposure', value: '5000', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'capital', key: 'maxSupplierExposure', value: '2000', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'capital', key: 'maxInventoryExposure', value: '2000', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'capital', key: 'maxExperimentLoss', value: '500', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'capital', key: 'maxRefundAuthority', value: '100', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
  { section: 'capital', key: 'maxSingleAutonomousTransaction', value: '200', provenance: 'OWNER_ENTERED', evidence: OWNER_EVIDENCE },
];

const STOP_RULES = ['Uncertain Provider Operations', 'Provider Reconciliation Failures'];

/**
 * One field is three controls: the value input is disabled while the datum is UNKNOWN, so the
 * provenance select must be set first; the evidence input only exists once it is not UNKNOWN.
 * The provenance select is addressed through the field's own fieldset (always its last select)
 * rather than by label text, so renaming a label cannot silently retarget the test.
 */
async function fillField(page: Page, field: Datum) {
  const fieldId = `pilot-${field.section}-${field.key}`;
  const fieldset = page.locator(`#${fieldId}`).locator('xpath=ancestor::fieldset[1]');
  await fieldset.locator('select').last().selectOption(field.provenance);
  // The value control is a <select> for the one closed-set field (sales channel) and an
  // <input> everywhere else, so it is addressed by what it actually is.
  const control = page.locator(`#${fieldId}`);
  if (await control.evaluate(node => node.tagName.toLowerCase()) === 'select') await control.selectOption({ value: field.value });
  else await control.fill(field.value);
  await page.locator(`#${fieldId}-evidence`).fill(field.evidence);
}

test('the owner approves a gap-free pilot draft in the cockpit and the guardrail records the authority', async ({ page, request }) => {
  // 35 inputs and two stop rules is a lot of controls; the default 45s budget is the constraint
  // here, not the assertions. No assertion is relaxed to fit.
  test.setTimeout(180000);

  type Constitution = {
    version: number;
    pilot: { draft: unknown; approval?: { approvedBy: string; approvedAt: string; constitutionVersion: number; draftDigest: string } };
  };
  const readConstitution = async (): Promise<Constitution> =>
    (await (await request.get(`${GUARDRAIL}/api/constitution`, { headers: HEADERS })).json()).constitution;

  const before = await readConstitution();
  expect(before.pilot.approval, 'no pilot draft starts pre-approved').toBeUndefined();

  await page.goto('/autonomy', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Pilot business & risk' }).click();

  const approve = page.getByRole('button', { name: 'Approve saved pilot envelope' });
  const gaps = page.locator('.os-pilot-gaps');

  // CP-03B's negative path, re-established: an untouched draft cannot be approved.
  await expect(gaps).toBeVisible();
  await expect(approve).toBeDisabled();

  for (const field of FIELDS) await fillField(page, field);

  for (const metric of STOP_RULES) {
    await page.locator('.os-pilot-add-rule select').selectOption({ label: metric });
    await page.getByRole('button', { name: 'Add stop rule' }).click();
  }
  for (const metric of STOP_RULES) {
    const rule = page.locator('.os-pilot-rule').filter({ hasText: metric });
    await rule.locator('input[type="number"]').fill('1');
    await rule.getByRole('checkbox').check();
  }

  // Every gap closed: the cockpit's own mirror of the guardrail's rules now reports none.
  await expect(gaps).toHaveCount(0);

  await page.getByPlaceholder('Record the source or reason for this draft').fill('Owner records pilot business and risk inputs');
  await page.getByRole('button', { name: 'Save pilot draft' }).click();
  await expect(page.getByText('Pilot draft saved as a new Constitution version')).toBeVisible();
  const saved = await readConstitution();
  expect(saved.version).toBe(before.version + 1);
  expect(saved.pilot.approval, 'a saved draft is not an approval').toBeUndefined();

  await page.getByPlaceholder('Record the approval decision').fill('Owner confirms pilot business and risk boundary');
  await expect(approve).toBeEnabled();
  const posted = page.waitForResponse(response => response.url().includes('/api/constitution/pilot/approve'));
  await approve.click();
  const response = await posted;
  expect(response.ok(), 'the approval request must not fail at the transport').toBe(true);
  expect(await response.json()).toMatchObject({ decision: 'allow', status: 'approved' });

  // The screen states the authority it was given, naming the version it applies to.
  await expect(page.getByText(/^Approved by .* for Constitution version \d+\.$/)).toBeVisible();

  // And the guardrail actually recorded it, bound to this draft at the new version.
  const after = await readConstitution();
  expect(after.version).toBe(saved.version + 1);
  expect(after.pilot.approval).toMatchObject({ constitutionVersion: after.version });
  expect(after.pilot.approval!.draftDigest).toBe(digest(after.pilot.draft));
  await expect(page.getByText(`for Constitution version ${after.version}.`)).toBeVisible();
});
