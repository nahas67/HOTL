# MASTER PROMPT — BUILD THE AUTONOMOUS COMMERCE OPERATING SYSTEM

You are not being hired to build a conventional e-commerce dashboard.

You are acting simultaneously as:

* Principal Software Architect
* Principal AI/Agent Architect
* E-Commerce Systems Expert
* Marketplace Integration Engineer
* Supply-Chain Architect
* Growth and Performance Marketing Engineer
* Data Engineer
* ML Engineer
* MLOps Engineer
* Security Engineer
* FinOps Engineer
* UX/Product Design Lead
* Payments Architect
* Customer Experience Architect
* Reliability Engineer
* SaaS Platform Architect
* Product Strategist
* Automation Engineer
* QA Lead

Your mission is to design and build a production-grade **Autonomous Commerce Operating System** capable of operating an e-commerce business from end to end while preserving complete human control whenever the owner chooses to intervene.

For the purposes of this specification call the platform:

# [PROJECT_NAME]

The name must be globally replaceable and configurable.

---

# 1. PRODUCT VISION

Build an AI-native commerce platform capable of connecting to stores, marketplaces, suppliers, fulfillment networks, advertising networks, payment systems, CRM platforms, shipping providers, analytics services, communication systems, creator/affiliate networks and emerging agentic-commerce ecosystems.

The system should be capable of operating an entire commerce business:

**Discover → Research → Source → Validate → Negotiate → Import → Merchandise → Price → Publish → Market → Acquire Customers → Sell → Fulfill → Support → Retain → Analyze → Optimize → Scale**

without requiring continuous human involvement.

The owner must nevertheless retain absolute control and visibility.

The platform should behave more like an experienced operating company than an automation script.

Do not build a collection of disconnected AI chatbots.

Build a coordinated **digital commerce organization**.

---

# 2. FUNDAMENTAL PRODUCT PRINCIPLE

The system has two equally important capabilities:

## Autonomous operation

The AI can independently operate the business inside owner-defined policies, financial limits, permissions and strategic goals.

## Complete human control

At any moment the owner can:

* observe
* inspect reasoning
* modify decisions
* pause execution
* approve/reject actions
* edit workflows
* control individual agents
* control integrations
* manually execute actions
* override pricing
* change suppliers
* adjust inventory
* edit advertising
* communicate with customers
* issue refunds
* change budgets
* alter goals
* take full manual control
* resume autonomy later

Human intervention must never corrupt the agent state.

The AI must recognize human actions and re-plan around them.

---

# 3. AUTONOMY MODES

Implement granular autonomy rather than one global ON/OFF toggle.

Support at minimum:

### MANUAL

The platform behaves like an advanced commerce management suite.

AI analyzes and recommends but executes nothing automatically.

### COPILOT

AI prepares actions and the owner chooses whether to execute them.

### SUPERVISED AUTONOMY

Routine low-risk actions execute automatically.

Higher-risk actions enter an approval queue.

### FULL AUTONOMY

Agents operate independently within the Business Constitution, authorization scopes and financial limits configured by the owner.

### CUSTOM

Autonomy is configurable independently for:

* sourcing
* supplier contact
* catalog management
* pricing
* promotions
* advertising
* content generation
* influencer programs
* SEO
* email
* SMS
* customer support
* refunds
* order management
* fulfillment
* purchasing
* inventory
* finance
* marketplace expansion
* experimentation

The owner might therefore run autonomous pricing but manual advertising, or autonomous support but supervised supplier purchasing.

---

# 4. BUSINESS CONSTITUTION

Create a persistent machine-readable Business Constitution.

This is the highest-level operating policy governing every agent.

Allow the owner to configure things such as:

* business goals
* target revenue
* target contribution margin
* minimum gross margin
* minimum net margin
* maximum CAC
* target ROAS
* target MER
* inventory exposure
* maximum daily advertising spend
* maximum monthly advertising spend
* maximum supplier purchase
* maximum autonomous transaction
* minimum cash reserve
* maximum refund amount
* maximum discount
* permitted countries
* prohibited countries
* prohibited product categories
* brand rules
* supplier quality thresholds
* shipping-time thresholds
* return-rate limits
* chargeback thresholds
* customer satisfaction targets
* risk tolerance
* experimentation budget
* maximum acceptable experiment loss
* allowable advertising platforms
* acceptable supplier regions
* sustainability preferences
* privacy requirements
* legal/compliance constraints
* owner-defined hard rules

Hard rules cannot be overridden by normal agents.

Changes to the Business Constitution must be versioned and auditable.

---

# 5. MULTI-AGENT ORGANIZATION

Build a hierarchical multi-agent company.

Do not create dozens of agents that independently modify the same resources.

Implement clear ownership and coordination.

## Executive Layer

### CEO / Commerce Orchestrator Agent

Maintains the company objective.

Reads business performance.

Determines priorities.

Delegates objectives.

Resolves conflicts.

Creates operating plans.

Does not directly micromanage low-level API actions.

### CFO Agent

Owns:

* profitability
* contribution margin
* cash flow
* budgets
* spending constraints
* financial forecasts
* unit economics
* supplier cost analysis
* advertising economics
* inventory capital
* risk exposure

### COO Agent

Owns operational execution:

* orders
* fulfillment
* supplier operations
* inventory
* logistics
* returns
* exceptions

### CMO / Growth Agent

Owns:

* acquisition
* advertising
* lifecycle marketing
* promotions
* creators
* affiliates
* SEO
* organic marketing
* growth experiments

### Chief Merchandising Agent

Owns:

* product portfolio
* categories
* assortment
* pricing strategy
* merchandising
* bundles
* upsells
* cross-sells

### CX Agent

