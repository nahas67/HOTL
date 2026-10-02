export const checkpoint = Object.freeze({
  reviewedOn: "2026-10-03",
  businessEnvironment: "SIMULATION",
  hostingSurface: "Private, static Site snapshot",
  liveConnection: false,
  commerceActionsEnabled: false,
  gateA: {
    status: "OWNER INPUT REQUIRED",
    summary: "AI may research and recommend a pilot. It cannot approve the business, invent owner risk limits, or authorize spending.",
    unknowns: [
      "Pilot country and applicable rules",
      "Product and category approval",
      "Currency and verified unit economics",
      "Capital and protected reserve",
      "Per-action and aggregate spend limits",
      "Supplier and inventory exposure",
      "Refund limits and loss thresholds",
      "Business stop and escalation thresholds",
    ],
  },
  gateC: {
    status: "BLOCKED · STAGING NOT SET UP",
    missingConfiguration: 19,
    summary: "No authorized Shopify development store, development app, or trusted public HTTPS callback/webhook endpoints are configured.",
    checks: [
      "Authorized Shopify development store: not set up",
      "Development app and approved scopes: not set up",
      "Trusted HTTPS OAuth callback: unavailable",
      "Trusted HTTPS webhook endpoint: unavailable",
      "Isolated staging services and credentials: not provisioned",
      "Static readiness preflight: blocked; 19 settings missing",
      "Active external probes: not run",
      "Shopify requests or provider writes: not run",
    ],
  },
  sections: {
    overview: {
      eyebrow: "OWNER CONTROL / CHECKPOINT",
      title: "The business is not connected.",
      intro: "This private view summarizes the repository’s latest recorded state. No live service or business data is loaded here.",
    },
    agents: {
      title: "Agent runs are not connected",
      body: "The local product includes a LangGraph workflow with scoped business roles and guardrail checks. This Site has no orchestrator connection, so active runs, decisions, and service health are unknown.",
      facts: ["Runtime: external to this Site", "Current run state: unknown", "Model traffic: routed through LiteLLM in the configured product architecture", "Action authority: deterministic guardrail only"],
    },
    approvals: {
      title: "Approval queue unavailable",
      body: "The hosted page cannot read, submit, approve, or reject HOTL approvals. Do not treat the queue as empty: no approval API is connected.",
      facts: ["Queue state: unknown", "Owner identity binding: not connected", "Approval actions: disabled on this page", "Historical demo approvals: not presented as current work"],
    },
    products: {
      title: "Catalog data is not connected",
      body: "Products and catalog editing belong to the local commerce application. This Site does not load a catalog or publish listings.",
      facts: ["Catalog source: local simulation / external commerce service", "Current inventory: unknown", "Listing changes: unavailable", "Live publication: disabled"],
    },
    orders: {
      title: "Order data is not connected",
      body: "No current orders are queried or copied into this snapshot. Simulation orders may exist in the local runtime, but this page does not represent them as live data.",
      facts: ["Order feed: not connected", "Current order count: unknown", "Payment capture: not available", "Raw card data: never handled by this Site"],
    },
    finance: {
      title: "Finance is not connected",
      body: "The local application reports simulation ledger entries and estimates. This Site receives no ledger, payout, balance, or transaction data.",
      facts: ["Ledger: external/local runtime", "Cash, payout, and margin values: unknown here", "Real financial adapters: fail closed", "Financial actions: unavailable"],
    },
    integrations: {
      title: "Provider integrations are not staged",
      body: "Shopify’s guarded development-store path is implemented locally but externally unverified. The required store, app, callback, and webhook endpoints are not set up.",
      facts: ["Shopify connection: not set up", "Shopify token custody: external guardrail boundary", "Webhook processing: external durable worker", "WooCommerce: read-only adapter; no real store connected"],
    },
    autonomy: {
      title: "Autonomy controls remain in HOTL",
      body: "The local cockpit manages the versioned Business Constitution and domain controls. This read-only Site does not change autonomy, pause a domain, or start a run.",
      facts: ["Business Constitution: managed by protected HOTL services", "Policy evaluation: deterministic", "This page’s autonomy writes: disabled", "Production autonomy: not authorized"],
    },
    guardrails: {
      title: "The guardrail remains the only mutation authority",
      body: "The Site never authorizes spending or calls Shopify. Any future interactive cockpit must authenticate the HOTL owner and submit consequential requests to the guardrail, which durably audits before success.",
      facts: ["Guardrail API: external to Sites", "Provider write credentials: guardrail service only", "Site network access: disabled in this static build", "Pause: reversible; emergency kill: separately hosted and one-way"],
    },
    activity: {
      title: "No live activity feed is available",
      body: "This Site has no event-stream or audit-log connection. The items below are verified repository facts, not a live timeline of actions.",
      facts: ["Latest project checkpoint: 03 Oct 2026", "Latest external Shopify proof: none", "Current service events: unknown", "Audit journal: remains in the HOTL runtime"],
    },
  },
});

export const navigation = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "agents", label: "Agents" },
  { id: "approvals", label: "Approvals" },
  { id: "products", label: "Products" },
  { id: "orders", label: "Orders" },
  { id: "finance", label: "Finance" },
  { id: "integrations", label: "Integrations" },
  { id: "autonomy", label: "Autonomy" },
  { id: "guardrails", label: "Guardrails" },
  { id: "activity", label: "Activity" },
  { id: "gate-a", label: "Gate A · Business" },
  { id: "gate-c", label: "Gate C · Shopify" },
]);
