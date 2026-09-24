# HOTL — AUTONOMOUS COMMERCE OS

# PRODUCTION CONTINUATION MASTER PROMPT

You are taking ownership of an existing advanced software project named:

# HOTL Commerce OS

HOTL is an autonomous-commerce operating system intended to eventually operate most routine functions of a legitimate e-commerce company while allowing the human owner to inspect, interrupt, override, approve, constrain, or manually control every important business domain.

This is NOT a greenfield project.

This is NOT permission to rebuild the application.

This is NOT permission to throw away the current architecture because you prefer another stack.

Your responsibility is to inspect the entire existing repository, understand the implemented architecture and its invariants, identify the real remaining gaps, and continue building the existing system into a production-capable autonomous commerce operating system.

Do not ask me questions unless continuing is technically impossible.

When something is unspecified, investigate the repository, inspect current official documentation where external services are involved, make the strongest defensible engineering decision, document it, implement it, test it, and continue.

Work autonomously.

Do not stop at planning.

Do not return only an audit or recommendations.

Do not rebuild completed work.

Do not create fake success.

Do not weaken safety architecture for development convenience.

Your job is to IMPLEMENT, VERIFY, and ADVANCE HOTL.

---

# 0. CURRENT AUTHORITATIVE STATE

Before touching code, read completely:

* the current checkpoint/handoff document
* `docs/commerce-os-build-prompt.md`
* `docs/source-build-prompt.md`
* `docs/verification.md`
* `docs/postgres-runtime.md`
* `docs/infra-verification.md`
* architecture documentation
* ADRs
* package-level READMEs
* database migrations
* current tests
* current runbooks

Then inspect the complete repository.

Treat the current repository and latest checkpoint as ground truth.

Do not assume the original build prompt describes current implementation status.

---

# 1. CURRENT SYSTEM THAT MUST BE PRESERVED

HOTL already contains an architectural foundation including:

* pnpm/Turborepo TypeScript monorepo
* owner cockpit
* customer storefront
* commerce gateway
* deterministic guardrail service
* LangGraph orchestrator
* connector SDK
* independently deployable emergency kill switch
* Business Constitution
* five autonomy modes
* per-domain autonomy controls
* durable audit history
* idempotent mutation handling
* PostgreSQL runtime ledger
* connector credential protection
* Shopify integration foundation
* WooCommerce integration foundation
* LiteLLM-based model routing
* owner approvals
* stale-plan protection
* stale-approval protection
* persisted orchestration checkpoints
* simulation storefront
* financial evidence views
* responsive owner UI
* test infrastructure
* database durability tests

Do not casually replace these systems.

Improve them where evidence shows that improvement is necessary.

---

# 2. NON-NEGOTIABLE INVARIANTS

These are architecture-level rules.

They outrank agent convenience.

## 2.1 Every consequential mutation crosses the guardrail boundary

All actions that can alter:

* money
* products
* public listings
* advertising
* supplier orders
* inventory
* fulfillment
* refunds
* customer-visible state
* business policy
* autonomous authority

must pass through authenticated deterministic authorization.

An LLM decision is NEVER itself authorization.

---

# 2.2 Preserve owner authority

The human owner remains the ultimate authority.

The owner must always be able to:

* inspect
* approve
* reject
* edit
* pause
* resume
* override
* constrain
* manually execute
* reduce autonomy
* revoke access
* trigger emergency shutdown

Human edits outrank stale agent plans.

---

# 2.3 Fail closed

If required state is:

* missing
* stale
* corrupt
* inconsistent
* inaccessible
* unverifiable

the affected consequential operation must fail safely.

Never infer authorization.

Never manufacture missing state.

---

# 2.4 Kill switch remains independent

The independent emergency-stop system must remain outside the normal application authority path.

Do not introduce a normal application endpoint that defeats it.

Its:

* credentials
* journal
* persistence
* revocation authority

must remain isolated.

---

# 2.5 No credential leakage

Never expose:

* Shopify access tokens
* marketplace secrets
* advertising credentials
* supplier credentials
* payment credentials
* database privileged credentials
* LiteLLM master/admin credentials
* signing secrets
* encryption keys

to:

* browser code
* arbitrary agent context
* untrusted prompts
* logs
* analytics events

Agents receive scoped capabilities, not master credentials.

---

# 2.6 Preserve persistent state

Do not delete, reset, replace, or silently regenerate the existing durable state unless a specific migration requires it and a verified backup/restore procedure exists.

Protect existing:

* guardrail state
* orchestrator checkpoints
* kill-switch journal
* encrypted connector secrets
* PostgreSQL ledger
* audit history

Migrate state safely when schema changes are required.

---

# 2.7 Simulation and production evidence must remain separate

Never label something production-ready merely because simulation passed.

Never claim:

* live integration
* live payment
* live provider mutation
* production deployment
* revocation proof
* successful real OAuth
* live advertisement execution

unless that exact operation was executed against the intended environment and evidence was recorded.

---

# 3. IMMEDIATE OBJECTIVE

The next major milestone is:

# FIRST REAL GUARDED COMMERCE CLOSED LOOP

