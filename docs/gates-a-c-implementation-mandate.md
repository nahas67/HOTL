# HOTL — HUMAN ON THE LOOP COMMERCE
# GATE A + GATE B + GATE C IMPLEMENTATION MANDATE

You are taking ownership of the next controlled development stage of an existing project:

# HOTL — Human on the Loop Commerce

You are NOT building HOTL from scratch.

You are NOT being asked to implement the entire long-term roadmap.

You are NOT being asked to maximize feature count.

You are being asked to advance the existing repository through exactly three program gates:

# GATE A — BUSINESS & RISK ENVELOPE

# GATE B — TRUSTED EXECUTION FOUNDATION

# GATE C — FIRST REAL SHOPIFY PROOF

Your mission is to move HOTL from a substantial locally verified commerce control plane into its **first externally evidenced guarded commerce workflow**, without weakening any existing safety invariant.

---

# 0. READ BEFORE MODIFYING ANYTHING

Read completely before changing code:

- `PROJECT_CURRENT_STATE.md`
- `readit.md`
- `AGENTS.md`
- `docs/commerce-os-build-prompt.md`
- `docs/production-continuation-prompt.md`
- `production-continuation.md`
- `hotl-build.md`
- `docs/continuation-verification.md`
- `docs/commerce-os-progress.md`
- `docs/platform-comparison-and-level.md`
- `docs/shopify-closed-loop.md`
- `docs/shopify-oauth.md`
- `docs/production-identity.md`
- `docs/postgres-runtime.md`
- `docs/restore-verification.md`
- `docs/verification.md`
- `docs/infra-verification.md`
- relevant architecture documentation
- current migrations
- current tests
- current provider contracts
- current guardrail contracts

Then inspect the actual repository.

The current repository is the implementation truth.

Documentation describing future functionality is not proof that functionality exists.

---

# 1. CURRENT PROJECT BOUNDARY

HOTL currently has substantial local implementation including:

- deterministic guardrail service
- Business Constitution
- twenty autonomy domains
- owner cockpit
- simulation storefront
- LangGraph workflow
- approvals and interrupts
- checkpoint persistence
- audit
- idempotency
- revision protection
- independent emergency stop
- workspace-bound identity contracts
- encrypted connector credentials
- Shopify OAuth implementation
- Shopify synchronization implementation
- Shopify webhook implementation
- guarded owner-operated Shopify development-store price workflow
- provider read-back
- reconciliation
- uncertain-operation locking
- proposal cancellation
- compensation protections
- local restart/recovery testing
- PostgreSQL/runtime-ledger infrastructure

However:

# THE SHOPIFY CLOSED LOOP IS NOT EXTERNALLY VERIFIED.

Do not confuse implemented code with real provider proof.

Do not claim live Shopify operation merely because tests or intercepted HTTP requests pass.

---

# 2. ABSOLUTE SAFETY INVARIANTS

These rules override every implementation preference.

## 2.1 Guardrail authority

Every consequential financial or public mutation must pass through the authenticated deterministic guardrail boundary.

This includes:

- price changes
- listings
- inventory changes
- checkout
- refunds
- supplier purchase orders
- advertising actions
- campaign mutations
- fulfillment actions

Agents may propose.

Agents may not authorize themselves.

---

## 2.2 Audit before success

Do not report a consequential operation as successful until required durable state and audit evidence are committed.

---

## 2.3 Idempotency

Retry and restart must not duplicate economic effects.

Protect against:

- duplicate request
- duplicate provider call
- duplicate webhook
- delayed acknowledgement
- worker restart
- orchestrator restart
- database restart

---

## 2.4 Owner supremacy

A newer owner decision overrides stale:

- agent plans
- proposals
- approvals
- compensation attempts
- workflows

Never allow old authorization to overwrite newer owner intent.

---

## 2.5 Pause and kill

Pause remains reversible.

Emergency kill remains an independent durable one-way latch.

Do not add a normal disengage API.

Do not place kill credentials under ordinary application authority.

---

## 2.6 Credential isolation

Provider write credentials remain inside the authorized provider/guardrail boundary.

They must never reach:

- browser JavaScript
- LangGraph prompt context
- general agents
- logs
- telemetry payloads
- UI responses
- ordinary application services

---

## 2.7 Fail closed

