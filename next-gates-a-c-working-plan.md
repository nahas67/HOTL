# Next Working Plan — Complete Gates A–C

**Updated:** 2026-09-28
**Current state:** Gate A needs owner-verified facts and approval; Gate B staging evidence is incomplete; Gate C Shopify staging is not set up. The AI-selected U.S./USD desk-organization idea is only a research candidate.

## Goal

Complete and evidence the existing Gates A–C in the isolated staging environment, then stop at the Gate C evidence freeze. Do not begin Gate D.

## Tasks

- [ ] **AI research:** Validate or replace up to three candidates using dated search, competitor, public supplier, payment-eligibility and safety sources. Update the [research memo](docs/pilot-ai-recommendation-2026-09-28.md). No outreach or transactions. **Verify:** ranked, sourced recommendation with uncertainty; no estimate treated as a quote, demand proof or authorization.
- [ ] **Owner — Gate A:** Verify seller country, payment eligibility, fulfillment and source-backed economics. Enter and approve actual capital, reserve, spend/exposure/refund caps and stop thresholds in the cockpit. **Verify:** approved current Constitution revision with evidence; otherwise keep Gate A blocked and real-money actions denied.
- [ ] **Infrastructure — Gate B:** Provision isolated staging identity, database, TLS, RLS/grants, backups/restore and a separately deployed kill service. **Verify:** actual environment and independent denial evidence; simulation and preflight alone do not pass the gate.
- [ ] **Owner — Gate C prerequisites:** Create the authorized Shopify development store/app, release scopes, and provide trusted HTTPS cockpit callback and guardrail webhook origins. **Verify:** store type, app version, granted scopes and webhook API version recorded without credentials; ordinary stores remain excluded.
- [ ] **Deploy and preflight:** Put secrets only in staging secret managers, deploy components separately, and run `node scripts/staging-readiness.mjs`. **Verify:** preflight passes and real TLS, identity, database and emergency checks are evidenced separately.
- [ ] **Run Gate C proof:** Perform OAuth install, authoritative sync, real webhook delivery, and one explicitly owner-approved variant-price change through guardrails with provider read-before/write/read-after and reconciliation. **Verify:** matching external read-back, durable receipt and audit links; mocks do not count.
- [ ] **Run failure drills:** Exercise normal-store/unauthorized denial, stale approval, pause/kill, duplicate/concurrent requests, webhook retry, uncertain outcome, restart, reconciliation and supported compensation/revocation. **Verify:** no unauthorized write or blind retry; state and audit survive restart.
- [ ] **Freeze and verify:** Update evidence ledger, maturity and verification records; run relevant DB/browser drills and `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. **Verify:** each check is passed or marked unrun with reason, records agree, all evidence is committed, and work stops before Gate D.

## Done when

Gates A, B and C each have their required owner or external evidence, denial/recovery results and committed documentation. If a prerequisite remains unavailable, record the blocker and preserve the gate as blocked; do not substitute simulation evidence or an AI estimate.