Owns:

* customer communications
* support
* satisfaction
* returns
* customer retention signals

### Risk & Compliance Agent

Owns:

* platform policy compliance
* supplier risk
* fraud
* suspicious behavior
* product restrictions
* IP/trademark risk
* advertising claims
* privacy rules
* escalation

---

# 6. SPECIALIST AGENTS

Create specialist workers underneath the executive layer.

Examples:

Product Discovery Agent
Trend Intelligence Agent
Competitor Intelligence Agent
Market Research Agent
Product Validation Agent
Supplier Discovery Agent
Supplier Due-Diligence Agent
Supplier Negotiation Agent
Procurement Agent
Inventory Planning Agent
Demand Forecasting Agent
Catalog Agent
SEO Agent
Copywriting Agent
Creative Agent
Image/Video Creative Agent
Pricing Agent
Promotion Agent
Marketplace Agent
Google Shopping Agent
Paid Search Agent
Paid Social Agent
Organic Social Agent
Influencer Agent
Affiliate Agent
CRM Agent
Retention Agent
Email Agent
SMS Agent
Conversion Optimization Agent
Experimentation Agent
Customer Support Agent
Returns Agent
Fraud Agent
Fulfillment Agent
Shipping Agent
Finance Agent
Accounting Reconciliation Agent
Analytics Agent
Forecasting Agent
Localization Agent
International Expansion Agent
Reputation Agent
Policy Monitoring Agent
Integration Health Agent

Use specialists only when useful.

Agents must not exist merely because the architecture diagram looks impressive.

---

# 7. AGENT COORDINATION

Create a real orchestration system.

Every agent task must have:

* task ID
* business objective
* requested outcome
* owner agent
* dependencies
* relevant context
* constraints
* financial budget
* permissions
* deadline
* confidence
* expected impact
* risk score
* execution status
* result
* evidence
* rollback information

Agents communicate through structured typed messages.

Do not rely on free-form chat as the system's control plane.

---

# 8. AGENT CONFLICT RESOLUTION

Define hierarchy.

Business Constitution
↓
Human owner
↓
Risk constraints
↓
Executive strategy
↓
Domain owner
↓
Specialist agents

When agents disagree, calculate the expected business impact using:

* revenue
* margin
* cash requirement
* customer experience
* inventory risk
* platform risk
* supplier risk
* long-term value
* confidence
* reversibility

Record disagreements.

The system must explain why one strategy was selected.

---

# 9. EVENT-DRIVEN BUSINESS BRAIN

Do not implement autonomy as an infinite LLM loop.

Build an event-driven orchestration architecture.

Events should include:

ORDER_CREATED
ORDER_CANCELLED
PAYMENT_FAILED
PAYMENT_SUCCEEDED
PRODUCT_TRENDING
PRODUCT_MARGIN_CHANGED
SUPPLIER_PRICE_CHANGED
SUPPLIER_STOCK_CHANGED
DELIVERY_DELAYED
INVENTORY_LOW
INVENTORY_EXCESS
AD_PERFORMANCE_CHANGED
CAC_SPIKE
ROAS_DROP
CONVERSION_RATE_DROP
RETURN_REQUESTED
CHARGEBACK_CREATED
CUSTOMER_COMPLAINT
COMPETITOR_PRICE_CHANGED
PRODUCT_POLICY_WARNING
MARKETPLACE_LISTING_REJECTED
REVIEW_RECEIVED
CREATIVE_FATIGUE_DETECTED
CASH_RESERVE_WARNING
FORECAST_CHANGED
INTEGRATION_FAILED

Events trigger workflows and agent tasks.

Use durable workflows with:

* retries
* idempotency
* timeout management
* dead-letter queues
* compensation logic
* recovery after crashes
* resumability

---

# 10. COMMERCE CONNECTOR PLATFORM

Do not hardwire the application around Shopify.

Create a canonical commerce domain model.

Canonical resources should include:

Store
Channel
Marketplace
Product
Variant
SKU
Listing
Offer
Price
Inventory
Warehouse
Customer
Lead
Segment
Cart
Checkout
Order
OrderItem
Payment
Refund
Return
Shipment
Supplier
PurchaseOrder
Campaign
Ad
Creative
Affiliate
Creator
Promotion
Coupon
Review
SupportTicket
Transaction
LedgerEntry
Tax
Experiment

Every external connector translates between external schemas and these canonical models.

---

# 11. CONNECTOR SDK

Create a developer SDK so new platforms can be integrated without changing core orchestration.

Each connector declares capabilities such as:

READ_PRODUCTS
WRITE_PRODUCTS
READ_ORDERS
WRITE_ORDERS
READ_CUSTOMERS
READ_INVENTORY
WRITE_INVENTORY
WRITE_PRICE
CREATE_DISCOUNT
CREATE_REFUND
FULFILL_ORDER
CREATE_SHIPMENT
READ_ANALYTICS
CREATE_AD
READ_AD_PERFORMANCE

Automatically detect unavailable capabilities.

Agents must never assume every platform supports every action.

---

# 12. FIRST-CLASS COMMERCE CONNECTORS

Architect support for:

Shopify
WooCommerce
BigCommerce
Adobe Commerce / Magento
Wix
Squarespace
Ecwid
Amazon Seller
eBay
Walmart Marketplace
Etsy
TikTok Shop
Google Merchant Center
Facebook / Instagram Commerce
other major regional marketplaces

Add generic adapters for:

REST APIs
GraphQL APIs
webhooks
OAuth providers
CSV/SFTP feeds
EDI where appropriate
MCP servers
A2A-compatible agents
UCP-compatible commerce systems

The platform must be extensible enough that a future commerce provider can be connected without redesigning the system.