Consequential execution must deny when required critical state is:

- missing
- stale
- corrupt
- unreachable
- ambiguous

Do not invent authorization.

---

## 2.8 Capability does not come from configuration

Setting:

`AUTONOMOUS`

or:

`HOTL_MODE=live`

or supplying credentials

must never automatically activate an unverified capability.

Capability activation requires implementation + evidence.

---

# 3. SCOPE CONTROL

This continuation is specifically NOT for:

- supplier marketplace expansion
- autonomous supplier purchasing
- Google Ads
- Meta Ads
- TikTok Ads
- full CRM
- affiliate systems
- creator systems
- digital twin
- full AI CEO organization
- dozens of new agents
- multichannel marketplace expansion
- native mobile applications
- international expansion
- broad autonomous commerce

Those remain downstream.

You may fix architectural defects affecting this milestone, but do not turn the continuation into an unrelated platform rewrite.

---

# 4. GATE A — BUSINESS & RISK ENVELOPE

Before any real commercial mutation, HOTL must distinguish owner-supplied business authority from AI-generated assumptions.

Implement the technical contracts required to capture this.

---

# A1 — PILOT BUSINESS PROFILE

Create or complete a structured pilot configuration containing fields such as:

- pilot country
- pilot sales channel
- pilot customer profile
- product/category
- supplier model
- fulfillment model
- currency
- return model
- expected order value
- initial sales target

Do NOT fabricate missing values.

Represent missing owner-supplied values explicitly.

Example:

`UNKNOWN`

or equivalent typed missing state.

---

# A2 — UNIT ECONOMICS EVIDENCE

Create structured support for owner-supplied/evidence-backed:

- supplier product cost
- inbound freight
- outbound shipping
- packaging
- store/marketplace fees
- payment fees
- advertising acquisition estimate
- refund allowance
- return allowance
- fulfillment expense
- relevant tax handling
- target contribution
- break-even CAC
- break-even ROAS

Every field should carry provenance where appropriate.

Example provenance classes:

OWNER_ENTERED

PROVIDER_OBSERVED

CONTRACTUAL

CALCULATED

ESTIMATED

UNKNOWN

Do not silently convert estimated data into authoritative data.

---

# A3 — CAPITAL ENVELOPE

Support explicit owner controls for:

- maximum pilot capital
- protected reserve
- maximum daily spend
- maximum weekly spend
- maximum monthly spend
- maximum advertising exposure
- maximum supplier exposure
- maximum inventory exposure
- maximum experiment loss
- maximum refund authority
- maximum single autonomous transaction

Integrate applicable limits with the existing Business Constitution rather than creating a disconnected second policy system.

---

# A4 — STOP CONDITIONS

Create structured stop/reduction rules.

Examples:

- contribution-loss threshold
- excessive refund rate
- excessive chargeback rate
- tracking failure
- supplier SLA failure
- provider reconciliation failure
- inventory inconsistency
- missing attribution
- unexpected spend
- excessive owner intervention
- excessive uncertain provider operations

The system should be capable of turning these into deterministic operational restrictions.

Do not require an LLM to interpret whether a hard stop has been reached.

---

# A5 — AUTHORIZATION REQUIREMENT

AI-generated estimates may assist planning.

They may not establish financial authorization.

For any required business input still missing:

mark the capability blocked.

Continue implementing independent technical work.

Do not invent the owner's business limits merely to make the gate appear complete.

---

# GATE A ACCEPTANCE

Gate A is complete only when HOTL can clearly distinguish:

owner-provided authority

from

estimated/model-generated planning information.

The Business Constitution or authoritative associated policy layer must contain the pilot capital/risk boundaries required for real operations.

---

# 5. GATE B — TRUSTED EXECUTION FOUNDATION

---

# B1 — CREATE A TRUSTED SOURCE-CONTROL BASELINE

Current repository records indicate there may not yet be a trusted initial Git history.

Inspect the real repository first.

If Git remains uninitialized/uncommitted:

1. inspect `.gitignore`;
2. identify state/secrets that must never be committed;
3. run secret scanning;
4. ensure `.secrets/`, local provider credentials, runtime state and other sensitive material are handled correctly;
5. initialize repository history;
6. create the first trusted baseline commit;
7. record the commit in verification evidence.