Do not expand HOTL horizontally across dozens of integrations before proving one provider deeply.

Use Shopify as the first primary provider unless repository evidence establishes a stronger technical reason otherwise.

Build and verify:

**Merchant installation**
↓
**OAuth**
↓
**secure token storage**
↓
**initial store sync**
↓
**webhook intake**
↓
**canonical commerce state**
↓
**agent observation**
↓
**agent proposal**
↓
**Business Constitution check**
↓
**deterministic guardrail authorization**
↓
**provider mutation**
↓
**provider response/receipt**
↓
**reconciliation**
↓
**durable audit**
↓
**owner-visible activity**
↓
**retry/compensation/recovery**

This must become a real end-to-end architecture.

---

# 4. PHASE A — REPOSITORY FORENSICS

Before implementation, inspect every important system.

Build an internal dependency map covering:

* apps
* packages
* services
* databases
* schemas
* connectors
* workflows
* tests
* infrastructure
* security boundaries
* state ownership
* event ownership
* authorization ownership

Identify:

* dead code
* duplicated abstractions
* architectural inconsistencies
* partial implementations
* TODO paths
* unsafe defaults
* weak error handling
* untested critical paths
* mock-only pathways
* misleading UI
* runtime assumptions
* stale documentation

Do not rewrite things simply for aesthetic preference.

Fix only where correctness, maintainability, reliability, security, extensibility, or UX materially improves.

---

# 5. PHASE B — COMPLETE PRODUCTION IDENTITY FOUNDATION

Finish the identity/authorization foundation required for real provider operation.

Implement and verify where not already complete:

* production owner authentication
* workspace identity
* tenant/workspace isolation
* RBAC
* scoped agent identities
* short-lived agent credentials
* service identities
* audience restrictions
* issuer validation
* token expiry
* token rotation
* API authorization boundaries
* server-side workspace binding

Do not rely on client-supplied workspace IDs as authority.

Test horizontal privilege escalation.

Test cross-workspace access.

Test stale tokens.

Test malformed tokens.

Test privilege reduction.

---

# 6. SHOPIFY OAUTH INSTALLATION

Implement a proper Shopify merchant installation flow using current official Shopify documentation.

Research the current API and authentication model first.

Do not use outdated assumptions.

Implement:

* install initiation
* anti-CSRF/state
* callback verification
* shop validation
* token exchange
* encrypted credential storage
* workspace ownership
* installation state
* granted scopes
* provider identity
* install timestamps
* reauthorization
* uninstall handling
* token invalidation
* credential rotation behavior

Never expose tokens to browser JavaScript.

Never store plaintext credentials in application-visible persistence.

---

# 7. SHOPIFY VERSIONING

Inspect current Shopify API version requirements.

The project currently targets Shopify Admin API 2026-07.

Verify whether that remains the appropriate version for the current implementation date.

If migration is needed:

* update contracts
* update GraphQL operations
* update tests
* update documentation
* document compatibility impact

Do not automatically upgrade merely because a newer version exists.

Use the strongest stable version consistent with production requirements.

---

# 8. SHOPIFY READ SYNC

Convert Shopify synchronization into a robust production-grade subsystem.

Support authoritative synchronization of relevant:

* products
* variants
* inventory
* locations
* orders
* fulfillment state
* customers only where justified
* product status
* prices
* metadata needed by HOTL

Map provider data into HOTL's canonical commerce model.

Maintain:

* external ID
* provider revision
* local revision
* observed-at time
* source
* freshness
* sync cursor
* sync status

Do not overwrite owner-modified simulation/local state accidentally.

Maintain explicit source ownership.

---

# 9. WEBHOOK SYSTEM

Implement production-grade Shopify webhook handling.

Requirements:

* HMAC verification
* strict payload validation
* persistent intake
* deduplication
* replay safety
* event IDs
* workspace resolution
* ordering strategy
* timestamps
* retry handling
* dead-letter handling
* observability

The HTTP webhook endpoint must acknowledge quickly.

Long workflows must execute asynchronously.

Do not perform complex commerce logic directly in webhook request handlers.

---

# 10. PROVIDER RECONCILIATION

Webhooks are signals, not unquestionable truth.

Build reconciliation jobs.

Compare:

HOTL state

against:

Shopify authoritative state.

Detect:

* missing events
* duplicated events
* stale state
* inventory mismatch
* price mismatch
* order mismatch
* listing mismatch

Maintain explicit reconciliation results.

Never silently overwrite inconsistencies without an audit trail.

---

# 11. FIRST REAL WRITE CAPABILITY

Implement only ONE deeply verified Shopify write path first.

Choose an operation that is:

* meaningful
* reversible where possible
* safe to stage
* representative of architecture

A strong candidate is:

# guarded product price update

Alternative operations may be selected if repository constraints make another operation more appropriate.

Required flow:

Owner/agent requests mutation.

↓

Current resource revision is loaded.

↓

Business Constitution is loaded.

↓

Relevant autonomy domain is checked.

↓

Actor authorization is checked.

↓

Economic guardrail is evaluated.

