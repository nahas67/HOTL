# HOTL — HUMAN ON THE LOOP COMMERCE
# LOCKED PROGRAM PLAN
## Feature Roadmap • Checkpoints • Evidence Gates • Autonomy Progression

**Baseline date:** September 24, 2026

---

# 1. CURRENT TRUTH

HOTL is currently a substantial local prototype, not a production autonomous commerce company.

Current proven/local strengths include:

- deterministic guardrail service
- owner cockpit
- simulation storefront
- LangGraph orchestration
- human approval interrupts
- checkpoint/restart behavior
- Business Constitution
- twenty autonomy domains
- audit and idempotency
- independent one-way kill latch
- workspace-bound identity contracts
- local PostgreSQL/runtime-ledger support
- connector architecture
- Shopify OAuth implementation
- Shopify synchronization implementation
- Shopify webhook implementation
- guarded Shopify development-store price workflow
- provider read-back/reconciliation logic
- proposal cancellation
- uncertain-operation locking
- local restart/recovery tests

Current major boundaries:

- no externally verified Shopify merchant connection
- no real provider price mutation evidence
- no live payment execution
- no real supplier purchasing
- no live advertising spend
- no complete fulfillment operation
- no full customer/CRM layer
- no authoritative real-business financial ledger
- no production hosting proof
- no deployed revocation proof
- no demonstrated profitable business
- no demonstrated broad autonomous operation

The program must therefore move from:

**CODE EXISTS**

to:

**REAL EVIDENCE EXISTS**

and only afterward to:

**AUTONOMY IS EARNED.**

---

# 2. PERMANENT SAFETY CONTRACT

These rules survive every future prompt.

## Mutation authority

Every consequential financial or public mutation must pass through the authenticated deterministic guardrail service.

Examples:

- prices
- listings
- supplier purchase orders
- campaigns
- advertising spend
- inventory
- checkout
- refunds
- fulfillment actions

Models can propose.

Models cannot authorize themselves.

---

## Audit before success

A successful consequential mutation cannot be reported as successful until its durable audit record is committed.

---

## Idempotency

Economic operations must remain safe under:

- retry
- restart
- duplicate request
- duplicate webhook
- delayed acknowledgement

Historical authorization is not automatically fresh authorization.

---

## Owner supremacy

Current owner state outranks stale agent plans.

Owner edits can invalidate:

- proposals
- approvals
- dispatches
- compensation requests
- workflows

---

## Pause and kill

Pause remains reversible.

Kill remains a durable one-way emergency latch.

There must be no normal disengage endpoint.

---

## Credential isolation

Provider mutation credentials remain inside the guardrail/provider boundary.

Do not expose them to:

- browsers
- LangGraph agents
- arbitrary runtime prompts
- frontend code
- ordinary orchestration services

---

## Fail closed

Missing, corrupt, stale, unreachable or ambiguous critical state denies consequential execution.

---

## Capability ≠ configuration

Selecting “Autonomous” in the UI cannot create a capability.

A capability must first be:

implemented  
→ tested  
→ failure-tested  
→ externally verified where applicable  
→ owner-approved  
→ autonomy-evaluated.

---

# 3. MATURITY MODEL

Every major feature receives exactly one maturity state.

### M0 — NOT IMPLEMENTED

No meaningful implementation.

### M1 — IMPLEMENTED

Code exists.

### M2 — LOCAL VERIFIED

Meaningful local tests pass.

### M3 — INTEGRATION VERIFIED

Cross-service workflow is proven.

### M4 — EXTERNAL STAGING VERIFIED

Real provider/test environment was used.

### M5 — PRODUCTION VERIFIED

Real deployed behavior has evidence.

### M6 — SHADOW VALIDATED

Autonomous logic was measured against real outcomes without execution authority.

### M7 — AUTONOMY ELIGIBLE

Predeclared performance and risk criteria are met.

Never label a feature simply “done.”