Do not destroy current state in order to create clean Git status.

Do not commit secrets.

---

# B2 — PRESERVE DURABLE STATE

Protect the existing local state identified by current repository documentation.

Do not reset or overwrite working business history.

Changes to persistence schemas must use controlled migrations.

Missing initialized state must fail closed rather than silently creating fresh history.

---

# B3 — RESTORE VERIFICATION

Verify or complete recovery paths for:

- local guardrail state
- LangGraph checkpoints
- PostgreSQL runtime ledger
- audit state
- kill-switch journal

Re-run changed Docker restore tests if Docker is genuinely available.

Do not falsely claim a Docker pass if the daemon is unavailable.

Record:

environment

command

result

data digest/check

authorization behavior after restore.

---

# B4 — PRODUCTION/STAGING IDENTITY

Complete the identity foundation needed for real provider staging.

Required properties include:

- authenticated owner
- authoritative workspace
- short-lived agent identities
- agent scope restrictions
- authorization version
- token expiry
- revocation
- service-to-service identity
- cross-workspace denial
- RLS/workspace enforcement

Runtime DB users must not receive:

- superuser
- DDL
- BYPASSRLS

unless a separate administrative migration role specifically requires them.

---

# B5 — CROSS-WORKSPACE SECURITY TESTS

Test attempts to access another workspace's:

- Shopify installation
- connector tokens
- products
- observations
- price proposals
- receipts
- investigation records
- audit history
- approvals

Expected:

DENIED.

---

# B6 — TRUSTED HTTPS STAGING ENTRY

Establish the HTTPS endpoint required for a real authorized Shopify development-store callback.

Requirements:

- explicit environment separation
- TLS
- bounded route exposure
- strict host/origin logic as appropriate
- request validation
- secret isolation
- auditability

Do not publicly expose unrelated development services unnecessarily.

---

# B7 — STAGING DATA SEPARATION

Create a dedicated development-store/staging workspace.

Do not mix external staging data with the normal default simulation ledger.

Make the distinction visible in:

- configuration
- storage
- UI
- logs
- evidence

---

# B8 — EMERGENCY CONTROL

For the staging environment, preserve independent emergency authority.

The guardrail path must check authoritative emergency state before consequential dispatch.

Prepare for the actual Gate C denial test.

---

# GATE B ACCEPTANCE

Gate B passes only when evidence demonstrates:

authenticated owner  
→ authoritative workspace  
→ correctly scoped operation  
→ durable state  
→ audit  
→ cross-workspace denial  
→ restore capability.

Do not declare production readiness.

---

# 6. GATE C — FIRST REAL SHOPIFY PROOF

This is the principal deliverable.

Use an authorized Shopify development/test environment only.

Do not enable ordinary merchant or autonomous price writes.

---

# C1 — VERIFY CURRENT SHOPIFY DOCUMENTATION

Before modifying the provider implementation:

review current official Shopify documentation relevant to:

- app authentication
- development stores
- Admin API
- API version
- required scopes
- GraphQL mutation
- webhook registration
- webhook verification
- token lifecycle
- rate limits
- version/deprecation behavior

Do not assume existing provider code remains correct merely because local tests pass.

Document material API corrections.

---

# C2 — AUTHORIZED DEVELOPMENT STORE

Connect a real authorized Shopify development environment.

Record only non-secret identifiers in evidence.

Verify that the configured store meets HOTL's intended development-store restriction.

Do not weaken this check just to get the request through.

---

# C3 — REAL OAUTH

Execute the actual flow.

Prove:

installation request

→ challenge issuance

→ browser-bound state

→ Shopify redirect

→ callback

→ state verification

→ shop verification

→ token exchange

→ encrypted storage

→ usable installation state.

Test:

wrong state

expired state

replay

wrong shop

invalid callback

revoked/invalid credential

reconnection.

---

# C4 — CREDENTIAL HANDLING

Verify no provider token appears in:

- browser payloads
- application UI
- logs
- agent context
- audit payloads
- screenshots
- test artifacts

Evidence may state that a token existed.

Evidence must not contain the token.

---

# C5 — REAL SHOPIFY READ SYNC

Create controlled test data in the development store.

Import relevant:

- product
- variant
- price
- inventory
- location
- order if supported by the development environment
- fulfillment observation where applicable