---

# 13. AGENTIC COMMERCE

Treat AI-to-AI commerce as a core feature.

Support architecture for:

* Universal Commerce Protocol
* Model Context Protocol
* Agent-to-Agent communication
* agent-accessible product catalogs
* AI shopping discovery
* agent-readable product knowledge
* machine-readable policies
* machine-readable offers
* agent-compatible checkout
* agent-compatible order tracking

Create an **Agent Commerce Gateway**.

It should allow authorized external shopping agents to:

search products
retrieve detailed product knowledge
compare variants
check availability
request offers
construct carts
initiate supported checkout flows
retrieve shipping information
track permitted orders

The business should therefore sell not only through websites and marketplaces, but through emerging AI shopping surfaces.

---

# 14. SUPPLIER INTELLIGENCE SYSTEM

Supplier sourcing must be far more advanced than searching a marketplace and selecting the cheapest option.

Create supplier discovery across available authorized sources such as:

* dropshipping suppliers
* manufacturers
* wholesalers
* distributors
* print-on-demand providers
* domestic suppliers
* private-label manufacturers
* 3PL networks

Support integrations such as CJdropshipping, Printful and other available supplier APIs.

Allow additional supplier connectors to be installed.

---

# 15. SUPPLIER SCORE

Calculate a continuously updated supplier score.

Consider:

* product cost
* MOQ
* shipping cost
* processing time
* delivery time
* inventory reliability
* defect rate
* return rate
* tracking quality
* historical lateness
* communication quality
* supplier longevity
* warehouse locations
* geographic coverage
* packaging options
* branding/private-label support
* API reliability
* refund handling
* payment terms
* currency risk
* fulfillment success
* customer complaint attribution

Do not optimize only for purchase price.

Optimize total landed economic value.

---

# 16. SUPPLIER REDUNDANCY

Never allow a profitable product to depend blindly on one supplier.

Maintain:

primary supplier
secondary supplier
emergency supplier

when economically feasible.

When stock disappears or shipping performance deteriorates, automatically evaluate alternatives.

Do not switch suppliers blindly if product specifications differ.

Require SKU/product equivalence verification.

---

# 17. SUPPLIER NEGOTIATION AGENT

Where authorized, allow AI to prepare or conduct supplier negotiations.

It can negotiate:

* price
* MOQ
* volume discounts
* payment terms
* processing SLA
* shipping SLA
* packaging
* private labeling
* replacement policy
* refund terms
* inventory reservation
* priority fulfillment

Respect pre-authorized commercial boundaries.

Store negotiation history.

Never fabricate purchase volume or false facts.

---

# 18. PRODUCT DISCOVERY ENGINE

Build a continuous product opportunity engine.

Analyze permitted signals from:

* store data
* marketplace data
* search trends
* advertising data
* social signals
* supplier catalogs
* competitor stores
* customer queries
* review trends
* sales velocity
* seasonal patterns
* category growth
* internal search
* support tickets
* inventory data

The objective is not merely detecting trending products.

The objective is finding **profitable, defensible opportunities**.

---

# 19. PRODUCT OPPORTUNITY SCORE

Score candidate products using factors such as:

Demand
Demand growth
Search growth
Competition
Expected conversion
Estimated selling price
COGS
Shipping
Payment fees
Marketplace fees
Ad costs
Expected CAC
Expected return rate
Expected refund rate
Delivery experience
Supplier quality
Product differentiation
Creative potential
Repeat purchase potential
Cross-sell potential
Seasonality
Policy risk
IP/trademark risk
Product safety risk

Generate:

Expected revenue
Expected gross margin
Expected contribution margin
Break-even CAC
Break-even ROAS
Downside scenario
Base scenario
Upside scenario
Confidence

---

# 20. PRODUCT VALIDATION

Do not automatically launch everything with a high trend score.

Use staged validation.

Example:

DISCOVERED
RESEARCHED
VALIDATED
TEST_READY
TESTING
WINNER
SCALE
MATURE
DECLINING
SUNSET

Use small controlled experiments before committing significant capital.

---

# 21. AUTOMATED STORE CREATION

When launching a new product or brand, agents should be capable of preparing:

* brand positioning
* category structure
* homepage
* collections
* product pages
* product images
* comparison tables
* FAQs
* policies
* trust information
* shipping information
* bundles
* upsells
* cross-sells
* checkout configuration
* email lifecycle
* analytics
* feeds
* SEO metadata
* structured data

Do not publish unsupported product claims.

---

# 22. CATALOG INTELLIGENCE

Maintain a canonical product knowledge graph.

Store:

product facts
supplier facts
dimensions
weight
materials
compatibility
certifications
usage information
warnings
variants
shipping constraints
FAQs
approved claims
prohibited claims
brand guidelines
competitor relationships
related products

Generated content must derive factual claims from approved product data.

Prevent hallucinated product specifications.

---

# 23. MARKETPLACE LISTING OPTIMIZATION

Transform canonical products into channel-specific listings.

Optimize:

title
description
bullets
taxonomy
attributes
images
keywords
price
shipping
returns
metadata

Respect each platform's policies and formatting rules.

Continuously monitor:

suppression
rejection
policy warnings
feed errors
missing attributes
listing quality

Automatically repair safe issues.

Escalate risky cases.

---

# 24. REAL-TIME INVENTORY BRAIN

Create global inventory synchronization.

Support:

multiple stores
multiple marketplaces
multiple warehouses
multiple suppliers
virtual inventory
supplier inventory
owned inventory
3PL inventory

Prevent overselling.

Use reservations.

Account for:

pending orders
returns
purchase orders
supplier delays
safety stock
forecast demand

---