↓

Freshness is checked.

↓

Idempotency key is created.

↓

Mutation is authorized.

↓

Provider request executes.

↓

Provider receipt is stored.

↓

Provider state is re-read if necessary.

↓

Reconciliation validates outcome.

↓

HOTL canonical state updates.

↓

Audit record is appended.

↓

Owner activity feed updates.

No step may be bypassed by directly calling the Shopify client from an agent.

---

# 12. IDEMPOTENCY

Provider writes must survive retries.

Design idempotency around:

* workspace
* actor
* operation
* resource
* semantic request
* authorization context

Prevent:

* duplicate product updates
* duplicate refunds
* duplicate purchase orders
* duplicate campaign actions
* replayed stale approvals

Where a provider lacks native idempotency:

implement local durable operation state and reconciliation.

---

# 13. PROVIDER RECEIPTS

Every external mutation must generate a durable internal receipt containing as appropriate:

* request ID
* workspace
* provider
* operation
* target resource
* requested change
* pre-state
* authorization ID
* idempotency ID
* provider request reference
* provider response reference
* provider resource revision
* completion status
* reconciliation status
* created timestamp
* completed timestamp
* actor
* responsible agent
* audit reference

This receipt becomes evidence of external execution.

---

# 14. COMPENSATION

For reversible actions define compensating actions.

Example:

Price:

$50 → $55

Compensation:

$55 → $50

But compensation itself must pass fresh authorization.

Do not blindly restore old state if the owner changed the resource in between.

Use revisions/version checks.

---

# 15. STALE PLAN PROTECTION

Extend the existing stale-plan architecture everywhere.

Before execution verify:

* Business Constitution version
* domain autonomy version
* product revision
* provider revision
* approval validity
* budget availability
* resource ownership

If material state changed:

DO NOT execute the stale proposal.

Re-plan or return for approval.

---

# 16. PRODUCTION OUTBOX / INBOX

For consequential distributed operations introduce durable transactional messaging patterns where necessary.

Implement:

* event outbox
* event inbox
* durable consumer identity
* event deduplication
* retry state
* poison-message handling
* replay strategy

Avoid dual-write corruption.

State change + event publication intent should be transactional where practical.

---

# 17. WORKFLOW DURABILITY

Strengthen LangGraph orchestration.

Workflow execution must survive:

* process crash
* restart
* duplicate callback
* delayed provider response
* webhook replay
* model timeout
* worker failure
* partial provider success
* owner intervention
* policy change

Persist enough state to resume safely.

---

# 18. MODEL FAILURE MUST NOT BREAK COMMERCE

LLMs are advisory/planning components.

Critical deterministic operations should continue safely if the model is unavailable.

Agents must never become required to:

* verify signatures
* calculate simple totals
* enforce price floors
* enforce budgets
* verify permissions
* enforce idempotency
* validate schemas
* authorize refunds

These belong in deterministic code.

---

# 19. AFTER FIRST GUARDED WRITE — EXPAND SHOPIFY CAPABILITIES

Only after the first real mutation passes rigorous verification may you add additional writes.

Suggested progression:

1. product metadata update
2. product status/listing update
3. inventory adjustment where appropriate
4. promotion/discount operations
5. fulfillment-related operations
6. refund workflow

Each capability requires its own:

* permissions
* guardrail policy
* idempotency
* audit
* receipt
* tests
* staging evidence

Never enable write access merely because read support exists.

---

# 20. CONNECTOR CAPABILITY MATRIX

Make provider capabilities explicit.

Example capabilities:

READ_PRODUCTS
WRITE_PRODUCTS
READ_VARIANTS
WRITE_VARIANTS
READ_INVENTORY
WRITE_INVENTORY
READ_ORDERS
WRITE_ORDERS
FULFILL_ORDER
ISSUE_REFUND
READ_CUSTOMERS
READ_ANALYTICS
CREATE_PROMOTION
WRITE_PRICE
READ_WEBHOOKS
REGISTER_WEBHOOKS

Each connector must declare exactly what is implemented and verified.

Possible states:

UNSUPPORTED
IMPLEMENTED_UNVERIFIED
STAGING_VERIFIED
PRODUCTION_VERIFIED
DISABLED

Agents must never call capabilities that are not permitted.

---

# 21. GENERALIZE CONNECTOR SDK

Once Shopify works deeply, strengthen the connector SDK so other providers can implement the same architecture.

Canonical objects should evolve as needed around:

* Product
* Variant
* SKU
* Listing
* Price
* Inventory
* Location
* Customer
* Cart
* Checkout
* Order
* OrderLine
* Payment
* Refund
* Return
* Fulfillment
* Shipment
* Supplier
* PurchaseOrder
* Campaign
* Creative
* Promotion
* Transaction

Avoid provider-specific fields contaminating the entire domain model.

Use extension metadata where needed.

---

# 22. NEXT COMMERCE DOMAIN — SUPPLIER INTELLIGENCE

After the Shopify closed loop is proven, implement supplier operations.

Build:

## Supplier Discovery

Find legitimate compatible suppliers through authorized APIs/sources.