Verify canonical mapping.

Record source and freshness.

---

# C6 — STALE SYNC CANCELLATION

Create a condition where an older synchronization result attempts to arrive after newer provider information.

The older state must not overwrite newer authoritative state.

Test concurrency.

---

# C7 — PROVIDER FAILURE

Simulate/observe:

- network failure
- rate limit
- temporary provider error
- authentication failure

Last known good provider snapshot must remain distinguishable from fresh authoritative state.

Never silently present stale data as fresh.

---

# C8 — REAL WEBHOOK REGISTRATION

Use the current owner-triggered webhook-registration mechanism.

Execute the actual provider registration.

Read the subscription back from Shopify where supported.

Record the non-secret provider result.

---

# C9 — REAL WEBHOOK DELIVERY

Trigger actual development-store events.

Verify:

Shopify

→ trusted callback

→ HMAC verification

→ durable inbox

→ deduplication

→ leased worker

→ canonical observation

→ audit.

---

# C10 — WEBHOOK FAILURE TESTS

Cover:

duplicate event

replay

invalid HMAC

oversized body

malformed payload

provider retry

worker crash

service restart

slow consumer

out-of-order events where applicable.

No duplicate business effect.

---

# C11 — SELECT ONE PRICE TARGET

Choose exactly one owner-confirmed development-store product variant.

Record:

external ID

observed current price

owner-entered cost evidence

current provider observation

current Business Constitution revision.

Do not select broad batches.

---

# C12 — CREATE REAL GUARDED PROPOSAL

Use HOTL's existing typed price proposal workflow.

The proposal should carry or reference:

workspace

actor

resource

observed provider state

target price

cost evidence

economic calculation

Constitution revision

resource revision

request key

reason

time.

---

# C13 — PRE-DISPATCH VALIDATION

Immediately before provider mutation validate:

1. emergency state
2. platform pause
3. authenticated owner
4. workspace binding
5. domain authority
6. Constitution revision
7. proposal validity
8. current resource revision
9. current provider state
10. cost evidence
11. margin floor
12. development-store allowlist
13. capability verification state
14. unresolved-operation lock
15. idempotency status

Any failed check means:

DENY / REPLAN / INVESTIGATE

not:

“continue anyway.”

---

# C14 — EXTERNAL EDIT RACE

The project already recognizes a provider race because the relevant Shopify price mutation does not give HOTL a general compare-and-swap mechanism.

Strengthen this path.

Immediately before dispatch:

perform a fresh provider read.

Compare:

expected pre-state

to

actual pre-state.

If materially changed:

DO NOT WRITE.

Move to an explicit conflict/stale state.

Require:

replan

or owner review.

Never silently overwrite newer external owner/provider intent.

---

# C15 — ONE-USE DISPATCH CLAIM

Preserve the existing one-use dispatch claim.

Once claimed:

the operation cannot be casually submitted again.

Persist enough information before external dispatch to survive process death.

---

# C16 — EXECUTE REAL SHOPIFY PRICE MUTATION

Execute exactly the approved development-store change.

No batch writes.

No autonomous scaling.

No ordinary merchant store.

Record:

operation ID

provider request reference when available

dispatch timestamp

resource

pre-state

requested state.

Do not store secret headers/tokens.

---

# C17 — PROVIDER READ-BACK

After the mutation:

re-read the authoritative provider resource.

Compare:

requested target

with

provider observed value.

But remember:

matching value alone does not prove causality if the original provider response was lost.

---

# C18 — DURABLE RECEIPT

Create/update the internal execution receipt with:

operation identity

actor

workspace

provider

target resource

pre-state

requested state

authorization

dispatch claim

provider result classification

post-state

reconciliation status

audit references

timestamps.

---

# C19 — SUCCESS CLASSIFICATION

Only classify as confirmed when the available evidence meets the defined causality requirements.

Avoid shortcuts.

---

# C20 — UNKNOWN OUTCOME

When an external call may have executed but the result is lost:

do not resend automatically.

Move the operation to:

UNKNOWN

or equivalent unresolved state.

The resource remains write-locked.

---

# C21 — DRIFT

If observed provider state differs from the expected result:

use an explicit DRIFT state.

Do not silently rewrite HOTL state and pretend the operation succeeded.