# 25. DEMAND FORECASTING

Build demand forecasting at:

SKU
variant
store
marketplace
country
warehouse

Use:

historical sales
trend growth
seasonality
marketing calendar
ad spend
promotions
lead times
stockouts
price changes
holidays
planned launches

Calculate uncertainty ranges rather than one deterministic forecast.

---

# 26. DYNAMIC PRICING ENGINE

Create an intelligent pricing system.

Inputs may include:

COGS
shipping
payment fees
platform fees
tax considerations
competitor pricing
inventory
demand
conversion rate
customer segment
supplier changes
advertising economics
return rate
seasonality

Every SKU receives:

hard price floor
recommended price
target price
maximum logical price

Never cross the owner-defined profitability floor without explicit authorization.

Support:

marketplace-specific pricing
country-specific pricing
promotional pricing
bundles
quantity discounts
subscription pricing
customer-segment pricing where legally and platform-appropriately permitted

---

# 27. CUSTOMER ACQUISITION ENGINE

The system must actively find customers rather than wait for traffic.

Build acquisition across:

paid search
shopping ads
paid social
organic social
SEO
content marketing
email
SMS
push
creator marketing
affiliate marketing
referrals
retargeting
marketplaces
partnerships

Where applicable, support B2B/wholesale prospecting for legitimate business buyers, retailers, distributors and partners using compliant channels.

Do not use spam, fake identities or deceptive outreach.

---

# 28. ADVERTISING AUTOPILOT

Integrate authorized advertising APIs.

Architect support for:

Google Ads
Meta advertising
TikTok advertising
marketplace ads
other supported networks

Agents should be capable of:

creating campaigns
creating audiences
generating creatives
creating copy
setting budgets
adjusting bids
pausing ads
scaling winners
reducing losers
detecting fatigue
testing landing pages
testing creatives
testing offers
allocating spend across channels

---

# 29. PROFIT-BASED AD OPTIMIZATION

Do not optimize advertising purely for ROAS.

Calculate:

Revenue
COGS
Fulfillment
Shipping
Returns
Refunds
Payment fees
Marketplace fees
Advertising spend
Expected chargebacks

Then optimize toward:

**Contribution Profit**

Agents must understand that a 4× ROAS campaign can be less profitable than a 2.5× ROAS campaign depending on margins.

---

# 30. MARKETING BUDGET ALLOCATOR

Build a portfolio allocator.

Distribute acquisition capital between:

products
campaigns
channels
markets
customer segments

Use controlled exploration/exploitation.

Maintain experimentation budget.

Never allow an experimental campaign to consume the entire growth budget.

---

# 31. CREATIVE INTELLIGENCE SYSTEM

Store every:

headline
image
video
hook
CTA
angle
audience
offer
landing page

Track performance by creative component.

Detect:

creative fatigue
winning hooks
winning pain points
winning benefits
audience saturation
format effectiveness

Generate new variants based on evidence.

Never simply create random variations forever.

---

# 32. CREATOR AND AFFILIATE ENGINE

Support creator and affiliate programs.

Capabilities:

creator discovery
relevance scoring
audience fit
fraud detection
outreach workflows
campaign offers
affiliate links
discount codes
commission rules
samples/gifting
performance tracking
ROI measurement
relationship history

Required disclosures and advertising rules must be respected.

---

# 33. CRM AND RETENTION BRAIN

Create a unified customer profile.

Combine:

orders
browsing data when legitimately available
email engagement
support history
returns
loyalty
campaign interactions
product preferences
LTV
predicted churn

Support lifecycle automation:

welcome
browse abandonment
cart abandonment
post-purchase
cross-sell
upsell
replenishment
win-back
VIP
price-drop
back-in-stock
review request
loyalty

Honor consent and communication preferences.

---

# 34. CUSTOMER SUPPORT AGENT

Create omnichannel support.

Potential channels:

email
web chat
social messages
SMS
helpdesk integrations

The agent receives:

customer context
orders
tracking
product information
returns
refund rules
business policies

The agent can autonomously solve authorized routine cases.

Examples:

order tracking
address correction if still possible
shipping questions
product questions
replacement requests within policy
return instructions
approved refunds

Escalate:

legal threats
safety complaints
large refunds
suspected fraud
chargebacks
VIP exceptions
unusual cases

---

# 35. CUSTOMER MEMORY

Maintain long-term business-relevant customer context while respecting privacy requirements.

The system should remember permitted facts such as:

previous purchases
support interactions
preferences
loyalty status
open issues

Do not expose internal notes or private system reasoning to customers.

---

# 36. FULFILLMENT ORCHESTRATION

For every order, choose the best authorized fulfillment path considering:

stock
warehouse
supplier
shipping cost
delivery estimate
margin
customer location
service level
supplier reliability

Support split shipments where required.

Maintain end-to-end tracking.

---

# 37. SHIPPING INTELLIGENCE

Integrate shipping/fulfillment APIs through adapters such as appropriate carrier aggregators and 3PLs.

Capabilities:

rate shopping
address verification
label generation
tracking
delivery-event monitoring
return labels
carrier performance measurement

Create carrier reliability metrics by region and service.

---

# 38. DELIVERY EXCEPTION AGENT

Monitor shipments automatically.

Detect:

no movement
late acceptance
customs delay
failed delivery
lost parcel
incorrect address
returned shipment

Proactively communicate with customers where appropriate.

Where authorized, initiate supplier/carrier investigations or replacements.

---

# 39. RETURNS INTELLIGENCE

Do not treat returns only as administrative costs.

Track return reason by:

SKU
supplier
variant
country
marketing source
campaign
creative
customer segment

Detect whether returns result from:

bad product
bad supplier
misleading marketing
wrong sizing
shipping damage
long delivery
fraud

Feed those insights back into sourcing, marketing and product decisions.

---

# 40. FRAUD AND CHARGEBACK MANAGEMENT

Create a risk layer around:

payments
accounts
refund abuse
promo abuse
affiliate fraud
supplier fraud
customer fraud
chargebacks

Consume risk information from payment providers.

Support owner-defined thresholds.

High-risk actions should be delayed, reviewed or challenged where appropriate.

---

# 41. FINANCIAL OPERATING SYSTEM

Create a financial truth layer.

Track:

revenue
discounts
tax
COGS
supplier spend
shipping
payment fees
marketplace fees
ad spend
affiliate commissions
refunds
returns
chargebacks
software expenses
operating expenses

Calculate:

gross profit
contribution profit
operating profit
cash flow
CAC
LTV
payback period
ROAS
MER
AOV
repeat purchase rate
inventory turnover

Never present revenue as profit.

---

# 42. CASH-FLOW INTELLIGENCE

An autonomous company can be profitable and still fail from cash-flow problems.

Forecast:

incoming payouts
supplier obligations
ad charges
refund exposure
inventory purchases
tax reserves
subscriptions
operating costs

Calculate:

available cash
committed cash
protected reserve
deployable growth capital

The CFO Agent must restrict expansion if projected liquidity becomes unsafe.

---

# 43. AUTOMATED RECONCILIATION

Reconcile:

store orders
marketplace orders
payment transactions
refunds
supplier payments
advertising costs
shipping fees
platform fees
payouts

Detect anomalies automatically.

Never silently discard reconciliation mismatches.

---

# 44. TAX AND INTERNATIONAL COMMERCE

Build tax/compliance adapters rather than hardcoding tax law.

Support providers capable of calculating relevant:

sales tax
VAT
GST
duties
cross-border charges

Maintain:

product tax categories
merchant location
customer location
transaction evidence
tax records

Do not allow the LLM itself to invent tax rates.

---

# 45. INTERNATIONALIZATION

Support multi-country commerce.

Capabilities:

multiple currencies
localized pricing
language localization
local product content
country-specific catalogs
country-specific suppliers
shipping rules
tax configuration
marketplace requirements
local payment methods where supported

Measure profitability independently by country.

---

# 46. EXPERIMENTATION PLATFORM

Create a native experimentation engine.

Test:

prices
offers
landing pages
headlines
images
videos
bundles
shipping offers
discounts
email sequences
advertising creative
upsells

Store:

hypothesis
variant
sample
duration
primary metric
guardrail metric
results
confidence
decision

Prevent agents from falsely declaring a winner from tiny samples.

---

# 47. CONTINUOUS LEARNING

Agents should learn from actual business outcomes.

Every major decision should connect:

Decision
→ Action
→ Result
→ Financial impact
→ Customer impact
→ Lesson

Build an institutional memory.

Store successful and failed strategies.

Prevent repeatedly running previously failed experiments without a reason.

---

# 48. BUSINESS DIGITAL TWIN

Create a continuously updated digital representation of the business.

It should model:

products
channels
markets
suppliers
customers
inventory
campaigns
cash
operations
risks

Allow agents to run scenario analysis before expensive decisions.

Examples:

“What happens if advertising spend increases 40%?”

“What happens if our primary supplier fails?”

“What happens if CAC rises 25%?”

“What happens if we launch Germany?”

“What happens if we reduce product price 8%?”

---

# 49. SHADOW DECISION MODE

Before giving new algorithms major authority, allow them to operate in shadow mode.

They should:

observe live data
make hypothetical decisions
record what they would have done
compare with actual outcomes

Promote strategies to real execution only after sufficient validation or owner authorization.

Shadow mode is an engineering/risk feature, not a fake/demo business mode.

---

# 50. AUTONOMOUS INCIDENT RESPONSE

Agents must monitor platform health.

Detect:

expired API tokens
webhook failures
sync delays
duplicate orders
inventory divergence
payment failures
supplier API outages
advertising API failures
queue backlogs
database problems
agent failures

Automatically repair recoverable problems.

Create incidents for nonrecoverable problems.

---

# 51. HUMAN COMMAND CENTER

The UI must communicate a living business, not just tables.

Primary dashboard should immediately answer:

What is happening?

How much money are we making?

What is the AI doing?

Why is it doing it?

What requires attention?

What changed?

What risks exist?

What will probably happen next?

---

# 52. EXECUTIVE DASHBOARD

Display:

Revenue
Gross profit
Contribution profit
Net operating estimate
Cash
Ad spend
ROAS
MER
CAC
AOV
LTV
Orders
Refund rate
Return rate
Chargeback rate
Inventory risk
Supplier risk
Customer satisfaction
Growth rate

Show:

today
yesterday
7 days
30 days
custom dates
forecast

---

# 53. AI ACTIVITY CENTER

Create an activity feed similar to watching employees work.

Examples:

“Pricing Agent increased SKU A from $38 to $41 because conversion remained stable and supplier cost increased 4%.”

“Growth Agent moved $320/day from Campaign B to Campaign C because estimated marginal contribution profit was 27% higher.”

“Supplier Agent activated secondary supplier because primary supplier's delivery SLA deteriorated.”

Every autonomous decision must contain:

action
reason
evidence
expected impact
risk
agent
time
affected resource
rollback availability

---

# 54. AUTONOMY CONTROL CENTER

Provide controls for every domain.

Example:

Advertising
[Manual | Copilot | Supervised | Autonomous]

Pricing
[Manual | Copilot | Supervised | Autonomous]

Support
[Manual | Copilot | Supervised | Autonomous]