---

# 4. PROGRAM GATE A — BUSINESS & RISK ENVELOPE

## Purpose

Before HOTL performs real commerce actions, establish what business it is operating and what financial risk the owner accepts.

This gate was missing from the earlier roadmap and must now be considered mandatory.

---

# A1 — PILOT BUSINESS DEFINITION

Choose one narrow first operating environment.

Define:

Pilot country

Pilot sales channel

Pilot customer profile

Pilot category

Pilot product or product family

Pilot supplier model

Fulfillment model

Currency

Return model

Expected order value

Initial sales target

Do not begin with worldwide commerce.

---

# A2 — REAL UNIT ECONOMICS

For the pilot product document:

Supplier product cost

Inbound shipping

Outbound shipping

Packaging

Marketplace/store fees

Payment fees

Expected advertising cost

Expected refund cost

Expected return cost

Expected fulfillment cost

Expected tax handling

Expected contribution margin

Break-even CAC

Break-even ROAS

HOTL must not invent missing commercial numbers and then authorize itself from those invented values.

Unknown inputs remain explicitly UNKNOWN.

---

# A3 — CAPITAL ENVELOPE

Owner provides:

Maximum pilot capital

Minimum protected cash reserve

Maximum daily spend

Maximum weekly spend

Maximum monthly spend

Maximum advertising spend

Maximum supplier exposure

Maximum inventory exposure

Maximum experiment loss

Maximum refund authority

Maximum single autonomous transaction

---

# A4 — BUSINESS STOP RULES

Predefine kill/reduction conditions.

Examples:

Contribution loss exceeds X

Refund rate exceeds X

Chargeback rate exceeds X

Tracking becomes unreliable

Supplier SLA falls below threshold

Provider reconciliation fails

Inventory truth becomes inconsistent

Advertising attribution disappears

Unexpected spend exceeds threshold

Too many owner interventions occur

---

# CHECKPOINT A

Gate A passes when the Business Constitution contains owner-supplied pilot economics, capital constraints and stop rules.

No AI-generated assumption may masquerade as owner authorization.

---

# 5. PROGRAM GATE B — TRUSTED EXECUTION FOUNDATION

This gate prepares HOTL for real provider operation.

---

# B1 — SOURCE CONTROL BASELINE

The handoff currently reports no initial Git commit.

Before broad expansion:

Initialize repository history.

Review `.gitignore`.

Ensure durable data is not accidentally committed.

Ensure secrets are excluded.

Run secret scanning.

Record current source baseline.

Create an immutable reference tag/checkpoint if appropriate.

---

# B2 — RESTORE COMPLETION

Preserve:

`data/guardrail-state.json`

`data/orchestrator-checkpoints.json`

`infra/kill-switch/data/events.jsonl`

`.secrets/connectors.key`

Complete and record:

File-state restore

Checkpoint restore

PostgreSQL restore

Kill-journal recovery

Changed Docker restore drill

---

# B3 — PRODUCTION IDENTITY

Move beyond local-development identity.

Verify:

Owner authentication

Workspace binding

Short-lived agent identity

Scope reduction

Token expiry

Revocation

Service identity

Cross-workspace denial

RLS behavior

No DDL/superuser/BYPASSRLS privileges for runtime identities

---

# B4 — HOSTED/DEPLOYED SUPPORTING INFRASTRUCTURE

Where required for staging, establish:

trusted HTTPS endpoint

hosted PostgreSQL/Supabase environment

secret storage

logging

basic metrics

backup

restore

isolated emergency control

Do not call this production until production acceptance criteria are separately satisfied.

---

# CHECKPOINT B

Evidence must show:

authenticated owner  
→ correct workspace  
→ scoped guardrail operation  
→ durable state  
→ audit  
→ cross-workspace denial  
→ restore.

---

# 6. PROGRAM GATE C — FIRST REAL SHOPIFY PROOF