## Supplier Model

Track:

* supplier identity
* warehouse locations
* catalog
* SKUs
* MOQ
* cost
* shipping cost
* lead time
* historical reliability
* return performance
* defect signals
* fulfillment performance
* API reliability
* geography
* private-label ability
* payment terms
* risk

## Supplier Score

Do not select solely on lowest unit cost.

Use total landed economics and operational reliability.

## Supplier Redundancy

Allow:

* primary supplier
* secondary supplier
* emergency supplier

when practical.

---

# 23. SUPPLIER COMMUNICATION

Build structured supplier communication workflows.

AI may assist with:

* RFQs
* MOQ discussion
* pricing
* SLA discussion
* stock questions
* packaging
* lead time
* sample requests

Never fabricate:

* company size
* order volume
* existing contractual relationships
* customer commitments

Store communication history.

---

# 24. PURCHASE ORDER WORKFLOW

Create a durable purchase-order domain.

Suggested lifecycle:

DRAFT
PROPOSED
APPROVAL_REQUIRED
AUTHORIZED
SUBMITTED
ACKNOWLEDGED
PARTIALLY_FULFILLED
FULFILLED
CANCELLED
REJECTED
FAILED

Supplier purchases must respect:

* spend caps
* available cash
* margin economics
* supplier limits
* inventory forecast
* approval limits
* workspace rules

---

# 25. INVENTORY OPERATING SYSTEM

Build global inventory ownership.

Track inventory by:

* SKU
* supplier
* warehouse
* marketplace
* store
* region

Differentiate:

ON_HAND
AVAILABLE
RESERVED
INBOUND
DAMAGED
RETURNING
SUPPLIER_AVAILABLE

Prevent overselling.

Use reservations.

---

# 26. DEMAND FORECASTING

Implement a forecasting subsystem.

Inputs may include:

* historical sales
* seasonality
* product trend
* promotions
* price
* stockouts
* advertising
* market
* supplier lead time

Output:

* point forecast
* uncertainty range
* confidence
* recommended reorder
* stockout risk
* overstock risk

Do not make expensive procurement decisions from opaque LLM guesses.

Use statistical/ML forecasting where justified.

---

# 27. PRICING INTELLIGENCE

Build pricing as a dedicated domain.

For each sellable offer track:

* cost
* shipping
* marketplace fees
* payment fees
* expected returns
* expected refunds
* ad acquisition cost
* tax treatment
* minimum margin
* target margin
* current price
* recommended price

Calculate:

* gross margin
* contribution margin
* break-even CAC
* break-even ROAS

Pricing agents can recommend or execute according to autonomy rules.

---

# 28. MARKETPLACE LAYER

After Shopify is mature, progressively integrate:

* WooCommerce
* Amazon
* eBay
* Walmart Marketplace
* Etsy
* TikTok Shop
* Google Merchant
* additional channels justified by demand

Research current official APIs before implementation.

Do not build imaginary adapters.

Each provider gets:

* authentication
* capability matrix
* canonical mapping
* webhooks/polling
* reconciliation
* write guardrails
* observability
* tests

---

# 29. GLOBAL LISTING SYSTEM

Create canonical listings separated from canonical products.

A Product is not the same thing as a marketplace Listing.

Model:

Product
→ Variant
→ Offer
→ Listing
→ Channel

Track:

* title
* description
* attributes
* price
* inventory
* status
* policy status
* provider ID
* listing quality
* validation errors

---

# 30. FULFILLMENT

Build fulfillment orchestration after supplier/order fundamentals exist.

Potential fulfillment sources:

* merchant warehouse
* supplier direct fulfillment
* 3PL
* marketplace fulfillment

Routing decisions consider:

* availability
* cost
* shipping SLA
* geography
* supplier reliability
* inventory
* margin

Never send fulfillment instructions without deterministic authorization.

---

# 31. SHIPPING EXCEPTIONS

Build event-driven exception workflows:

* shipment not accepted
* no movement
* customs delay
* failed delivery
* wrong address
* lost package
* return-to-sender
* damaged delivery

Allow automated customer communication within policy.

Escalate exceptional cases.

---

# 32. RETURNS AND REFUNDS

Separate:

return approval
return logistics
refund authorization
refund execution

Create explicit state machines.

Refunds require:

* amount verification
* payment verification
* order verification
* previous refund verification
* policy check
* threshold check
* fraud consideration
* idempotency

Never permit duplicate refund execution.

---

# 33. CUSTOMER SUPPORT

Build omnichannel support only after order truth is reliable.

The support agent should access a safe structured customer context:

* order history
* shipment
* approved product knowledge
* support history
* policy
* return eligibility

Never give support agents unrestricted backend access.

---

# 34. MARKETING FOUNDATION

Do not jump directly into autonomous advertising.

First create canonical marketing objects:

Campaign
AdSet/Group
Ad
Creative
Audience
Budget
Spend
Attribution
Conversion
Experiment

Separate:

planning
authorization
execution
measurement

---

# 35. ADVERTISING CONNECTORS

Progressively integrate supported current APIs for:

* Google Ads
* Meta Ads
* TikTok Ads
* marketplace advertising systems

For every advertising integration:

* OAuth/authentication
* scoped permissions
* campaign read
* performance read
* controlled writes
* budget limits
* reconciliation
* rate limits
* audit
* provider receipts

No agent can arbitrarily increase spend.

---

# 36. ADVERTISING FINANCIAL FIREWALL

Before creating or modifying spend:

check:

* daily business spend
* monthly spend
* campaign cap
* channel cap
* product cap
* experiment cap
* available cash
* contribution margin
* attribution quality
* conversion tracking health

If tracking is broken:

prevent uncontrolled scaling.

If spend accelerates unexpectedly:

trigger a circuit breaker.

---

# 37. PROFIT-FIRST OPTIMIZATION

Do not optimize exclusively for platform ROAS.

Build contribution-profit measurement.

Conceptually:

Revenue

* discounts
* COGS
* shipping
* marketplace fees
* payment fees
* advertising
* returns
* refunds
* affiliate commissions
* attributable fulfillment costs
  =
  Contribution Profit

Make this a central optimization signal.

---

# 38. CRM AND RETENTION

Create customer lifecycle infrastructure.

Support connectors to appropriate providers rather than duplicating everything unnecessarily.

Model:

* customer
* segment
* consent
* lifecycle state
* campaign history
* purchase history
* predicted LTV
* churn risk

Build workflows:

* welcome
* cart recovery
* post-purchase
* cross-sell
* replenishment
* review request
* win-back
* VIP

Respect communication consent.

---

# 39. CREATIVE INTELLIGENCE

Build a creative evidence system.

Track:

* image/video
* hook
* headline
* body
* CTA
* audience
* offer
* landing page
* campaign
* spend
* conversion
* profit

Detect:

* creative fatigue
* successful angles
* poor claims
* audience saturation

Creative generation should be informed by performance data.

---

# 40. CREATOR / AFFILIATE SYSTEM

Eventually support:

* creator discovery
* affiliate programs
* codes
* links
* commissions
* creator performance
* fraud signals
* gifting
* contracts/workflows

Respect disclosure and advertising rules.

---

# 41. FINANCIAL TRUTH LAYER

Build a trustworthy financial ledger.

Track:

* sales
* discounts
* refunds
* returns
* payment fees
* platform fees
* COGS
* supplier purchases
* fulfillment
* shipping
* ad spend
* affiliate commissions
* chargebacks

Never equate revenue with profit.

Explicitly label estimated values.

---

# 42. CASH OPERATING MODEL

Model:

* available cash
* committed cash
* expected payouts
* supplier obligations
* ad obligations
* refund exposure
* tax reserves
* inventory commitments

Agents may not deploy money already committed elsewhere.

---

# 43. DIGITAL TWIN

Once trustworthy operational data exists, build HOTL's business digital twin.

Represent:

* channels
* products
* suppliers
* inventory
* customers
* campaigns
* orders
* logistics
* cash
* margins

Use it for scenario analysis.

Example:

“What if price decreases 7%?”

“What if CAC rises 20%?”

“What if supplier A fails?”

“What if we increase Meta spend by $2,000/day?”

“What if we launch Germany?”

Keep simulations visibly distinct from actual commitments.

---

# 44. SHADOW AUTONOMY

Before giving agents more power, implement domain-level shadow mode.

The candidate decision system should:

observe
plan
predict
record hypothetical action
record predicted result

but NOT execute.

Compare its hypothetical decisions with actual outcomes.

Use shadow results to evaluate whether expanded autonomy is justified.

---

# 45. AGENT EVALUATION SYSTEM

Do not evaluate agents by how convincing their text sounds.

Track:

* success rate
* economic outcome
* policy violations
* stale decisions
* owner overrides
* reversals
* latency
* token cost
* unnecessary tool calls
* false escalations
* missed escalations

Maintain per-agent evaluation history.

---

# 46. OPPORTUNITY ENGINE

Build a proactive opportunity engine.

Examples:

* promising new product
* abnormal organic growth
* supplier cost improvement
* underpriced product
* poor-performing supplier
* ad scaling opportunity
* stockout risk
* marketplace expansion
* retention opportunity
* bundle opportunity
* geographic opportunity

Each opportunity needs:

* evidence
* expected value
* confidence
* required capital
* risk
* reversibility
* proposed next action

---

# 47. AGENT ORGANIZATION

Gradually evolve orchestration into a coordinated digital commerce organization.

Potential executive agents:

* Commerce Orchestrator
* CFO
* COO
* Growth/CMO
* Merchandising Lead
* CX Lead
* Risk/Compliance Lead

Specialists operate under domain ownership.

Never allow dozens of agents to modify shared resources independently.

Each consequential resource should have clear ownership.

---

# 48. STRUCTURED AGENT TASKS

Every agent task should include:

* task ID
* objective
* owner
* business context
* dependencies
* allowed capabilities
* forbidden capabilities
* budget
* policy revision
* required evidence
* risk
* deadline where relevant
* expected output schema
* execution status

Use typed messages.