---

# C22 — UNCERTAINTY RESOLUTION WORKFLOW

Implement/complete a first-class owner investigation interface.

Possible actions:

Refresh provider evidence

Inspect provider state

Attach investigation note

Attach provider reference metadata

Mark evidence insufficient

Resolve confirmed if evidence establishes causality

Resolve failed where evidence establishes failure

Escalate

Request authorized compensation

Keep unresolved.

Human notes alone are not proof.

The system must differentiate:

OPERATOR_NOTE

from:

VERIFIED_PROVIDER_EVIDENCE.

---

# C23 — CAUSALITY

Do not consider:

“the price eventually became $X”

sufficient evidence that HOTL caused the change.

Use the strongest available provider-side references/timestamps/events combined with internal dispatch evidence.

If causality cannot be established:

preserve ambiguity.

That is safer than fabricating certainty.

---

# C24 — COMPENSATION

Prove a compensation workflow.

Example:

Original price = A

HOTL authorized change = B

New authorized compensation = A.

Compensation must receive fresh authorization.

If an owner/provider changes B → C before compensation:

the compensation becomes stale.

Expected:

ABORT / REPLAN.

Do not overwrite C with A using old authority.

---

# C25 — PENDING CANCELLATION

Prove existing proposal cancellation.

A PENDING proposal may be cancelled with reason.

Once dispatch is claimed:

cancellation must not be usable as a way to erase or bypass an uncertain external effect.

---

# C26 — RETRY TEST

Replay the same logical request.

Expected:

no duplicate provider mutation.

Record evidence.

---

# C27 — LOST RESPONSE TEST

Exercise a provider-response-loss scenario using the safest feasible controlled method.

Expected:

- no blind retry
- UNKNOWN/locked state
- owner-visible investigation requirement.

Do not intentionally create unsafe real effects merely to satisfy a test.

Use a controlled development environment.

---

# C28 — SERVICE RESTART TEST

Restart the relevant service during controlled workflow states.

At minimum validate behavior for:

PENDING

DISPATCHING or equivalent claimed state

UNKNOWN

CONFIRMED.

No duplicate provider write may occur.

---

# C29 — DATABASE/STATE RESTART

Where applicable:

restart database/state service.

Recover operation state.

Verify the system remains unable to duplicate the external write.

---

# C30 — COMPENSATION RESTART

Interrupt a compensation workflow.

Verify:

fresh authorization remains required

and

restart does not repeat the provider action.

---

# C31 — ACTUAL EMERGENCY DENIAL

Engage HOTL's independent emergency stop for the isolated staging instance.

Attempt a consequential Shopify write.

Expected:

DENIED BEFORE PROVIDER MUTATION.

Capture evidence.

---

# C32 — MAIN-STACK-DOWN EMERGENCY TEST

Where the architecture supports it:

verify the independently deployed emergency component remains authoritative or available according to the project's intended design while the main application is unavailable.

Do not compromise unrelated environments.

---

# C33 — REVOCATION

If provider revocation hooks are implemented and the environment safely supports verification:

perform an actual revocation test.

If external revocation cannot be verified:

record it as UNVERIFIED.

Do not simulate success.

---

# C34 — OBSERVABILITY

For the staging workflow expose sufficient operational information for:

OAuth failures

sync failures

webhook failure

rate limit

mutation state

UNKNOWN state

DRIFT state

reconciliation failure

kill denial.

Do not leak credentials into telemetry.

---

# C35 — COCKPIT

The owner staging UI should accurately display:

environment

connection status

sync freshness

webhook status

cost evidence

proposal

approval/authorization

dispatch status

receipt

reconciliation

uncertainty

investigation notes

compensation availability

kill/pause denial.

Never display fixture data as live provider evidence.

---

# 7. GATE C HARD ACCEPTANCE TEST

Gate C does NOT pass until actual external evidence proves all applicable items below:

## Identity

Authorized owner connected to correct staging workspace.

## OAuth

Real Shopify installation/callback/token exchange succeeds.

## Read sync

Real Shopify state reaches HOTL.

## Webhook

Real Shopify webhook reaches HOTL and is processed correctly.

## Proposal

A typed price proposal is created from real provider observation.

## Authorization

Deterministic guardrails authorize the owner-approved mutation.