This is the highest-value engineering milestone.

Do not expand aggressively into suppliers, advertising, dozens of agents or multiple marketplaces until this gate is complete.

---

# C1 — AUTHORIZED SHOPIFY DEVELOPMENT ENVIRONMENT

Provision:

authorized Shopify development store

development app

trusted HTTPS callback

scoped credentials

dedicated test workspace

dedicated state

independent emergency control

---

# C2 — REAL OAUTH

Prove:

install initiation

browser-bound challenge

callback

state validation

shop validation

token exchange

encrypted storage

token use

reauthorization

disconnect

invalid credential handling

No fixture counts.

---

# C3 — REAL READ SYNCHRONIZATION

Create real development-store data.

Verify HOTL imports:

products

variants

prices

inventory

locations

orders where appropriate

fulfillment observations where appropriate

Measure:

sync freshness

pagination

rate limiting

stale sync cancellation

reconnection

---

# C4 — REAL WEBHOOK DELIVERY

Register provider subscriptions.

Trigger real events.

Verify:

Shopify

→ HTTPS callback

→ signature verification

→ durable inbox

→ deduplication

→ worker

→ canonical state

→ audit.

Test:

duplicate event

replay

invalid signature

oversized body

worker restart

provider retry

---

# C5 — FIRST REAL GUARDED PRICE OPERATION

Use one owner-approved development-store variant.

Flow:

Real provider observation  
→ owner cost evidence  
→ typed proposal  
→ Constitution validation  
→ owner/domain authority validation  
→ margin validation  
→ fresh resource check  
→ dispatch claim  
→ Shopify mutation  
→ provider receipt  
→ provider read-back  
→ reconciliation  
→ audit  
→ owner cockpit.

---

# C6 — NO BLIND RETRY

The existing safety invariant remains:

If dispatch outcome is uncertain, HOTL does NOT simply resend.

---

# C7 — UNCERTAIN OUTCOME STATE MACHINE

Standardize provider-write states:

PENDING

AUTHORIZED

DISPATCHING

CONFIRMED

UNKNOWN

DRIFT

FAILED

CANCELLED

COMPENSATION_REQUIRED

COMPENSATED

A resource with UNKNOWN or unresolved DRIFT remains write-locked until resolution.

---

# C8 — CAUSAL UNCERTAINTY RESOLUTION

An observed matching price does not prove HOTL caused it.

Build an evidence workflow using the strongest provider evidence available.

Resolution must distinguish:

confirmed HOTL mutation

external actor mutation

failed mutation

unresolved ambiguity

Never let owner notes alone become provider proof.

---

# C9 — EXTERNAL EDIT RACE

Resolve the known race:

HOTL observes price A.

Owner/provider externally changes A → B.

HOTL attempts A → C proposal.

Because provider compare-and-swap is unavailable for this operation, use techniques such as:

fresh pre-dispatch read

freshness window

semantic state comparison

owner revision invalidation

resource lock

explicit conflict

abort/replan

A stale write must not silently overwrite newer owner intent.

---

# C10 — COMPENSATION

Prove:

original price

→ HOTL change

→ authorized compensation.

If another actor changes the resource before compensation:

compensation must become stale and fail/replan.

---

# C11 — RESTART SAFETY

Restart during:

PENDING

AUTHORIZED

DISPATCHING

UNKNOWN

CONFIRMED.

Verify no duplicate provider write.

---

# C12 — ACTUAL EMERGENCY DENIAL

Engage independent emergency control.

Attempt consequential operation.

Expected result:

DENIED.

Then prove behavior when the main stack is unavailable.

---

# CHECKPOINT C — FIRST EXTERNAL COMMERCE CHECKPOINT

Gate C passes only when real external evidence proves:

OAuth

read sync

webhook

guarded mutation

receipt

read-back

reconciliation

replay denial

restart safety

race handling

uncertainty handling

compensation

kill denial

audit linkage.