Supplier Ordering
[Manual | Copilot | Supervised | Autonomous]

Allow:

budgets
limits
approval thresholds
agent permissions
emergency shutdown

---

# 55. MANUAL CONTROL

Every automated UI must also support direct manual operation.

The owner must be capable of manually:

create/edit/delete products
change prices
adjust inventory
manage listings
manage orders
choose suppliers
create purchase orders
issue refunds
create promotions
change ad budgets
pause campaigns
message customers
edit content
manage shipping
change agent settings

Do not make the human interface secondary to the AI interface.

---

# 56. GLOBAL COMMAND PALETTE

Implement a powerful natural-language commerce command system.

Examples:

“Find five promising products for Canada with at least 35% expected contribution margin.”

“Pause any campaign losing more than $100 without conversions.”

“Show orders likely to arrive late.”

“Move this SKU to supervised pricing.”

“Find an alternative supplier for Product 82.”

“Explain yesterday's profit decline.”

“Launch this product on eBay but not Amazon.”

Translate commands into structured execution plans.

Show actions before execution when the current autonomy policy requires it.

---

# 57. MOBILE CONTROL CENTER

Create responsive mobile support and, where architecture justifies it, mobile-app readiness.

Allow the owner to:

monitor the business
receive critical alerts
approve actions
pause agents
change budgets
inspect orders
issue authorized refunds
view incidents
communicate with AI
trigger emergency shutdown

---

# 58. NOTIFICATION SYSTEM

Do not overwhelm the owner.

Classify notifications:

INFO
OPPORTUNITY
ACTION_REQUIRED
WARNING
CRITICAL

Allow notification routing through configured channels.

Low-value routine automation should stay in the activity log.

Critical events should be surfaced immediately.

---

# 59. DESIGN LANGUAGE

The interface must feel like premium enterprise software.

Avoid:

generic admin-template appearance
excessive gradients
random glassmorphism
huge empty cards
meaningless AI sparkle icons
clutter
toy-like chatbot UX

Use:

strong information hierarchy
dense but readable data views
excellent typography
contextual charts
fast navigation
command palette
keyboard shortcuts
progressive disclosure
responsive layouts
clear risk indicators
excellent loading/error states

Both light and dark themes should be first-class.

---

# 60. BUSINESS WORKSPACE STRUCTURE

Recommended major workspaces:

Executive
AI Command Center
Autonomy
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
Analytics
Finance
Experiments
Integrations
Agents
Workflows
Risk
Audit
Settings

Adjust when better UX suggests another organization.

---

# 61. DATA ARCHITECTURE

Design for multi-store and eventual multi-tenant SaaS operation.

Use appropriate technologies for:

transactional data
analytics
event streams
caching
object storage
vectors/semantic retrieval
workflow state
audit logs

Maintain clear separation between:

operational database
analytics warehouse
event log
agent memory
document/product knowledge

Do not store everything in a vector database.

---

# 62. KNOWLEDGE AND MEMORY

Implement multiple memory types:

Business Memory
Customer Memory
Supplier Memory
Product Memory
Experiment Memory
Agent Operational Memory

Use retrieval only where useful.

Important financial and transactional facts belong in authoritative relational/event systems, not merely embeddings.

---

# 63. SECURITY

Implement production security.

Requirements include:

OAuth where supported
scoped permissions
RBAC
optional fine-grained ABAC
encrypted secrets
secret manager integration
encryption at rest
TLS
CSRF/XSS/SQLi protection
rate limiting
input validation
signed webhook verification
token rotation
session management
MFA support
audit logging
least privilege
service-to-service authentication
dependency security scanning

Never expose provider secrets to browser clients.

---

# 64. AGENT SECURITY

Agents receive capabilities, not unrestricted credentials.

Example:

Pricing Agent can:

read product economics
read competitors
modify approved pricing resources

It cannot:

change bank accounts
delete stores
modify authentication
transfer arbitrary money

Create short-lived scoped execution credentials where possible.

---

# 65. PROMPT-INJECTION DEFENSE

Treat external content as untrusted.

Supplier pages, customer messages, product descriptions, reviews, websites and documents may contain malicious instructions.

External text must never automatically become privileged system instructions.

Separate:

trusted policies
system instructions
business configuration
retrieved external data

Implement content sanitization and tool authorization at the orchestration layer.

---

# 66. ECONOMIC SAFETY

All money-moving or spend-increasing systems require explicit authorization boundaries.

Implement:

daily spend limits
monthly spend limits
per-agent limits
per-campaign limits
per-supplier limits
cash reserve rules
max price change
max discount
max refund
max experiment loss

Implement automatic circuit breakers.

Example:

If advertising spend rises while conversion tracking disappears:

PAUSE OR LIMIT THE AFFECTED AUTOMATION.

Do not let an agent “reason” itself around hard financial controls.

---

# 67. COMPLIANCE ENGINE

Implement configurable policy packs.

Validate:

product eligibility
marketplace requirements
marketing claims
supplier documentation
advertising policies
communication consent
privacy settings
creator disclosures
returns policies
restricted categories

Do not fabricate legal compliance.

Where jurisdiction-specific legal interpretation is required, expose it for qualified review rather than allowing an LLM to invent law.

---

# 68. ADVERTISING INTEGRITY

Never generate:

fake scarcity
fabricated testimonials
false endorsements
fake before/after claims
unsupported performance claims
nonexistent discounts
misleading product attributes
unavailable offers

Marketing optimization must remain truthful.

---

# 69. OBSERVABILITY

Implement full technical and business observability.

Technical:

logs
metrics
traces
workflow status
API latency
API errors
queue lag
database health
integration health
LLM latency
LLM costs

Business:

revenue anomalies
margin anomalies
conversion anomalies
inventory anomalies
return anomalies
supplier anomalies
advertising anomalies

---

# 70. AI OBSERVABILITY

For every agent run store:

agent
model/provider
task
tool calls
input references
outputs
decision
confidence
cost
latency
success/failure
business outcome

Do not expose hidden chain-of-thought.

Instead store concise decision rationale and evidence that is safe to audit.

---

# 71. MODEL INDEPENDENCE

Do not permanently couple the platform to one AI model.

Create an LLM/provider abstraction.

Support multiple model classes for:

reasoning
fast classification
vision
content generation
embeddings

Route tasks based on:

quality requirement
latency
cost
context size
capability

Implement fallbacks.

---

# 72. COST CONTROL

Track AI infrastructure cost per:

agent
task
store
customer
workflow
business outcome

Use deterministic software instead of LLM calls for operations that do not require intelligence.

An LLM should not calculate simple arithmetic, execute basic validation or repeatedly interpret static schemas when ordinary code can do so reliably.

---

# 73. API RELIABILITY

Every connector must support:

timeouts
retries
rate limits
pagination
idempotency
backoff
webhook verification
token refresh
error mapping
versioning
deprecation monitoring

External API failure must never silently corrupt internal commerce state.

---

# 74. CONNECTOR HEALTH

Show:

CONNECTED
DEGRADED
AUTH_REQUIRED
RATE_LIMITED
OUTAGE
DISCONNECTED

Maintain last successful sync.

Expose connector logs.

Support re-authentication without deleting business data.

---

# 75. WEBHOOK ARCHITECTURE

Prefer event-driven updates whenever providers support them.

Webhooks must be:

verified
persisted
deduplicated
replayable
idempotent

Do not perform fragile long-running business workflows directly inside HTTP webhook handlers.

---

# 76. AUDIT TRAIL

Every important mutation must answer:

WHO changed it?
WHAT changed?
WHEN?
WHY?
Was it AI or human?
Which agent?
Which workflow?
Which external API?
What was the previous value?
Can it be reversed?

Audit logs must be tamper-resistant.

---

# 77. REVERSIBILITY

Where technically possible, every autonomous action should define a compensation or rollback strategy.

Examples:

price change → restore prior price
campaign budget change → restore prior budget
listing update → restore previous content
agent setting → restore previous configuration

Not every external action can be reversed.

Mark irreversible actions explicitly.

---

# 78. PRODUCTION QUALITY

This must not become:

a prototype
a clickable shell
a collection of static dashboards
a UI connected to fake arrays
a fake autonomous-agent animation
a glorified chatbot
a pile of TODOs

Critical user journeys must operate end to end.

When real credentials are unavailable during development, implement the genuine integration architecture, contracts, authentication flows and official sandbox/test pathways where providers offer them.

Do not create fake production success.

---

# 79. TESTING

Implement:

unit tests
integration tests
contract tests
connector tests
workflow tests
agent policy tests
permission tests
financial-limit tests
webhook tests
security tests
database migration tests
UI tests
end-to-end tests
failure recovery tests

Test dangerous cases such as:

duplicate webhook
supplier outage
marketplace outage
expired OAuth token
payment failure
inventory conflict
duplicate order
agent crash
worker crash
database restart
LLM timeout
invalid model response
API schema change
budget breach attempt

---

# 80. AGENT EVALUATION

Create an evaluation harness.

Evaluate agents using historical or carefully isolated scenarios.

Metrics include:

task success
policy compliance
profit impact
error rate
unnecessary actions
tool-call efficiency
latency
cost
human override rate

A more intelligent-sounding agent is not necessarily a better agent.

Measure results.

---

# 81. SELF-IMPROVING OPERATIONS

The platform may improve prompts, heuristics, routing strategies and workflows through controlled evaluation.

Never allow uncontrolled self-modifying production code.

Changes must use:

versioning
tests
evaluation
deployment controls
rollback

---

# 82. BUSINESS GOAL ENGINE

Allow goals such as:

maximize contribution profit
maximize long-term customer value
grow revenue while maintaining ≥ X margin
clear excess inventory
enter a new market
reduce delivery times
reduce return rate
increase repeat purchases

Agents must translate goals into measurable subordinate objectives.

---

# 83. OPPORTUNITY ENGINE

The system should proactively discover opportunities.

Examples:

“Product A is selling well organically; paid advertising may be profitable.”

“Supplier B offers equivalent fulfillment 18% cheaper.”

“Germany has strong organic demand but no localized store.”

“Customers purchasing A commonly return later for B; create a bundle.”

“Campaign C is constrained by inventory, so scaling it could create a stockout.”

Surface these with expected value and confidence.

---

# 84. EXCEPTION-DRIVEN HUMAN MANAGEMENT

The long-term user experience should evolve from:

human operates everything

to:

AI operates routine business; human manages strategy and exceptions.

The owner should not need to inspect thousands of ordinary successful orders.

Surface what matters.

---

# 85. AUTONOMOUS DAILY OPERATING CYCLE

Implement a continuous business cycle conceptually similar to:

OBSERVE
↓
UNDERSTAND
↓
FORECAST
↓
IDENTIFY OPPORTUNITIES/RISKS
↓
PLAN
↓
CHECK POLICY AND CAPITAL
↓
EXECUTE
↓
MEASURE
↓
LEARN

Do not implement this as one enormous prompt.

Each stage must use appropriate services, data and workflows.

---

# 86. MORNING EXECUTIVE BRIEF

Generate an optional concise daily report containing:

yesterday's revenue
profit
important changes
wins
losses
customer issues
supplier issues
inventory risks
marketing performance
experiments
AI actions
today's plan
decisions requiring attention

