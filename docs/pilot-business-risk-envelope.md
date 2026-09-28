# Pilot business and risk envelope — Gate A

**Status:** DRAFT / NOT APPROVED  
**Created:** 2026-09-24  
**Authority:** The owner must supply and approve commercial facts and limits. This worksheet is not a guardrail configuration, an authorization to spend, or evidence of a viable business.

**Owner update, 2026-09-24:** The pilot business and risk limits have not been decided. Every value below remains `UNKNOWN`; dependent real-money actions must stay blocked.

**Owner update, 2026-09-28:** The owner asked AI to choose the business direction. The AI's provisional target-market recommendation is the United States, with an under-desk cable tray retained only as a research lead; current screening found no launch-ready product. Target market is not the owner's legal seller country. Seller/payment eligibility, fulfillment facts, unit economics and all owner financial limits remain `UNKNOWN` until verified and entered/approved through the cockpit.

Record a source, date and owner approval for each material figure. Leave missing values as `UNKNOWN`. Product research and model estimates may inform a proposal but do not become owner-approved policy.

## A1 — One pilot business

| Input | Owner-supplied value | Evidence / source |
| --- | --- | --- |
| Country and applicable market | UNKNOWN | — |
| Sales channel and merchant account | UNKNOWN | — |
| Customer profile | UNKNOWN | — |
| Category and product/family | UNKNOWN | — |
| Supplier model | UNKNOWN | — |
| Fulfillment model | UNKNOWN | — |
| Currency | UNKNOWN | — |
| Return model | UNKNOWN | — |
| Expected order value | UNKNOWN | — |
| Initial sales target and period | UNKNOWN | — |

## A2 — Per-product unit economics

Use one row per product or variant in an attached, owner-reviewed calculation. Currency, tax basis, units, time window and data source must be explicit. Do not compute contribution, break-even CAC or break-even ROAS while required inputs are unknown.

| Input | Value | Evidence / source |
| --- | --- | --- |
| Supplier product cost | UNKNOWN | — |
| Inbound shipping | UNKNOWN | — |
| Outbound shipping | UNKNOWN | — |
| Packaging | UNKNOWN | — |
| Store/channel fees | UNKNOWN | — |
| Payment fees | UNKNOWN | — |
| Expected advertising cost | UNKNOWN | — |
| Expected refund cost | UNKNOWN | — |
| Expected return cost | UNKNOWN | — |
| Expected fulfillment cost | UNKNOWN | — |
| Tax handling and reserves | UNKNOWN | — |
| Tax and duty cost per order | UNKNOWN | Required separately; unknown is never treated as zero |
| Target contribution per order | UNKNOWN | Currency amount after all modeled per-order variable costs, including planned advertising acquisition |
| Break-even customer acquisition cost (CAC) | UNKNOWN | Currency amount available for acquisition before advertising cost |
| Break-even return on ad spend (ROAS) | UNKNOWN | Dimensionless revenue-to-break-even-CAC ratio, displayed with `×` |

### Deterministic formula and types

HOTL stores money as a non-negative currency amount with at most two decimal
places, ROAS as a non-negative ratio with at most four decimal places, and stop
rates as fractions from 0 through 1. These are distinct schema types. A ratio
of `1.9608` means `$1.9608` of revenue per `$1` of advertising spend; `0.20` is
a 20% fraction, not a 20x ratio.

For the currently implemented per-order model, let `AOV` be expected order value,
`nonAdCosts` the sum of supplier product cost, inbound/outbound freight,
packaging, store fees, payment fees, refund allowance, return allowance,
fulfillment expense and tax/duty, and `plannedAdCost` the advertising acquisition
cost per order:

```text
breakEvenCAC       = AOV - nonAdCosts
targetContribution = breakEvenCAC - plannedAdCost
breakEvenROAS      = AOV / breakEvenCAC
```

The model rounds currency inputs and derived currency values to cents, and ROAS
to four decimal places. A positive break-even CAC is required. If any component
is `UNKNOWN` or merely `ESTIMATED`, if CAC is zero/negative, or if a derived
contribution would be negative, derived outputs cannot be approved. A value
marked `CALCULATED` must carry formula version
`HOTL-PILOT-UNIT-ECONOMICS-v1` and exactly match the deterministic result.
Owner-entered derived amounts are not overwritten or silently recomputed; they
must match the formula before approval, and the owner must review and explicitly
correct any mismatch. Historical stored drafts remain readable, but the guardrail
blocks derived values that do not satisfy the current formula until reviewed and
reapproved.

## A3 — Capital envelope

| Limit | Owner-approved value | Currency / period / source |
| --- | --- | --- |
| Maximum pilot capital | UNKNOWN | — |
| Minimum protected cash reserve | UNKNOWN | — |
| Maximum daily spend | UNKNOWN | — |
| Maximum weekly spend | UNKNOWN | — |
| Maximum monthly spend | UNKNOWN | — |
| Maximum advertising spend | UNKNOWN | — |
| Maximum supplier exposure | UNKNOWN | — |
| Maximum inventory exposure | UNKNOWN | — |
| Maximum experiment loss | UNKNOWN | — |
| Maximum refund authority | UNKNOWN | — |
| Maximum single autonomous transaction | UNKNOWN | — |

## A4 — Business stop rules

Define the threshold, measurement window, authoritative source, action (pause/reduce/kill/escalate), and owner contact for each adopted rule. Examples in the [locked program plan](locked-program-plan.md) are not configured rules.

| Trigger | Threshold / window | Source and response |
| --- | --- | --- |
| Contribution loss | UNKNOWN | — |
| Refund or chargeback spike | UNKNOWN | — |
| Supplier service deterioration | UNKNOWN | — |
| Provider reconciliation failure | UNKNOWN | — |
| Inventory inconsistency | UNKNOWN | — |
| Advertising attribution loss or unexpected spend | UNKNOWN | — |
| Excessive owner interventions | UNKNOWN | — |

## Gate A decision

**Current result: NOT PASSED — OWNER INPUT REQUIRED.** All pilot inputs and owner approval are outstanding. The local implementation now stores a typed pilot draft in the versioned Business Constitution, requires owner approval, invalidates that approval after any Constitution edit, and denies the Shopify development-store price path while approval is missing or stale. Its tests use synthetic fixture values solely to verify the technical contract. No real commercial values have been entered or authorized.

| Approval record | Value |
| --- | --- |
| Owner identity | UNKNOWN |
| Constitution version / workspace | UNKNOWN |
| Approved date | UNKNOWN |
| Evidence reference | UNKNOWN |