This should become HOTL's first major evidence package.

---

# 7. PROGRAM GATE D — ONE REAL SUPERVISED COMMERCE CYCLE

After Gate C, stop thinking only about product price.

Connect the actual commercial lifecycle.

---

# D1 — PRODUCT/CATALOG TRUTH

Canonical:

Product

Variant

SKU

Offer

Listing

Price

Cost evidence

Inventory ownership

---

# D2 — INVENTORY

States:

ON_HAND

AVAILABLE

RESERVED

INBOUND

DAMAGED

RETURNING

SUPPLIER_AVAILABLE

Implement:

reservation

release

adjustment

reconciliation

oversell prevention.

---

# D3 — ORDER LIFECYCLE

Canonical order lifecycle:

CREATED

PAID

ALLOCATED

FULFILLMENT_PENDING

FULFILLED

SHIPPED

DELIVERED

CANCELLED

RETURNED

REFUNDED

Exact states may be adapted to existing architecture, but transitions must remain explicit.

---

# D4 — PAYMENT AND SETTLEMENT

Introduce real payment evidence before HOTL is described as operating real revenue.

Separate:

Order

Payment

Settlement

Payout

Refund

Chargeback.

Do not infer settled cash from order creation.

---

# D5 — FULFILLMENT

Support one initial real/sandbox fulfillment path.

Prove:

order  
→ inventory reservation  
→ fulfillment decision  
→ shipment  
→ tracking  
→ delivered/exception state.

---

# D6 — RETURNS & REFUNDS

Separate:

return request

eligibility

authorization

return shipment

inspection where applicable

refund authorization

payment-provider refund execution

financial reconciliation.

---

# D7 — FINANCE

For the pilot cycle calculate actual settled contribution:

Revenue

− product cost

− payment fees

− channel fees

− shipping

− fulfillment

− advertising

− returns

− refunds

− taxes/required reserves

= settled contribution.

Clearly distinguish:

observed

estimated

unavailable.

---

# CHECKPOINT D

Complete one real supervised commerce cycle from product to settled financial result with human responsibility explicit at every unsupported boundary.

---

# 8. FEATURE STREAM — SUPPLIER & PROCUREMENT

Begin once Gate C safety patterns are reusable.

---

# S1 — SUPPLIER MODEL

Supplier

Supplier Product

Supplier SKU

MOQ

Unit cost

Shipping cost

Lead time

Warehouse

Geography

Defect rate

Return rate

Reliability

API health

Payment terms

Private-label capability.

---

# S2 — SUPPLIER DISCOVERY

Connect legitimate supplier sources.

Store provenance.

Never treat generated supplier names as factual.

---

# S3 — SUPPLIER SCORING

Use:

landed cost

reliability

delivery speed

inventory consistency

returns

defects

geographic suitability

business terms

API reliability.

Price alone is insufficient.

---

# S4 — REDUNDANCY

Where viable:

Primary

Secondary

Emergency.

Product equivalence must be proven before failover.

---

# S5 — PROCUREMENT STATE MACHINE

DRAFT

PROPOSED

APPROVAL_REQUIRED

AUTHORIZED

SUBMITTED

ACKNOWLEDGED

PARTIALLY_FULFILLED

FULFILLED

CANCELLED

FAILED.

---

# S6 — PROCUREMENT FIREWALL

Before PO authorization evaluate:

available cash

protected reserve

committed cash

supplier exposure

inventory demand

forecast

MOQ

expected contribution

supplier risk

owner threshold.

---

# SUPPLIER CHECKPOINT

Prove one supplier flow:

discovery/import

→ evidence

→ scoring

→ PO proposal

→ deterministic authorization

→ supplier submission

→ acknowledgement

→ inventory impact

→ finance

→ audit.

---

# 9. FEATURE STREAM — FORECASTING & PRICING

---

# P1 — DEMAND FORECASTING

Inputs:

historical sales

seasonality

price

promotion

advertising

stockouts

lead time

market conditions.

Outputs:

point forecast

confidence interval

stockout probability

overstock probability

recommended reorder

capital requirement.

---

# P2 — UNIT ECONOMICS ENGINE

Per SKU calculate:

landed COGS

payment fees

channel fees

shipping

fulfillment

refund allowance

return allowance

advertising cost

contribution margin

break-even CAC

break-even ROAS.

---

# P3 — PRICE POLICY

Maintain:

hard floor

target price

recommended price

maximum logical price.

---

# P4 — PRICE EXPERIMENTS

Use controlled experiments.

Do not let AI infer success from tiny samples.

---

# 10. FEATURE STREAM — MULTICHANNEL

Only after Shopify is externally proven.

Recommended order:

WooCommerce

eBay

Amazon

Walmart

Etsy

TikTok Shop

Google Merchant

Meta commerce surfaces

regional marketplaces later.

Every connector declares capabilities explicitly.

Example:

READ_PRODUCT

WRITE_PRODUCT

READ_INVENTORY

WRITE_INVENTORY

READ_ORDER

FULFILL_ORDER

CREATE_REFUND

WRITE_PRICE

REGISTER_WEBHOOK.

Capability state must be visible.

---

# 11. FEATURE STREAM — MARKETING

Do not start with autonomous spend.

---

# M1 — MARKETING TRUTH MODEL

Campaign

Ad Group

Ad

Creative

Audience

Budget

Spend

Click

Conversion

Attribution

Revenue

Contribution.

---

# M2 — READ-ONLY CONNECTORS

Start with:

Google Ads

Meta Ads

TikTok Ads

where justified.

Import performance.

Reconcile.

---

# M3 — GUARDED WRITES

Add:

pause

budget update

campaign creation

creative update

one action at a time.

Each gets independent evidence.

---

# M4 — ADVERTISING FINANCIAL FIREWALL

Check:

daily cap

monthly cap

channel cap

campaign cap

experiment cap

available cash

product economics

attribution health.

If conversion tracking is unreliable:

autonomous scaling must stop.

---

# M5 — PROFIT OPTIMIZATION

Do not optimize platform ROAS alone.

Optimize settled contribution.

---

# 12. FEATURE STREAM — CUSTOMER & CRM

---

# CRM1 — UNIFIED CUSTOMER RECORD

Orders

Support

Returns

Consent

Campaign interaction

LTV

Lifecycle

Loyalty.

---

# CRM2 — SUPPORT

Allow agents access only to structured required context.

Routine:

tracking

product information

return eligibility

basic support.

Higher-risk:

large refund

legal threat

fraud

safety issue

chargeback

remain escalated.

---

# CRM3 — LIFECYCLE

Welcome

Abandonment

Post-purchase

Cross-sell

Replenishment

Review request

Win-back

VIP

Back-in-stock.

Consent must remain authoritative.

---

# 13. FEATURE STREAM — CREATORS & AFFILIATES

Later-stage growth layer.

Track:

Creator

Affiliate

Campaign

Offer

Coupon

Tracking link

Commission

Conversion

Payout

Fraud signals

ROI.

---

# 14. FEATURE STREAM — FINANCIAL OPERATING SYSTEM

HOTL requires a real financial truth layer before meaningful business autonomy.

---

# F1 — LEDGER

Track:

sales

discounts

refunds

returns

COGS

supplier expenses

shipping

fulfillment

payment fees

marketplace fees

advertising

affiliate commissions

chargebacks

tax

operating expenses.

---

# F2 — CASH

Track:

available cash

committed cash

protected reserve

pending payouts

supplier obligations

ad liabilities

refund exposure

tax reserve.

---

# F3 — RECONCILIATION

Reconcile:

store

marketplace

payment provider

supplier

advertising

shipping

bank/accounting systems when later connected.

Discrepancy becomes a first-class object.

