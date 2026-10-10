# Autonomy domain gates — every configured domain is enforced or explicitly labelled

Status: implemented. Baseline before this work: **6 of 20** autonomy domains reached a decision.
After: **9 of 20** are genuinely enforced and the remaining **11** carry a persisted
`enforced: false` verdict with a stated reason, so no control presents itself as an operating
policy while changing nothing.

The previous session escalated the decision — wire the domains, or admit they do nothing — and did
not make it. Both answers are legitimate; silently presenting an inert control is not. Nothing here
invents a supplier, marketing, or CRM capability to fill a slot.

---

## 1. Per-domain table

`A` = wired to a real gate. `B` = labelled honestly, no gate exists or none is agent-reachable.

| # | Domain | | Gate (file:line) | The real operation it governs | Tests |
|---|--------|---|---|---|---|
| 1 | `sourcing` | **B** | — | None. `sourcing_agent` reads the saved catalog snapshot; its only mutation is `listing.publish`, governed by `catalog`/`pricing`. | `domains labelled unenforced… › a MANUAL sourcing domain does not gate listing publication` |
| 2 | `supplier_contact` | **B** | — | None. No supplier correspondence is sent, received, or drafted anywhere in the platform. | `labels supplier_contact as configured-but-not-enforced` |
| 3 | `catalog` | **A** | `engine.ts:746` | `listing.publish` — public listing publication | `every enforced domain… › 'catalog' MANUAL denies…` |
| 4 | `pricing` | **A** | `engine.ts:746` | `listing.publish` at a changed price | `… › 'pricing' MANUAL denies…` |
| 5 | `promotions` | **B** | — | None. `campaignSchema` (strict) has no discount, promotion, or coupon field. | `no campaign request carries content or promotion fields` |
| 6 | `advertising` | **A** | `engine.ts:737, 785, 823` | `spend.check`, `campaign.launch`, `campaign.pause`, `spend.commit` | `… › 'advertising' MANUAL denies…` |
| 7 | `content` | **B** | — | None. `marketing.copy_and_creative` drafts copy into `state.campaignDrafts`; it is never published and `campaignSchema` rejects a copy field. | `no campaign request carries content or promotion fields` |
| 8 | `influencers` | **B** | — | None. | `labels influencers as configured-but-not-enforced` |
| 9 | `seo` | **B** | — | None. | `labels seo as configured-but-not-enforced` |
| 10 | `email` | **B** | — | None. No lifecycle or campaign mail is dispatched. | `labels email as configured-but-not-enforced` |
| 11 | `sms` | **B** | — | None. | `labels sms as configured-but-not-enforced` |
| 12 | `support` | **B** | — | None of its own. The support agent's only mutation is a refund, already governed by `refunds`. | `a MANUAL support domain does not gate the support agent's only operation` |
| 13 | `refunds` | **A** | `engine.ts:753` | `refunds.evaluate` — money out, plus the escrow threshold | `… › 'refunds' MANUAL denies…` |
| 14 | `orders` | **A** | `engine.ts:1053, 1081` | `commerce.checkout` (creates the order) and `commerce.event` (moves it between payment and fulfillment states) | `denies a paused orders domain…`, `escalates a supervised checkout…` |
| 15 | `fulfillment` | **A** | `engine.ts:776, 1081` | `supplier.order` (was already gated) **and** `commerce.event` `fulfillment.updated`, which ships the order (new) | `… › 'fulfillment' MANUAL denies…`, `denies a MANUAL fulfillment domain on an agent shipment` |
| 16 | `purchasing` | **A** | `engine.ts:776` | `supplier.order` — commits spend against `maxSupplierPurchase` | `… › 'purchasing' MANUAL denies…` |
| 17 | `inventory` | **A** | `engine.ts:1053` | `commerce.checkout` — the only agent-reachable mutation of product stock, order counts and revenue | `denies a paused inventory domain…`, `executes an autonomous checkout…` |
| 18 | `finance` | **A** | `engine.ts:1081` | `commerce.event` `payment.confirmed` / `payment.failed` — decides whether captured money is recorded and whether the order stays refundable | `denies a MANUAL finance domain…`, `escalates a supervised payment transition…` |
| 19 | `marketplaces` | **B** | — | A capability exists (Shopify + WooCommerce connect and read-only sync, `integration-service.ts`) but it is **owner-only**: `extensionTransaction` calls `owner(actor)` and rejects every agent. No autonomy mode can change its behaviour. | `the marketplace capability is owner-only, so no agent autonomy mode can reach it` |
| 20 | `experimentation` | **B** | — | None. No experiment, variant, or A/B capability. | `labels experimentation as configured-but-not-enforced` |

### What changed in the guardrail

Three new gates, all inside the `autonomy()` / `proposal()` / `execute()` region:

- `engine.ts:1053` — `commerce.checkout` now evaluates `['orders','inventory']` against the order
  total. Before this, checkout was the one agent-reachable mutation that took stock, created an
  order and rolled revenue forward, and it evaluated **no** autonomy domain at all.
- `engine.ts:1081` — `commerce.event` now evaluates `['orders','finance']` for payment transitions
  and `['orders','fulfillment']` for `fulfillment.updated`. Evaluated *after* the provider-event
  dedupe check, so a redelivered webhook is acknowledged rather than escalated.
- `engine.ts:786-789, 1085-1120` — `commerce.checkout` and `commerce.event` are now routed through
  `execute()`, so an escalated proposal can actually be resolved. Previously `resolveInterrupt`
  would have returned `UNSUPPORTED_OPERATION` and left the proposal pending forever.

Supporting correctness fixes found while wiring:

- `applyCommerceEvent` results now carry `decision: 'allow'`. `resolveInterrupt` treats a missing
  `decision` as "not executed"; without this an approved payment transition would have moved the
  order while the proposal stayed pending forever.
- `proposal()` results now carry `domain`, on both the fresh and the deduplicated escalation path,
  so an escalation names its governing domain exactly as a denial already did.
- `resolveInterrupt`'s mutable-field table gained `'commerce.checkout': []` and
  `'commerce.event': ['tracking']`, so an approval can modify a tracking number but nothing else.

---

## 2. The honest label

`packages/schemas/src/constitution.ts` exports:

```ts
export const autonomyDomainEnforcement: Readonly<Record<AutonomyDomain, DomainEnforcement>>;
// { enforced: boolean; gate: string | null; basis: string }
```

and `GuardrailEngine.autonomyDomainStatus()` returns it as a flat list.

**It is not owner-editable.** `domainEnforcement` is declared on `constitutionSchema` only, never on
`constitutionFieldsSchema`, so `constitutionPatchSchema` — which derives from the latter — has no
field for it and `updateConstitution` rejects the whole request if an owner supplies one. Tested:
`refuses an owner attempt to declare a domain enforced`.

**It is persisted.** `domainEnforcement` is optional on `constitutionSchema` so that a ledger
written before this field existed keeps validating (`verify()` parses with the same schema, and
AGENTS.md rule 7 forbids turning stored state into `STATE_INVALID`). `GuardrailEngine.snapshot()`
stamps the current build's map onto every constitution it returns, so it reaches every owner- and
agent-facing response without a route change — `/api/constitution`, `/api/agent-context`,
`/api/operating-state`, `/api/telemetry` — and is written to the durable ledger by the next
transaction. Tested both ways: `stamps the current enforcement truth…` and
`loads a ledger persisted before the enforcement map existed instead of denying it`.

### What the cockpit still needs to do (outside this agent's write scope)

`apps/cockpit/**` is owned by another agent. The data is ready; only the rendering is missing:

- The Settings autonomy list at `apps/cockpit/src/components/operating-pages.tsx:716-784` should
  read `constitution.domainEnforcement[domain].enforced` and show **"configured, not enforced"**
  with `basis` for each of the eleven unenforced domains, instead of a mode selector that reads as
  armed. The existing footer sentence at line 713 ("Unimplemented business domains do not acquire
  execution capabilities by changing a mode") is a footnote on twenty identical rows; it should
  become a per-row state.
- `apps/cockpit/src/components/settings-page.tsx:434-439` reports
  `${autonomous} of ${domains.length}` as "Autonomous domains". That number counts a mode, not an
  enforced gate. It should count `Object.values(domainEnforcement).filter(d => d.enforced).length`
  and state the rest.

---

## 3. The full chain, per domain group

**Settings → Persisted Configuration → Agent Capability → Policy Evaluation → Deterministic
Authorization → Execution → Audit → Feedback → Owner Control**

| Link | How it is satisfied |
|---|---|
| Settings | Cockpit autonomy list (`operating-pages.tsx:716`) and Settings policy table (`settings-page.tsx:352`). Rendering the unenforced state is the cockpit owner's remaining task, above. |
| Persisted configuration | `constitutionFieldsSchema.domains` (all 20, owner-editable) plus the new `constitutionSchema.domainEnforcement`. Versioned in `constitutionHistory`, version-checked on write. |
| Agent capability | `scope()` (`engine.ts:676`) is the capability boundary: `sourcing_agent` → `listing.publish`; `marketing_agent` → spend/campaign; `support_agent` → `refunds.evaluate`; `order_agent` → `supplier.order`, `commerce.checkout`, `commerce.event`. Each enforced domain maps to at least one of these. |
| Policy evaluation | `autonomy()` (`engine.ts:698`) — PAUSE, MANUAL, COPILOT/SUPERVISED amount limits, and `maxAutonomousTransaction`. |
| Deterministic authorization | `proposal()` for escalation; `execute()` re-runs `block()` → `scope()` → `context()` → domain gate on every approved replay. No LLM participates. |
| Execution | `checkoutOrder()` / `applyCommerceEvent()` (new), plus the six pre-existing paths. |
| Audit | `applyTransaction` appends a hash-chained entry carrying `{reason, domain}`. Escalations additionally persist `payload.domain` and `payload.policy` (the exact policy snapshot the proposal was made under). |
| Feedback | The run log now names the domain: `graph.ts` emits `guardrail.<domain>` entries, e.g. *"… refused (MANUAL_CONTROL) under the catalog autonomy domain"*. |
| Owner control | `updateConstitution` → `saveConstitution`, which also **expires every pending proposal**, so an approval already in the queue can never be spent against a policy the owner has since changed (including a PAUSE). Tested. |

---

## 4. Orchestration wiring

`apps/orchestrator/src/domains.ts` (new) is additive and carries no policy:

- `stageDomains` — `catalog → [catalog, pricing]`, `campaign → [advertising]`,
  `supplier → [purchasing, fulfillment]`, `refund → [refunds]`.
- `guardrailOnlyDomains` — `['orders','inventory','finance']`. These are enforced by the guardrail
  on `commerce.checkout` / `commerce.event`, but **no orchestrator stage drives them**: an agent
  order or a verified provider event enters the guardrail directly. They are named explicitly rather
  than dropped.
- `pausedStageDomain()` — honours **PAUSE only**. A paused stage is skipped before anything is
  proposed, because the guardrail would deny it anyway. MANUAL and COPILOT are deliberately left to
  the guardrail so the authoritative `MANUAL_CONTROL` decision and escalation still land in the
  run's decision log rather than being replaced by a local guess.

`graph.ts` changes are four guarded early-returns plus the domain-named run log. No existing agent
was rewritten. `apps/orchestrator/test/domains.test.ts` (new, 5 tests) proves the stage map covers
exactly the enforced set, that a paused stage produces no proposal and no owner decision, and that a
refusal names its domain.

---

## 5. Verification

| Check | Result |
|---|---|
| `pnpm --filter @hotl/guardrail-service exec tsc --noEmit` | clean |
| `pnpm --filter @hotl/orchestrator exec tsc --noEmit` | clean |
| `pnpm typecheck` (11 packages) | 11 successful, 11 total |
| `pnpm --filter @hotl/guardrail-service test` | **31 files, 373 passed, 26 skipped, 0 failed** (run 5×, identical) |
| `pnpm --filter @hotl/orchestrator test` | **9 files, 55 passed, 0 failed** |
| `pnpm test` (full workspace) | **11/11 tasks successful**, 0 failed |

New coverage: `apps/guardrail-service/test/autonomy-domains.test.ts` — **45 tests**, and
`apps/orchestrator/test/domains.test.ts` — **5 tests**.

### Baseline discrepancy — reported, not reconciled

The task brief gave the baseline as *31 files, 329 passed, 26 skipped*. The working tree before
this change measured **30 files, 328 passed, 26 skipped, 354 total, 0 failed** — confirmed with an
explicit per-file listing. There are exactly 30 `*.test.ts` files under
`apps/guardrail-service/test/` (34 files in that tree, minus `policy-fixture.ts`,
`pilot-fixture.ts`, and `fixtures/ledger-writer.ts`), and all 30 ran. `git status` showed no
deleted or untracked guardrail test file. The final count of 31 files / 373 tests is that real
baseline plus this agent's new file and its 45 tests (328 + 45 = 373).

### `money-domain.test.ts` — proven pre-existing, with an A/B against unmodified HEAD

The full parallel `pnpm test` failed
`money-domain separation … keeps accepting ordinary orders after lifetime revenue crosses the old
$1M ceiling`. Three facts, in order:

1. **It is a timeout, not an assertion failure.** The failure text is literally
   `Test timed out in 5000ms`. The other five tests in that file pass. The test performs 50
   sequential file-backed `checkout` transactions, each rewriting a ledger whose audit chain grows.
2. **It passes standalone** (1236 ms for the test) and in all five guardrail-package runs.
3. **It reproduces on unmodified HEAD.** A detached `git worktree` of `91b71a9` — none of this
   agent's changes present — run under four concurrent package suites produced the identical
   failure: `test/money-domain.test.ts (6 tests | 1 failed) 7666ms`,
   `keeps accepting ordinary orders… 5063ms → Test timed out in 5000ms`, totals
   `30 files | 327 passed | 26 skipped | 354 | 1 failed`. The worktree has since been removed.

So this is load-induced headroom, not a regression from this change. **No assertion was weakened
and no timeout was raised by this agent.** A concurrent agent independently reached the same
diagnosis and has since fixed that file (timeout raised to 60 s with the loop and its assertions
untouched, plus retrying Windows teardown); `apps/guardrail-service/test/money-domain.test.ts` is
not in this agent's write scope and was not touched here.

---

## 6. Domains labelled (B) where a real capability might be hiding

Ranked by how likely I am to be wrong.

1. **`support` — highest suspicion.** A `support_agent` exists, holds `actionsToday`/`successRate`
   telemetry, and has a real stage in the graph. Its *only* mutation is a refund. The nearest real
   capability is ticket or case handling, which does not exist. I did **not** add `support` to the
   `refunds.evaluate` gate: that would make two domains control one operation, deny on whichever
   the owner set to MANUAL, and would silently change the meaning of the existing refund gate. If
   the product wants `support` to mean "customer care may act", the honest first step is a real
   support-case operation, not a second name on the refund gate.
2. **`marketplaces` — a capability exists but is unreachable by an agent.** Shopify and WooCommerce
   connections and sync are real, and `marketplaces` is exactly what an owner would expect them to
   be governed by. The blocker is `extensionTransaction`'s owner-only check, not a missing feature.
   Labelled (B) because no mode can change an agent's behaviour there. **If an agent-facing channel
   operation is added, this flips to (A) immediately** — the gate is a two-line addition.
3. **`sourcing` — a real agent, no sourcing operation.** `sourcing_agent` reads landed cost and
   draft products but never selects a supplier or a candidate. `supplier.order` is the nearest
   operation and is already governed by `purchasing`/`fulfillment`; adding `sourcing` there would
   make three domains control one gate. Genuine ambiguity, resolved conservatively.
4. **`content` — the capability is half-built.** `marketing.copy_and_creative` calls LiteLLM and
   stores a draft. Nothing publishes it and `campaignSchema` rejects a copy field. This is the
   closest of the eleven to a real capability, but wiring it would mean inventing a publication
   path — the theatre the task explicitly rules out.
5. **`promotions`** — no discount, coupon, or promotion field exists anywhere in the request schemas.
   Low suspicion: a promotions domain would need a promotion engine, not a gate.
6. **`seo`, `email`, `sms`, `influencers`, `experimentation`, `supplier_contact`** — nothing in the
   repository references these at all. Lowest suspicion.

---

## 7. Known limitations of this change

- **`commerce.checkout` escalation is a new owner-decision surface.** An `order_agent` checkout
  above the domain's `maxAutoActionAmount` now raises an approval the system could not previously
  raise. No orchestrator stage calls checkout today, so the blast radius is direct agent callers
  and `order_agent` JWTs. Owner callers (`commerce-core` `/store/checkout`, `commerce-core`
  `/webhooks/stripe`) authenticate without an agent header and are unaffected.
- **An agent replay of a provider event is refused with `RESOURCE_CHANGED`,** not acknowledged as
  `already_processed`, because the agent's `expectedRevision` binding is checked before the dedupe.
  Owner-sourced redelivery — which is how `commerce-core` actually retries — is acknowledged
  correctly. Both are tested; neither applies a second transition.
- **The `domainEnforcement` map is a build-time constant.** It changes only with code, never with
  configuration. That is deliberate, and it is why an owner cannot edit it — but it does mean the
  persisted value is a record of what the running build enforces, not an owner policy.
- **`snapshot()` is outside the `autonomy()` / `proposal()` / `execute()` region** named in the
  coordination note. It is edited for two lines, with the reason in the comment there: it is the
  single read exit point for every owner-facing response and every persisted write, so it is the
  only place a stamp reaches `/api/constitution`, `/api/agent-context`, `/api/operating-state` and
  `/api/telemetry` without a route change in a file this agent does not own. It does not touch the
  lock-reclaim region.