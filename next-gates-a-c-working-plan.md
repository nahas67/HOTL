# Next Working Plan — Complete Gates A–C

**Updated:** 2026-09-28

**Current state:** Gate A needs owner-verified facts and approval; Gate B staging evidence is incomplete; Gate C Shopify staging is not set up. Market screening found no product ready for launch; an under-desk tray is only the lowest-complexity research lead.

## Goal

Complete and evidence the existing Gates A–C in the isolated staging environment, then stop at the Gate C evidence freeze. Do not begin Gate D.

**Technology:** No new technology is needed for this research or the remaining gate evidence. HOTL already uses TypeScript/pnpm, LangGraph.js, Next.js, Medusa, PostgreSQL and LiteLLM. The local folder contains ZIP snapshots including LangGraph, AgentScope, CrewAI, OPA, OpenBao and Langfuse. If a dependency is needed later, compare current GitHub stars/trending with these archives, then choose for project fit and safety rather than popularity alone.

## Tasks

- [x] **AI research screening:** Compared three candidates with dated retail and public supplier evidence; the [research memo](docs/pilot-ai-recommendation-2026-09-28.md) ranks a cable tray first for further research but rejects all three for launch. The Google Trends series and actual supplier quotes are still missing; no demand or margin claim is made.
- [ ] **Owner — Gate A:** Verify seller country, payment eligibility, fulfillment and source-backed economics. Enter and approve actual capital, reserve, spend/exposure/refund caps and stop thresholds in the cockpit. **Verify:** approved current Constitution revision with evidence; otherwise keep Gate A blocked and real-money actions denied.
- [ ] **Infrastructure — Gate B:** Provision isolated staging identity, database, TLS, RLS/grants, backups/restore and a separately deployed kill service. **Verify:** actual environment and independent denial evidence; simulation and preflight alone do not pass the gate.
- [ ] **Owner — Gate C prerequisites:** Create the authorized Shopify development store/app, release scopes, and provide trusted HTTPS cockpit callback and guardrail webhook origins. **Verify:** store type, app version, granted scopes and webhook API version recorded without credentials; ordinary stores remain excluded.
- [ ] **Deploy and preflight:** Put secrets only in staging secret managers, deploy components separately, and run `node scripts/staging-readiness.mjs`. **Verify:** preflight passes and real TLS, identity, database and emergency checks are evidenced separately.
- [ ] **Run Gate C proof:** Perform OAuth install, authoritative sync, real webhook delivery, and one explicitly owner-approved variant-price change through guardrails with provider read-before/write/read-after and reconciliation. **Verify:** matching external read-back, durable receipt and audit links; mocks do not count.
- [ ] **Run failure drills:** Exercise normal-store/unauthorized denial, stale approval, pause/kill, duplicate/concurrent requests, webhook retry, uncertain outcome, restart, reconciliation and supported compensation/revocation. **Verify:** no unauthorized write or blind retry; state and audit survive restart.
- [ ] **Freeze and verify:** Update evidence ledger, maturity and verification records; run relevant DB/browser drills and `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. **Verify:** each check is passed or marked unrun with reason, records agree, all evidence is committed, and work stops before Gate D.

## Done when

Gates A, B and C each have their required owner or external evidence, denial/recovery results and committed documentation. If a prerequisite remains unavailable, record the blocker and preserve the gate as blocked; do not substitute simulation evidence or an AI estimate.