---

# 15. PROGRAM GATE E — MEASURED AUTONOMY

Only after real operations generate trustworthy outcome data.

---

# E1 — OPPORTUNITY ENGINE

Detect:

product opportunity

supplier opportunity

pricing opportunity

inventory problem

ad opportunity

bundle opportunity

retention opportunity

market expansion.

Every opportunity includes:

evidence

expected value

capital

risk

confidence

reversibility.

---

# E2 — EXPERIMENT PLATFORM

Store:

hypothesis

control

variant

primary metric

guardrail metrics

sample size

duration

outcome

confidence

decision.

---

# E3 — DIGITAL TWIN

Model:

products

suppliers

inventory

channels

customers

campaigns

orders

cash

margins.

Use for scenarios, not authorization.

---

# E4 — SHADOW MODE

Candidate autonomous logic receives live-equivalent data.

It produces hypothetical decisions.

It executes nothing.

Compare:

predicted result

actual human/production action

actual business result.

---

# E5 — AGENT EVALUATION

Measure:

success rate

policy violation rate

economic impact

owner intervention rate

reversal rate

missed opportunity rate

latency

token/model cost

tool-call efficiency

stale-plan rate

false escalation

missed escalation.

---

# E6 — AUTONOMY PROMOTION

Use domain-specific progression:

L0 Observe

L1 Analyze

L2 Recommend

L3 Prepare

L4 Supervised execution

L5 Limited autonomy

L6 Domain autonomy

L7 Cross-domain autonomy.

A support agent might reach L6 while supplier purchasing remains L3.

That is expected.

---

# 16. MULTI-AGENT ORGANIZATION

Do not build dozens of agents prematurely.

Introduce agents only when the domain has:

clear responsibility

clear tools

clear authority

clear evaluation criteria.

Target executive organization later:

Commerce Orchestrator

CFO

COO

Growth/CMO

Merchandising

CX

Risk.

Potential specialist agents later:

Product Research

Supplier Discovery

Procurement

Inventory

Pricing

Advertising

Creative

CRM

Support

Returns

Fulfillment

Finance

Analytics.

---

# 17. AGENT TASK CONTRACT

Every task should eventually contain:

Task ID

Workspace

Objective

Owner Agent

Domain

Input evidence

Dependencies

Allowed tools

Forbidden tools

Budget

Relevant Constitution revision

Resource revisions

Risk classification

Expected output schema

Deadline if meaningful

Execution status

Result

Evidence

Audit reference.

---

# 18. HUMAN CONTROL CENTER

The cockpit eventually needs to answer:

What happened?

What changed?

What is profitable?

What is losing money?

What is HOTL doing?

Why?

What needs approval?

What is uncertain?

What is at risk?

What opportunity exists?

What happens next?

---

# 19. TARGET COCKPIT MODULES

Current:

Overview

Agents

Approvals

Products

Orders

Finance

Integrations

Autonomy

Guardrails

Activity.

Add only as backend capability becomes real:

Opportunities

Suppliers

Procurement

Inventory

Fulfillment

Returns

Customers

Support

Marketing

Advertising

Creatives

CRM

Experiments

Forecasts

Risk

Audit

Strategy.

Do not create empty “enterprise” pages merely for appearance.

---

# 20. OBSERVABILITY

Build continuously, not at the end.

Technical:

API latency

provider errors

webhook lag

queue lag

DB errors

workflow failures

LLM latency

model cost

dead letters

connector health.

Business:

revenue anomalies

margin anomalies

inventory anomalies

supplier anomalies

refund spikes

return spikes

ad anomalies

customer-support anomalies.

---

# 21. EVIDENCE PACKAGE STANDARD

Every major gate produces:

`evidence/<gate-or-checkpoint>/`

with:

README

date

environment

source commit

configuration summary

test results

failure tests

provider evidence

receipts

reconciliation

audit proof

restart proof