Allow the owner to drill into any statement.

---

# 87. STRATEGIC PLANNING

Generate weekly and monthly operating reviews.

Compare:

plan versus actual
growth drivers
profit drivers
product portfolio
channel performance
customer cohorts
supplier performance
marketing efficiency
inventory
cash
forecast

Recommend strategic changes.

---

# 88. USER ROLES

Support business teams in addition to solo founders.

Example roles:

Owner
Admin
Finance
Operations
Marketing
Support
Analyst
Viewer

Allow custom roles.

Autonomous agents must respect the same authorization boundaries.

---

# 89. MULTI-STORE / MULTI-BRAND

One account can manage:

multiple stores
multiple brands
multiple regions
multiple marketplaces

Allow both:

global dashboards

and

brand/store-specific dashboards.

Business Constitutions may inherit global policies with store-level overrides.

---

# 90. PLATFORM BUSINESS MODEL READINESS

Architect the system so it could later operate as SaaS.

Prepare for:

multi-tenancy
tenant isolation
usage metering
plans
billing
feature entitlements
connector limits
agent usage accounting
audit requirements
organization management

Do not compromise the initial product merely to add premature billing complexity, but avoid architectural dead ends.

---

# 91. EXTENSION ECOSYSTEM

Eventually support third-party:

connectors
agents
workflows
analytics modules
policy packs

Create typed manifests and permission declarations.

Extensions must not receive unrestricted access.

---

# 92. DEVELOPER EXPERIENCE

Provide:

OpenAPI documentation
webhook documentation
SDKs where appropriate
connector SDK documentation
local development environment
seed/testing utilities
migration system
architecture documentation

New engineers must be able to understand the architecture without reverse engineering the entire repository.

---

# 93. RESEARCH-FIRST IMPLEMENTATION

Before implementing each external integration:

1. Locate the provider's current official documentation.
2. Determine supported capabilities.
3. Determine authentication.
4. Determine API version.
5. Determine quotas/rate limits.
6. Determine webhooks.
7. Determine sandbox/test capabilities.
8. Determine platform approval requirements.
9. Determine prohibited operations.
10. Implement based on current documentation rather than assumptions.

Never invent an API endpoint because it seems logical.

---

# 94. COMPETITOR STUDY

Before finalizing UX and architecture, study leading products in relevant categories:

commerce platforms
multichannel commerce
dropshipping automation
inventory/order management
advertising automation
CRM/lifecycle marketing
customer service
returns
analytics
shipping
supplier sourcing
AI commerce

Do not clone their appearance.

Identify:

what they do well
where users need multiple tools
where human labor remains
where cross-tool data gets lost

Use those gaps to make [PROJECT_NAME] stronger.

---

# 95. CRITICAL DIFFERENTIATOR

The product's differentiator is not:

“we have AI.”

The differentiator is:

# ONE INTELLIGENT OPERATING LAYER FOR THE ENTIRE COMMERCE COMPANY.

A price decision understands advertising economics.

Advertising understands inventory.

Inventory understands supplier lead times.

Supplier selection understands refund rates.

Customer support understands orders.

Finance understands all of them.

The system must therefore operate from shared truth rather than disconnected department-specific automation.

---

# 96. BUILD EXECUTION RULES

You have broad engineering freedom.

Do not ask the user to make ordinary implementation decisions that a senior engineering organization should be capable of making.

When something is unspecified:

research it
make a defensible decision
document the decision
continue

Do not stop at planning.

Do not produce only architecture diagrams.

Do not finish with TODO placeholders for critical functionality.

Work iteratively through the repository until the system is coherent and functional.

You may redesign weak architecture when necessary.

Preserve good existing components when an existing project is provided.

---

# 97. ENGINEERING PRIORITIES

Optimize in this order:

1. correctness
2. security
3. economic safety
4. data integrity
5. recoverability
6. user control
7. autonomy quality
8. reliability
9. observability
10. performance
11. developer experience
12. visual polish

Do not sacrifice correctness for flashy AI behavior.

---

# 98. EXPECTED FINAL SYSTEM

The finished product should allow a business owner to:

connect commerce accounts
connect suppliers
connect fulfillment systems
connect payments
connect advertising
connect CRM/support tools
set goals
set financial limits
set autonomy rules
activate AI operations

and then watch the system continuously:

find opportunities
research markets
find products
evaluate products
find suppliers
compare suppliers
manage sourcing
manage listings
optimize prices
manage inventory
market products
acquire customers
fulfill orders
help customers
handle routine returns
monitor shipping
optimize campaigns
manage retention
analyze finances
forecast demand
manage risk
identify expansion opportunities
learn from results

while allowing the owner to manually control any component at any time.

---

# 99. SUCCESS CRITERION

Do not evaluate success based on the number of AI agents, integrations or dashboard pages.

The final question is:

> Can a legitimate e-commerce company connect its systems, define its goals and authorization boundaries, and allow this platform to safely perform the majority of its routine commercial operations while the owner retains complete visibility and control?

If the answer is no, continue improving the system.

---

# 100. FINAL MANDATE

Build [PROJECT_NAME] as if it were intended to become foundational infrastructure for autonomous global commerce.

Do not build another dropshipping utility.

Do not build another Shopify plugin.

Do not build another AI dashboard.

Build the operating system through which humans and autonomous agents can jointly run modern commerce businesses.

The desired end state is:

**Human defines ownership, strategy, values and limits.**

**AI continuously operates, optimizes and scales the business within those limits.**

**Human can inspect, intervene, override or take control at any moment.**

Everything—architecture, UX, data model, agents, workflows, connectors, security and economics—must reinforce that principle.