Do not use free-form inter-agent chat as the primary control protocol.

---

# 49. AGENT CONFLICTS

Resolve conflicts using hierarchy:

Business Constitution
↓
Owner decision
↓
Risk rules
↓
Financial constraints
↓
Executive objective
↓
Domain ownership
↓
Specialist recommendation

Record meaningful disagreements.

Do not let agent voting override hard policy.

---

# 50. GLOBAL COMMAND CENTER

Upgrade HOTL's owner cockpit into a real operating command center.

It should answer immediately:

* What is happening?
* What changed?
* What is profitable?
* What is losing money?
* What is the AI doing?
* Why?
* What requires me?
* What risks exist?
* What opportunities exist?
* What happens next?

---

# 51. MAIN COCKPIT MODULES

Progress toward a coherent set such as:

Overview

Command Center

Agents

Approvals

Opportunities

Products

Research

Suppliers

Procurement

Inventory

Stores

Marketplaces

Orders

Fulfillment

Customers

Support

Returns

Marketing

Advertising

Creatives

CRM

Affiliates

Finance

Experiments

Integrations

Autonomy

Guardrails

Risk

Audit

Activity

Settings

Do not add empty navigation items.

A module should appear only when meaningful functionality exists or is clearly labeled unavailable.

---

# 52. AI ACTIVITY FEED

Every autonomous action should produce a human-readable event.

Example:

“Pricing Agent proposed increasing SKU-381 from $42 to $45 because supplier cost rose 6%, conversion remained stable, and projected contribution margin would otherwise fall below policy.”

Display:

* agent
* action
* reason
* evidence
* expected impact
* actual result when available
* risk
* authorization
* time
* affected resource
* rollback/compensation availability

Do not expose hidden chain-of-thought.

Expose concise decision rationale.

---

# 53. APPROVAL CENTER

Build a strong approval UX.

Approvals should show:

* requested action
* reason
* financial impact
* current value
* proposed value
* risk
* relevant rule
* requesting agent
* expiration
* revision
* affected resource

Allow:

Approve

Reject

Modify

Open resource

Open evidence

Never allow an old approval to apply to materially changed state.

---

# 54. AUTONOMY CONTROL

Preserve the five autonomy modes:

MANUAL

COPILOT

SUPERVISED

AUTONOMOUS

CUSTOM

Apply autonomy independently by domain.

Examples:

Pricing: Autonomous

Advertising: Supervised

Refunds: Copilot

Supplier purchasing: Manual

Support: Autonomous up to configured limit

---

# 55. COMMAND PALETTE

Eventually support owner commands such as:

“Show everything losing contribution profit.”

“Find alternative suppliers for this SKU.”

“Pause campaigns with broken conversion tracking.”

“Put refunds above $100 into manual approval.”

“Why did profit fall yesterday?”

“Which products are at risk of stocking out?”

“Move advertising to supervised mode.”

Translate natural language into typed plans.

Never execute unsafe intent directly from raw generated text.

---

# 56. UI QUALITY

Preserve the existing functional UI and progressively improve it.

Target:

premium enterprise control system

not:

AI gimmick dashboard.

Use:

* strong hierarchy
* dense but readable layouts
* proper tables
* good filtering
* meaningful charts
* excellent empty states
* error states
* loading states
* mobile support
* accessibility
* keyboard navigation
* dark/light themes

Avoid decorative complexity with no operational value.

---

# 57. OBSERVABILITY

Add production observability.

Technical metrics:

* API errors
* provider latency
* webhook backlog
* queue depth
* database health
* workflow failures
* connector failures
* LLM latency
* token cost
* retries
* dead letters

Business metrics:

* revenue
* contribution profit
* CAC
* AOV
* returns
* refunds
* stockouts
* supplier failures
* fulfillment delays
* advertising anomalies

---

# 58. CONNECTOR HEALTH

Expose states such as:

CONNECTED
DEGRADED
AUTH_REQUIRED
RATE_LIMITED
OUTAGE
DISCONNECTED

Show:

* last sync
* last successful mutation
* credential health
* webhook health
* sync lag
* rate-limit state
* recent errors

---

# 59. AUDIT QUALITY

The audit system should support reconstructing:

WHO

WHAT

WHEN

WHY

AUTHORIZATION

INPUT STATE

OUTPUT STATE

PROVIDER RECEIPT

WORKFLOW

AGENT

OWNER ACTION

Do not silently modify historical audit records.

---

# 60. SECURITY REVIEW

Continuously inspect for:

* SSRF
* credential exposure
* XSS
* CSRF
* SQL injection
* broken authorization
* IDOR
* path traversal
* webhook spoofing
* replay attacks
* insecure logging
* insecure direct provider access
* prompt injection
* unsafe tool authorization
* dependency vulnerabilities

Create regression tests when fixing security issues.

---

# 61. PROMPT-INJECTION DEFENSE

Everything from outside HOTL should be considered untrusted:

* customer messages
* supplier content
* websites
* reviews
* product descriptions
* emails
* marketplace content
* documents

External instructions must never override:

* system policy
* Business Constitution
* owner rules
* tool permissions
* financial controls

Agent tools must be authorized structurally, not based solely on model interpretation.

---

# 62. TESTING STANDARD

Maintain and expand:

* lint
* static type checks
* unit tests
* integration tests
* database tests
* connector contract tests
* workflow tests
* browser tests
* security tests
* restart tests
* idempotency tests
* concurrency tests
* failure injection
* migration tests

Never reduce existing coverage simply to make a build green.

---

# 63. FAILURE TESTS

Explicitly test scenarios including:

* duplicate webhook
* webhook reorder
* Shopify timeout
* Shopify 429
* Shopify partial response
* OAuth expiration
* credential revocation
* stale owner edit
* stale agent plan
* duplicated mutation request
* guardrail outage
* orchestrator crash
* PostgreSQL restart
* queue restart
* LiteLLM outage
* malformed model output
* kill switch engaged
* owner pause during workflow
* policy change immediately before execution

---

# 64. RESTORE DRILLS

Complete documented restoration for:

* file ledger
* PostgreSQL state
* audit state
* orchestrator checkpoints
* independent kill journal

A backup that has never been restored is not proven.

Record restoration evidence.

---

# 65. DEVELOPMENT RULE — NO FAKE PRODUCTION

Do not pretend integrations work.

When credentials are unavailable:

build the real implementation architecture.

Use official:

* sandbox
* test store
* development account
* test API

when available.

Clearly state what cannot be verified.

Never create fake provider receipts and then call the feature production-ready.

---

# 66. RESEARCH RULE

Before touching any external platform integration, inspect its CURRENT official documentation.

Confirm:

* authentication
* current API version
* scopes
* rate limits
* webhooks
* pagination
* mutations
* idempotency
* sandbox/development support
* review requirements
* app approval requirements
* deprecations

Never invent API behavior.

---

# 67. DOCUMENTATION

Keep documentation synchronized with reality.

Update:

* architecture
* provider capabilities
* environment variables
* setup
* runbooks
* migrations
* deployment
* safety
* testing
* recovery
* known limitations

Remove misleading stale documentation.

---

# 68. EVIDENCE SYSTEM

Create a clear verification ledger.

For major capabilities record:

CAPABILITY

ENVIRONMENT

DATE

BUILD/COMMIT

TEST

RESULT

ARTIFACT

STATUS

Example statuses:

NOT_IMPLEMENTED

IMPLEMENTED_UNVERIFIED

LOCAL_VERIFIED

STAGING_VERIFIED

PRODUCTION_VERIFIED

Do not collapse them into a generic “done.”

---

# 69. PRODUCTION GATES

HOTL must NOT be declared production autonomous until the relevant domains prove:

* authentication
* authorization
* provider credential isolation
* durable state
* external receipt handling
* idempotency
* reconciliation
* audit
* restart recovery
* backup/restore
* revocation
* kill-switch independence
* observability
* economic guardrails
* owner override
* live/staging provider evidence as applicable

---

# 70. NO PREMATURE FULL AUTONOMY

A domain may be configured as AUTONOMOUS only when its underlying capability is implemented and verified.

Configuration must NEVER create capabilities.

If supplier purchasing is not verified:

the UI cannot make it real merely by selecting Autonomous.

Fail closed.

---

# 71. BUILD ORDER

Follow dependency order.

Recommended sequence:

## Stage 1

Repository audit and stabilization.

## Stage 2

Production identity and workspace isolation.

## Stage 3

Shopify OAuth and token lifecycle.

## Stage 4

Shopify durable sync + webhooks + reconciliation.

## Stage 5

First guarded Shopify write.

## Stage 6

Provider receipts + compensation + failure testing.

## Stage 7

Additional guarded Shopify capabilities.

## Stage 8

Supplier intelligence + procurement.

## Stage 9

Inventory + forecasting + pricing.

## Stage 10

Fulfillment + shipping + returns.

## Stage 11

Marketplace expansion.

## Stage 12

Customer support + CRM.

## Stage 13

Advertising + attribution + creative intelligence.

## Stage 14

Finance + cash model.

## Stage 15

Opportunity engine + digital twin.

## Stage 16

Shadow autonomy + evaluation.

## Stage 17

Measured expansion of autonomous authority.

Do not skip lower-level truth systems in order to create impressive agent demos.

---

# 72. ENGINEERING PHILOSOPHY

Prefer:

deterministic systems for deterministic problems.

Use AI where judgment adds value.

Examples:

Use code for:

* money math
* budget limits
* permissions
* idempotency
* signatures
* state transitions
* schema validation
* authorization

Use AI for:

* product research
* summarization
* supplier analysis
* creative development
* strategic planning
* support understanding
* opportunity discovery
* qualitative tradeoff analysis

Never use an LLM simply because this is an AI product.

---

# 73. ECONOMIC SAFETY

Every financial decision must understand:

* cash
* margin
* existing commitments
* refund exposure
* advertising exposure
* supplier exposure

Implement hard:

* daily limits
* monthly limits
* domain limits
* transaction limits
* refund limits
* supplier caps
* experiment-loss caps
* minimum reserves

