# Gate C — first Shopify development-store proof

**Status:** UNVERIFIED / NOT PASSED

**Prepared:** 2026-09-24
**Scope:** Exactly one owner-selected variant in an authorized Shopify partner development store. Ordinary merchant and autonomous price writes stay disabled.

This directory is a collection template. It contains **no external Shopify evidence** yet. Do not change a row to PASS based on fixture tests, a matching price alone, a local receipt or the static staging preflight.

**Owner update, 2026-09-24:** The authorized Shopify development store, development app, and trusted public HTTPS callback/webhook URLs are not set up yet. Gate C cannot run until these are provisioned in a separate staging environment.

## Operator prerequisites

| Input | Current status |
| --- | --- |
| Owner-approved Gate A pilot business, economics, capital and stop rules | OWNER INPUT REQUIRED |
| Authorized development store and app; shop hostname and app ID recorded without secrets | UNVERIFIED |
| Dedicated staging workspace and PostgreSQL login, separate from simulation | UNVERIFIED |
| Trusted HTTPS cockpit callback and guardrail webhook origin | UNVERIFIED |
| Actual owner session, scope/authorization-version and workspace binding | UNVERIFIED |
| Independent emergency service and separate revocation authority | UNVERIFIED |
| Protected backup and restore process | UNVERIFIED |
| Static check `node scripts/staging-readiness.mjs` | BLOCKED with current simulation configuration; this check alone cannot pass Gate B or C |

## Evidence ledger

| Required proof | Status | Non-secret artifact reference and result |
| --- | --- | --- |
| Source commit, deployment identity, date, environment and app/webhook API versions | UNVERIFIED | — |
| Real owner OAuth install, callback, token exchange, invalid/replay denial | UNVERIFIED | — |
| Product/variant/inventory/location read sync and freshness | UNVERIFIED | — |
| Real webhook registration, delivery, HMAC, inbox, deduplication and audit | UNVERIFIED | — |
| One owner-confirmed price proposal and deterministic pre-dispatch denial cases | UNVERIFIED | — |
| One provider price mutation, receipt, request reference and read-back | UNVERIFIED | — |
| Reconciliation with causal classification or explicit unresolved ambiguity | UNVERIFIED | — |
| Duplicate request, lost response, no-resend and restart safety | UNVERIFIED | — |
| External edit conflict and stale compensation denial | UNVERIFIED | — |
| Freshly authorized compensation | UNVERIFIED | — |
| Independent emergency denial, main-stack-down behavior and revocation outcome | UNVERIFIED | — |
| Durable audit linkage and staging restore/authorization checks | UNVERIFIED | — |

## Collection rules

Record sanitized provider and HOTL identifiers, timestamps, before/after values, exact command or UI action, result, audit entry reference, source commit and environment. Keep tokens, cookies, HMAC keys, database passwords, signing keys, unredacted customer data and master credentials out of this directory and screenshots. Store any sensitive raw artifacts only in the approved private evidence system, with a non-secret reference here.

An observed target price does not establish which actor changed it. If a provider response is lost, retain `UNKNOWN` and the resource lock until independently verifiable causal evidence supports a resolution. Never repeat a claimed write to manufacture a receipt. Run irreversible emergency-stop drills only in a dedicated staging instance; record failed or unconfigured revocation as such.

Current local verification is in [continuation evidence](../../docs/continuation-verification.md). The [official contract review](../../docs/shopify-official-contract-review.md) records API details and deployment gaps. This Gate C package will be updated only after real authorized operations are performed.