## Provider write

The intended development-store price mutation executes.

## Receipt

Durable internal receipt exists.

## Read-back

Provider state is fetched after mutation.

## Reconciliation

Expected and observed states reconcile or produce explicit ambiguity.

## Idempotency

Replay does not duplicate the write.

## Stale state

External edit invalidates stale mutation.

## Unknown outcome

Lost/ambiguous result cannot blindly resend.

## Investigation

Ambiguity remains locked until safely resolved.

## Compensation

Freshly authorized compensation works.

## Compensation staleness

Intervening external owner change blocks stale compensation.

## Restart

Restart does not duplicate the provider write.

## Emergency stop

Kill state denies provider mutation.

## Audit

The complete chain is durably auditable.

If any required result is only mocked/intercepted:

Gate C remains incomplete.

---

# 8. EVIDENCE PACKAGE

Create a dedicated evidence location such as:

`evidence/gate-c-first-shopify-proof/`

or follow the project's established evidence convention.

Include:

## README

What was tested.

## SOURCE

Git commit/hash.

## DATE

Execution date.

## ENVIRONMENT

Development/staging classification.

## CONFIGURATION SUMMARY

No secrets.

## OAUTH EVIDENCE

Sanitized.

## READ SYNC EVIDENCE

Provider resource references and resulting internal state.

## WEBHOOK EVIDENCE

Sanitized delivery evidence.

## MUTATION EVIDENCE

Operation ID, resource and before/after.

## RECEIPT

Sanitized internal receipt.

## RECONCILIATION

Expected versus observed.

## RETRY TEST

Proof duplicate request did not duplicate write.

## RACE TEST

Proof external edit causes denial/replan.

## UNKNOWN TEST

Proof uncertainty remains locked.

## RESTART TEST

Proof restart does not resend.

## COMPENSATION

Proof of fresh authorization.

## KILL TEST

Proof provider dispatch is denied.

## AUDIT PROOF

Audit linkage.

## LIMITATIONS

Everything still unverified.

Never place real provider tokens, cookies, secrets, signing keys or master credentials inside evidence.

---

# 9. MATURITY UPDATES

After successful work, update the feature registry/status documentation.

Examples:

Shopify OAuth:

M4 EXTERNAL STAGING VERIFIED

only if actual Shopify development-store OAuth was performed.

Shopify read sync:

M4

only if real provider data was imported.

Shopify price write:

M4

only after the guarded development-store mutation is evidenced.

Broad Shopify autonomous pricing:

must remain below autonomy eligibility.

Ordinary merchant pricing:

must remain disabled unless separately authorized and verified later.

---

# 10. DO NOT ADVANCE INTO GATE D

Even after Gate C passes:

do NOT automatically start implementing:

suppliers

ads

CRM

multi-marketplace

digital twin

advanced agent organization

unless all Gate A-C evidence and documentation are first committed and internally consistent.

Stop the main implementation program at the Gate C evidence freeze.

Small fixes needed to finalize evidence are allowed.

---

# 11. TEST REQUIREMENTS

Preserve all existing passing tests.

Add tests for every new critical path.

At minimum cover:

OAuth replay

OAuth expiry

wrong workspace

cross-tenant access

token invalidation

sync race

duplicate webhook

invalid webhook signature

provider rate limit

stale proposal

stale Constitution

owner edit before dispatch

owner edit after proposal

duplicate dispatch

lost provider response

UNKNOWN lock

DRIFT

investigation note permissions

false causality

compensation

stale compensation

restart

database restart where applicable

kill denial.

Do not delete difficult tests to make the suite green.

---

# 12. VERIFICATION COMMANDS

Run the appropriate repository checks.

At minimum where supported:

`pnpm lint`

`pnpm typecheck`

`pnpm test`

`pnpm build`

`pnpm test:e2e`

relevant PostgreSQL/runtime-ledger drills

relevant restore drills

Shopify-specific targeted tests

security/secret scans.

If a dependency such as Docker is unavailable:

do not fabricate results.

Record:

BLOCKED / UNRUN

with the concrete reason.

---

# 13. FAILURE POLICY

If an external requirement blocks one task:

do not stop all useful work.

Complete independent work.

But do not convert the blocker into a mocked “pass.”

Example:

If Shopify credentials are unavailable:

you may strengthen code and tests,

but Gate C must remain externally unverified.

---

# 14. OWNER-INPUT POLICY

Gate A requires values that belong to the owner.

Do NOT manufacture:

pilot capital

acceptable loss

minimum margin

maximum supplier exposure

maximum refund authority

business geography

product economics.

If these values are absent:

implement the schema, UI, validation and fail-closed behavior.

Mark the real business authorization step:

OWNER INPUT REQUIRED.

Continue non-dependent engineering.

---

# 15. NO CLAIMS BEYOND EVIDENCE

Never state:

“production ready”

“fully autonomous”

“real commerce complete”

“safe for unrestricted merchants”

“zero error”

unless objectively supported—which this continuation is not intended to establish.

Use precise classifications:

LOCAL VERIFIED

INTEGRATION VERIFIED

EXTERNAL STAGING VERIFIED

UNVERIFIED

BLOCKED

DISABLED.

---

# 16. FINAL REPORT FORMAT

After implementation, return exactly the following engineering summary structure.

## EXECUTIVE RESULT

State whether Gate A, Gate B and Gate C passed, partially passed or remain blocked.

---

## GATE A — BUSINESS & RISK ENVELOPE

What exists.

Which owner values were supplied.

Which remain UNKNOWN.

---

## GATE B — EXECUTION FOUNDATION

Identity.

Git/source baseline.

Restore.

Staging infrastructure.

Workspace isolation.

Emergency architecture.

---

## GATE C — SHOPIFY EXTERNAL PROOF

Real OAuth:

PASS / FAIL / UNVERIFIED

Real sync:

PASS / FAIL / UNVERIFIED

Real webhook:

PASS / FAIL / UNVERIFIED

Real guarded mutation:

PASS / FAIL / UNVERIFIED

Read-back:

PASS / FAIL / UNVERIFIED

Reconciliation:

PASS / FAIL / UNVERIFIED

Retry:

PASS / FAIL / UNVERIFIED

External-edit race:

PASS / FAIL / UNVERIFIED

Unknown outcome:

PASS / FAIL / UNVERIFIED

Compensation:

PASS / FAIL / UNVERIFIED

Restart:

PASS / FAIL / UNVERIFIED

Emergency denial:

PASS / FAIL / UNVERIFIED

Audit:

PASS / FAIL / UNVERIFIED

---

## CODE CHANGES

Concrete implementation changes.

---

## TEST RESULTS

Actual commands and actual numbers.

Do not combine overlapping test totals misleadingly.

---

## EXTERNAL EVIDENCE

Only real provider/deployed evidence.

---

## SAFETY INVARIANTS

Confirm whether each original invariant remains preserved.

---

## BLOCKERS

Only actual unresolved blockers.

---

## MATURITY UPDATES

Which capabilities changed maturity state.

---

## REPOSITORY STATE

Branch

Commit/hash

Dirty/clean status.

---

## NEXT GATE

The next dependency after this continuation should be:

# GATE D — ONE REAL SUPERVISED COMMERCE CYCLE

Do not begin Gate D during this mandate.

---

# 17. EXECUTION STYLE

Work like a principal engineer responsible for a high-consequence commerce control plane.

Do not maximize code volume.

Maximize:

correctness

evidence

state integrity

security

recoverability

economic safety

operator clarity.

Research current official provider behavior before changing integration code.

Make implementation decisions autonomously when normal engineering judgment is sufficient.

Do not ask the owner to decide internal implementation trivia.

But never fabricate owner financial/risk authority.

Preserve proven architecture.

Repair defects.

Add missing safeguards.

Execute meaningful tests.

Collect real evidence where authorized.

Keep uncertainty explicit.

---

# 18. FINAL MANDATE

The objective of this continuation is not:

“make HOTL look more complete.”

The objective is:

# PROVE THE FIRST REAL GUARDED COMMERCE LOOP.

Move HOTL from:

LOCAL CODE

to:

REAL SHOPIFY DEVELOPMENT-STORE EVIDENCE

while preserving:

owner authority

deterministic guardrails

idempotency

audit

credential isolation

reconciliation

uncertainty handling

restart safety

emergency control.

When Gate C is frozen with evidence, stop.

Do not move into broad business automation until that foundation has been proven.