recovery proof

screenshots when useful

known limitations

No secrets.

---

# 22. ACCEPTANCE QUESTIONS FOR EVERY FEATURE

Do not call a major capability complete until all applicable answers are YES:

Is it implemented?

Is it connected to the real architecture?

Is the authoritative state owner clear?

Is it authenticated?

Is it authorized?

Is it idempotent?

Is it audited?

Is stale state rejected?

Does retry remain safe?

Does restart remain safe?

Does external state reconcile?

Can the owner interrupt it?

Can uncertainty be represented?

Is failure visible?

Can recovery be performed?

Was the real provider/test environment actually used where claimed?

Has autonomous authority been separately earned?

---

# 23. IMMEDIATE EXECUTION ORDER

From the September 24 repository state, the next work should be performed in this exact dependency order:

**1. Freeze and source-control the current trustworthy baseline.**

**2. Finalize the pilot business/risk envelope.**

**3. Finish required identity/hosted-staging prerequisites.**

**4. Connect an authorized Shopify development store.**

**5. Prove real OAuth.**

**6. Prove real read synchronization.**

**7. Prove real webhook registration and delivery.**

**8. Execute one real owner-confirmed guarded price mutation.**

**9. Resolve the read/write race.**

**10. Complete causality-safe uncertainty resolution.**

**11. Prove restart/retry/no-resend behavior externally.**

**12. Prove compensation.**

**13. Prove independent kill/revocation behavior.**

**14. Freeze this as the first external-commerce evidence checkpoint.**

**15. Build one supervised end-to-end commerce cycle.**

**16. Add supplier/procurement.**

**17. Add inventory, forecasting and pricing intelligence.**

**18. Add fulfillment, returns and customer support.**

**19. Add multichannel commerce.**

**20. Add advertising/customer acquisition.**

**21. Build authoritative finance/cash/reconciliation.**

**22. Add opportunity engine and experimentation.**

**23. Add shadow mode and agent evaluation.**

**24. Promote domains individually into measured autonomy.**

---

# 24. DO NOT PRIORITIZE YET

Do not spend major engineering effort yet on:

50+ agents

self-modifying AI

full digital twin

worldwide localization

native mobile app

agent marketplace

creator marketplace

hundreds of integrations

fully autonomous ads

fully autonomous procurement

complex “AI CEO” behavior

until the underlying commercial truth and evidence gates exist.

---

# 25. HOTL V1 DEFINITION

HOTL V1 should be declared only when:

A real merchant environment can be connected.

HOTL maintains trustworthy synchronized commerce state.

Supported consequential provider actions pass through deterministic guardrails.

Retries do not duplicate financial/public effects.

Ambiguous provider outcomes become visible locked states.

Owner intervention invalidates stale plans.

Orders, inventory, payments, fulfillment and refunds reconcile.

Supplier and marketing actions have bounded authority.

The financial layer can explain settled contribution with evidence.

The owner can immediately reduce autonomy or stop operations.

Routine verified operations can run under defined supervision limits.

Every consequential action is:

authenticated

authorized

idempotent

auditable

observable

reconcilable

recoverable.

---

# 26. HOTL V2+

After V1:

multi-brand

multi-store

international commerce

advanced supplier optimization

predictive inventory

advanced acquisition allocation

business digital twin

agentic commerce protocols

MCP commerce access

UCP support

A2A commerce integration

AI-shopping discovery

extension ecosystem

enterprise governance

native mobile control

more advanced cross-domain autonomy.

---

# 27. FINAL PRODUCT PRINCIPLE

HOTL should never become:

an unrestricted LLM with business credentials.

The intended system is:

**AI proposes and operates within bounded authority.**

**Deterministic systems enforce permissions and economic constraints.**

**External systems provide authoritative execution evidence.**

**The owner controls strategy, capital, limits and exceptions.**

**Autonomy expands only when evidence proves that expansion is justified.**