Agents cannot override hard limits.

---

# 74. BUSINESS SUCCESS METRICS

Eventually HOTL should optimize legitimate commerce based on measurable outcomes such as:

* contribution profit
* sustainable revenue
* customer lifetime value
* fulfillment quality
* return rate
* customer satisfaction
* working-capital efficiency
* inventory turnover
* supplier reliability

Do not optimize vanity metrics at the expense of business economics.

---

# 75. OWNER EXPERIENCE

HOTL should evolve toward:

AI handles normal operations.

Owner handles:

* strategy
* exceptions
* capital allocation
* major risk
* major supplier relationships
* policy
* high-impact approvals

The owner should not have to supervise every ordinary event.

But the owner must always be capable of drilling into what happened.

---

# 76. CRITICAL DIFFERENTIATOR

HOTL is NOT:

another dropshipping dashboard.

HOTL is NOT:

another Shopify plugin.

HOTL is NOT:

a chatbot sitting beside an admin panel.

HOTL is:

# A UNIFIED AUTONOMOUS COMMERCE OPERATING SYSTEM.

Products understand suppliers.

Pricing understands costs.

Advertising understands margins.

Inventory understands demand.

Fulfillment understands customer promises.

Finance understands every domain.

Agents operate from shared business truth.

---

# 77. DEFINITION OF DONE FOR THE NEXT MAJOR MILESTONE

Do not claim the next milestone complete until HOTL can demonstrate:

1. A real authorized merchant can install/connect Shopify in the intended staging/development environment.

2. Credentials are securely stored.

3. HOTL reads actual merchant commerce state.

4. Webhooks update/reconcile state.

5. A supported AI or human request creates a typed proposal.

6. The Business Constitution evaluates it.

7. Guardrails deterministically authorize/reject it.

8. An authorized Shopify write executes.

9. Retry does not duplicate the operation.

10. Provider evidence/receipt is recorded.

11. Provider state is reconciled.

12. Audit records the complete mutation.

13. Cockpit displays the action.

14. Owner intervention invalidates stale plans.

15. Relevant rollback/compensation is tested.

16. Restart does not corrupt the operation.

17. Kill switch prevents further consequential execution.

18. Existing tests remain green.

19. New tests cover the new capability.

20. Documentation and verification evidence are updated.

This milestone matters more than adding another twenty mock integrations.

---

# 78. FINAL EXECUTION INSTRUCTION

Start by inspecting the current HOTL repository and checkpoint.

Do not ask me what to do next.

Determine the current gap between repository reality and this continuation specification.

Create the dependency-aware execution order internally.

Then begin implementing.

Continue through as much of the ordered program as the environment genuinely permits.

For each subsystem:

inspect
↓
research current official APIs when needed
↓
design
↓
implement
↓
integrate
↓
test
↓
failure-test
↓
document
↓
record evidence
↓
continue

Do not stop because one external dependency cannot be verified.

Complete all independent work that can safely be completed, clearly distinguish verified from unverified behavior, and move to the next non-blocked dependency.

Do not replace working architecture with speculative redesign.

Do not manufacture success.

Do not remove safety controls.

Do not weaken owner authority.

Do not expose secrets.

Do not reset preserved state.

Do not return a giant planning document instead of modifying the repository.

Your output is the improved working HOTL system.

---

# 79. FINAL REPORT FORMAT

Only after completing the implementation work, return a concise engineering report containing:

## EXECUTIVE RESULT

What is now actually operational.

## IMPLEMENTED

Concrete features and architecture added.

## CHANGED

Important existing systems modified.

## VERIFIED

Tests and drills actually executed.

Include real counts where known.

## REAL EXTERNAL EVIDENCE

Which provider/infrastructure interactions were actually executed.

## UNVERIFIED

Anything implemented but not proven against its intended external environment.

## SAFETY STATUS

Guardrails, kill switch, authorization, audit, idempotency, credential protection and recovery status.

## REMAINING BLOCKERS

Only genuine remaining blockers.

## NEXT DEPENDENCY

The single highest-value next engineering milestone.

## REPOSITORY STATE

Commit/hash if applicable and whether the working tree is clean.

Do not claim completion for work that has not actually been performed.

---

# 80. END STATE

The long-term HOTL target is:

The owner connects stores, marketplaces, suppliers, fulfillment, advertising, payments and customer systems.

The owner establishes goals and Business Constitution rules.

HOTL continuously:

observes the business
researches opportunities
finds products
evaluates suppliers
manages sourcing
controls inventory
optimizes prices
operates listings
acquires customers
manages campaigns
coordinates fulfillment
supports customers
handles routine returns
tracks finances
forecasts outcomes
detects risk
identifies growth
learns from results

while deterministic systems enforce:

authority
economic limits
security
integrity
auditability
recovery

and the human owner retains the ability to intervene in any business domain at any time.

That is the system you are continuing to build.

Begin from the current HOTL repository.

Preserve what is proven.

Strengthen what is weak.

Implement what is missing.

Verify what you claim.

Continue the system toward real autonomous commerce.
