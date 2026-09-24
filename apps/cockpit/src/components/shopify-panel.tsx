"use client";

import { useState, type FormEvent } from "react";
import {
  ActionButton,
  Notice,
  timestamp,
  titleCase,
  useOperatingResource,
  type ConstitutionResponse,
  type OperatingApi,
} from "./operating-pages";

type Installation = {
  id: string;
  shop: string;
  status: string;
  revision: number;
  scopes: string[];
  installedAt: string | null;
  expiresAt: string | null;
};
type Economics = {
  landedCost: number;
  estimatedCac: number;
  category: string;
  countryOfOrigin?: string;
  evidence: string;
  validUntil: string;
};
type Variant = {
  installationId: string;
  variantId: string;
  title: string;
  sku: string | null;
  revision: number;
  price: string;
  currency: string;
  providerRevision: string;
  observedAt: string;
  economics?: Economics;
};
type Operation = {
  id: string;
  status: string;
  createdAt: string;
  reason?: string;
  cancellation?: { reason: string; at: string; actorId: string };
  input: {
    installationId: string;
    variantId: string;
    price: string;
    reason: string;
    expectedRevision: number;
    expectedConstitutionVersion: number;
    compensationFor?: string;
  };
  before: Variant;
  receipt?: {
    environment: string;
    outcome: string;
    completedAt: string;
    requestId: string | null;
    errorCode?: string;
  };
  reconciliation?: {
    at: string;
    revision?: number;
    matchesTarget: boolean;
    observation: { price: string; currency: string; providerRevision: string };
  };
  investigations?: {
    id: string;
    at: string;
    reviewerId: string;
    nextStep: string;
    note: string;
    evidence: { source: string; reference: string }[];
    verifiedProviderEvidence: false;
    reconciliation: { at: string; revision?: number; observation: { price: string; currency: string }; matchesTarget: boolean } | null;
  }[];
};
type Job = {
  id: string;
  installationId: string;
  status: string;
  attempts: number;
  createdAt: string;
  completedAt?: string;
  nextAttemptAt?: string;
  errorCode?: string;
};
type Inbox = {
  id: string;
  installationId: string;
  status: string;
  topic: string;
  receivedAt: string;
  attempts: number;
  errorCode?: string;
};
type SubscriptionAttempt = {
  id: string;
  installationId: string;
  topic: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  providerId?: string;
  errorCode?: string;
};
const webhookTopics = ["products/create", "products/update", "products/delete", "inventory_levels/update"] as const;
type ShopifyData = {
  configured: boolean;
  installations: Installation[];
  variants: Variant[];
  operations: Operation[];
  jobs: Job[];
  inbox: Inbox[];
  subscriptionAttempts?: SubscriptionAttempt[];
  capabilities: Record<string, string>;
};

/** Merchant data remains distinct from local simulation records. All writes use the owner proxy. */
export function ShopifyPanel({ api }: { api: OperatingApi }) {
  const resource = useOperatingResource<ShopifyData>(api, "shopify");
  const policy = useOperatingResource<ConstitutionResponse>(
    api,
    "constitution",
  );
  const [shop, setShop] = useState("");
  const [webhookTopic, setWebhookTopic] = useState<(typeof webhookTopics)[number]>("products/update");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<{
    variant: Variant;
    kind: "economics" | "price";
    constitutionVersion: number;
  } | null>(null);
  const [execution, setExecution] = useState<Operation | null>(null);
  const [cancellation, setCancellation] = useState<Operation | null>(null);
  const [investigation, setInvestigation] = useState<Operation | null>(null);
  const [investigationNote, setInvestigationNote] = useState("");
  const [investigationStep, setInvestigationStep] = useState<"INVESTIGATE_PROVIDER_LOGS" | "CONTACT_SHOPIFY_SUPPORT" | "KEEP_RESOURCE_BLOCKED">("INVESTIGATE_PROVIDER_LOGS");
  const [evidenceSource, setEvidenceSource] = useState<"SHOPIFY_ADMIN" | "SHOPIFY_SUPPORT" | "INTERNAL_AUDIT">("SHOPIFY_ADMIN");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [disconnect, setDisconnect] = useState<Installation | null>(null);
  async function action(path: string, body: unknown, feedback: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(path, "POST", body);
      setMessage(feedback);
      await resource.refresh();
      await policy.refresh();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The request could not be completed. Refresh to review its durable status before retrying.",
      );
      await resource.refresh();
      await policy.refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function install(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("shopify/install", "POST", { shop });
      const url = new URL(String(result.authorizationUrl));
      if (
        url.protocol !== "https:" ||
        url.hostname !== shop ||
        url.port ||
        url.username ||
        url.password ||
        url.pathname !== "/admin/oauth/authorize"
      )
        throw new Error(
          "The installation address was invalid. Start a new installation.",
        );
      window.location.assign(url.href);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Installation could not start.",
      );
      setBusy(false);
    }
  }
  async function ensureWebhook(installation: Installation) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api(`shopify/installations/${installation.id}/subscriptions/ensure`, "POST", { topic: webhookTopic });
      if (result.status === "UNKNOWN" || result.status === "DISPATCHING") setError("Webhook registration outcome is uncertain. Inspect the provider and recorded attempt before further action.");
      else if (result.decision === "deny") setError(`Webhook registration denied: ${String(result.reason ?? result.errorCode ?? result.status)}.`);
      else setMessage(result.status === "OBSERVED" ? "The exact provider subscription was observed; no new provider write was sent." : "Provider registration and readback completed. Verify an actual delivery before treating the webhook as operational.");
      await resource.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Webhook registration could not be completed. Inspect the durable attempt before retrying.");
      await resource.refresh();
    } finally { setBusy(false); }
  }
  const data = resource.data;
  const cancellable = cancellation && data?.operations.some(
    (operation) => operation.id === cancellation.id && operation.status === "PENDING",
  );
  return (
    <section
      className="panel os-panel os-stack"
      aria-label="Shopify staging commerce"
    >
      <div className="os-toolbar">
        <div>
          <span className="eyebrow">SHOPIFY · STAGING</span>
          <h2>Merchant connection and guarded pricing</h2>
          <p>
            Install your Shopify app, import current merchant records and review
            each guarded price operation.
          </p>
        </div>
        <ActionButton
          busy={busy || resource.loading}
          onClick={() => {
            void resource.refresh();
            void policy.refresh();
          }}
        >
          Refresh status
        </ActionButton>
      </div>
      <Notice>
        Price writes are implemented but unverified in staging. Autonomous price
        writes are disabled. Execution is limited by server policy to approved
        Shopify development stores. A queued job or saved proposal does not mean
        a provider write succeeded.
      </Notice>
      {(error || resource.error) && (
        <Notice error>{error || resource.error}</Notice>
      )}
      {message && <Notice>{message}</Notice>}
      {!data ? (
        <p>
          {resource.loading
            ? "Loading Shopify status…"
            : "Shopify status is unavailable."}
        </p>
      ) : (
        <>
          <div className="os-capabilities">
            {Object.entries(data.capabilities).map(([name, state]) => (
              <span key={name}>
                {name}: {state}
              </span>
            ))}
          </div>
          {!data.configured ? (
            <Notice>
              Shopify installation is not configured on the server. Configure
              the app, encrypted credential vault and HTTPS callback before
              installing a development store.
            </Notice>
          ) : (
            <form className="os-fields-grid" onSubmit={install}>
              <label className="form-label">
                Shop domain
                <input
                  required
                  pattern="[a-z0-9][a-z0-9-]*\.myshopify\.com"
                  maxLength={80}
                  placeholder="your-store.myshopify.com"
                  value={shop}
                  onChange={(event) =>
                    setShop(event.target.value.trim().toLowerCase())
                  }
                />
              </label>
              <div className="os-toolbar-actions">
                <ActionButton type="submit" className="primary" busy={busy}>
                  Install or reauthorize Shopify
                </ActionButton>
              </div>
            </form>
          )}
          {!!data.installations.length && (
            <div className="os-connection-grid">
              {data.installations.map((item) => (
                <section className="os-connection-card" key={item.id}>
                  <h3>{item.shop}</h3>
                  <p>
                    {titleCase(item.status)} · Revision {item.revision}
                  </p>
                  <dl className="os-ledger">
                    <div>
                      <dt>Installed</dt>
                      <dd>{timestamp(item.installedAt)}</dd>
                    </div>
                    <div>
                      <dt>Access token expiry</dt>
                      <dd>{timestamp(item.expiresAt)}</dd>
                    </div>
                  </dl>
                  <p className="os-footnote">
                    Granted scopes: {item.scopes.join(", ") || "None"}
                  </p>
                  <div className="os-fields-grid">
                    <label className="form-label">
                      Webhook topic
                      <select value={webhookTopic} onChange={(event) => setWebhookTopic(event.target.value as (typeof webhookTopics)[number])}>
                        {webhookTopics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
                      </select>
                    </label>
                    <ActionButton busy={busy} disabled={item.status !== "INSTALLED"} onClick={() => void ensureWebhook(item)}>
                      Ensure subscription
                    </ActionButton>
                  </div>
                  <div className="os-toolbar-actions">
                    <ActionButton
                      busy={busy}
                      disabled={item.status !== "INSTALLED"}
                      onClick={() =>
                        void action(
                          `shopify/installations/${item.id}/sync`,
                          {},
                          "Sync request recorded. Review its job status below; imports are published only after successful completion.",
                        )
                      }
                    >
                      Queue sync
                    </ActionButton>
                    <ActionButton
                      disabled={busy || item.status === "DISCONNECTED"}
                      onClick={() => setDisconnect(item)}
                    >
                      Disconnect
                    </ActionButton>
                  </div>
                </section>
              ))}
            </div>
          )}
          {disconnect && (
            <form
              className="os-panel"
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  await action(
                    `shopify/installations/${disconnect.id}/disconnect`,
                    { expectedRevision: disconnect.revision },
                    "Local installation disconnected. Imported records remain; review provider access in Shopify.",
                  )
                )
                  setDisconnect(null);
              }}
            >
              <h3>Disconnect {disconnect.shop}?</h3>
              <p>
                Stops this installation locally and preserves its records.
                Manage provider access in Shopify.
              </p>
              <div className="os-toolbar-actions">
                <ActionButton
                  type="button"
                  disabled={busy}
                  onClick={() => setDisconnect(null)}
                >
                  Cancel
                </ActionButton>
                <ActionButton type="submit" busy={busy} className="danger">
                  Confirm disconnect
                </ActionButton>
              </div>
            </form>
          )}
          <div className="os-toolbar">
            <div>
              <h3>Sync and webhook processing</h3>
              <p>
                Durable jobs survive restarts. One worker pass processes bounded
                pending work.
              </p>
            </div>
            <ActionButton
              busy={busy}
              disabled={!data.configured}
              onClick={() =>
                void action(
                  "shopify/worker",
                  {},
                  "Worker pass returned. Review the recorded job and webhook outcomes below.",
                )
              }
            >
              Process pending work
            </ActionButton>
          </div>
          <details className="os-manifest">
            <summary>Webhook registration attempts ({data.subscriptionAttempts?.length ?? 0})</summary>
            <p className="os-footnote">CONFIRMED means Shopify returned and then listed the subscription. Delivery still requires a real staging drill. UNKNOWN remains blocked from resend.</p>
            {(data.subscriptionAttempts ?? []).slice().reverse().map((attempt) => (
              <p key={attempt.id} className="os-footnote">{attempt.topic} · {attempt.status} · {timestamp(attempt.completedAt ?? attempt.createdAt)}{attempt.errorCode ? ` · ${attempt.errorCode}` : ""}</p>
            ))}
          </details>
          <details className="os-manifest">
            <summary>
              Jobs ({data.jobs.length}) and webhook events ({data.inbox.length})
            </summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Record</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Time</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.jobs].reverse().map((job) => (
                    <tr key={job.id}>
                      <td>
                        Sync · <code>{job.id}</code>
                      </td>
                      <td>{job.status}</td>
                      <td>{job.attempts}</td>
                      <td>{timestamp(job.completedAt ?? job.createdAt)}</td>
                      <td>
                        {job.errorCode ?? "—"}
                        {job.nextAttemptAt &&
                          ` · Retry after ${timestamp(job.nextAttemptAt)}`}
                      </td>
                    </tr>
                  ))}
                  {[...data.inbox].reverse().map((event) => (
                    <tr key={event.id}>
                      <td>
                        {event.topic} · <code>{event.id}</code>
                      </td>
                      <td>{event.status}</td>
                      <td>{event.attempts}</td>
                      <td>{timestamp(event.receivedAt)}</td>
                      <td>{event.errorCode ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.jobs.length && !data.inbox.length && (
              <p>No jobs or webhook events recorded.</p>
            )}
          </details>
          <h3>Merchant variants</h3>
          <p className="os-footnote">
            These are authoritative provider observations, separate from the
            simulation catalog. Cost evidence must be supplied and remain
            current before preparing a price change.
          </p>
          {policy.error && <Notice error>{policy.error}</Notice>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Variant</th>
                  <th>Observed price</th>
                  <th>Freshness</th>
                  <th>Cost evidence</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.variants.map((variant) => (
                  <tr key={`${variant.installationId}:${variant.variantId}`}>
                    <td>
                      {variant.title}
                      <br />
                      <small>{variant.sku ?? variant.variantId}</small>
                    </td>
                    <td>
                      {variant.price} {variant.currency}
                    </td>
                    <td>
                      {timestamp(variant.observedAt)}
                      <br />
                      Revision {variant.revision}
                    </td>
                    <td>
                      {variant.economics
                        ? `Expires ${timestamp(variant.economics.validUntil)}`
                        : "Missing"}
                    </td>
                    <td>
                      <div className="os-toolbar-actions">
                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            setEditor({
                              variant,
                              kind: "economics",
                              constitutionVersion:
                                policy.data?.constitution.version ?? 0,
                            })
                          }
                        >
                          Cost evidence
                        </ActionButton>
                        <ActionButton
                          disabled={busy || !policy.data || !variant.economics}
                          onClick={() =>
                            setEditor({
                              variant,
                              kind: "price",
                              constitutionVersion:
                                policy.data!.constitution.version,
                            })
                          }
                        >
                          Prepare price
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.variants.length && (
            <p className="os-empty">
              No merchant variants imported. Complete installation and a
              successful sync.
            </p>
          )}
          {editor && (
            <VariantForm
              key={`${editor.variant.variantId}:${editor.variant.revision}:${editor.kind}`}
              {...editor}
              busy={busy}
              onCancel={() => setEditor(null)}
              onSubmit={async (path, body) => {
                if (
                  await action(
                    path,
                    body,
                    editor.kind === "economics"
                      ? "Cost evidence saved. Review the latest variant revision before preparing a price."
                      : "Price proposal evaluated. Review the durable operation and its policy context below before execution.",
                  )
                )
                  setEditor(null);
              }}
            />
          )}
          <h3>Price operations and receipts</h3>
          {!data.operations.length && (
            <p className="os-empty">No price operations recorded.</p>
          )}
          {[...data.operations].reverse().map((operation) => (
            <details className="os-manifest" key={operation.id}>
              <summary>
                <strong>
                  {operation.before.title} · {operation.before.price} →{" "}
                  {operation.input.price} {operation.before.currency}
                </strong>
                <span>{operation.status}</span>
              </summary>
              <p>{operation.input.reason}</p>
              <dl className="os-ledger">
                <div>
                  <dt>Operation</dt>
                  <dd>
                    <code>{operation.id}</code>
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{timestamp(operation.createdAt)}</dd>
                </div>
                <div>
                  <dt>Authorization context</dt>
                  <dd>
                    Constitution {operation.input.expectedConstitutionVersion} ·
                    Variant revision {operation.input.expectedRevision}
                  </dd>
                </div>
                {operation.reason && (
                  <div>
                    <dt>Outcome reason</dt>
                    <dd>{operation.reason}</dd>
                  </div>
                )}
                {operation.cancellation && (
                  <div>
                    <dt>Cancellation</dt>
                    <dd>
                      {operation.cancellation.reason}
                      <br />
                      {timestamp(operation.cancellation.at)} · {operation.cancellation.actorId}
                    </dd>
                  </div>
                )}
                {operation.receipt && (
                  <>
                    <div>
                      <dt>Receipt</dt>
                      <dd>
                        {operation.receipt.environment} ·{" "}
                        {operation.receipt.outcome} ·{" "}
                        {timestamp(operation.receipt.completedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt>Provider request</dt>
                      <dd>{operation.receipt.requestId ?? "Not supplied"}</dd>
                    </div>
                    {operation.receipt.errorCode && (
                      <div>
                        <dt>Provider error</dt>
                        <dd>{operation.receipt.errorCode}</dd>
                      </div>
                    )}
                  </>
                )}
                {operation.reconciliation && (
                  <div>
                    <dt>Latest reconciliation</dt>
                    <dd>
                      {timestamp(operation.reconciliation.at)} · Observed{" "}
                      {operation.reconciliation.observation.price}{" "}
                      {operation.reconciliation.observation.currency} ·{" "}
                      {operation.reconciliation.matchesTarget
                        ? "Matches requested price"
                        : "Does not match requested price"}
                    </dd>
                  </div>
                )}
                {!!operation.investigations?.length && (
                  <div>
                    <dt>Owner investigations</dt>
                    <dd>{operation.investigations.map((review) => (
                      <p key={review.id}>
                        {timestamp(review.at)} · {review.reviewerId} · {titleCase(review.nextStep)}<br />
                        {review.note}<br />
                        {review.evidence.map((item) => `${titleCase(item.source)}: ${item.reference}`).join(" · ") || "No external reference supplied"}<br />
                        Provider evidence not independently verified. Price lock retained.
                      </p>
                    ))}</dd>
                  </div>
                )}
              </dl>
              <div className="os-toolbar-actions">
                <ActionButton
                  disabled={busy || operation.status !== "PENDING"}
                  onClick={() => {
                    setCancellation(null);
                    setExecution(operation);
                    setConfirmation("");
                  }}
                >
                  Review execution
                </ActionButton>
                {operation.status === "PENDING" && (
                  <ActionButton
                    disabled={busy}
                    onClick={() => {
                      setExecution(null);
                      setCancellation(operation);
                      setCancellationReason("");
                    }}
                  >
                    Cancel proposal
                  </ActionButton>
                )}
                <ActionButton
                  busy={busy}
                  onClick={() =>
                    void action(
                      `shopify/prices/${operation.id}/reconcile`,
                      {},
                      "Reconciliation returned. Review its provider observation; a matching price alone does not prove this operation caused it.",
                    )
                  }
                >
                  Reconcile provider state
                </ActionButton>
                {["DISPATCHING", "UNKNOWN", "DRIFT"].includes(operation.status) && (
                  <ActionButton disabled={busy} onClick={() => {
                    setInvestigation(operation); setInvestigationNote(""); setEvidenceReference("");
                    setInvestigationStep("INVESTIGATE_PROVIDER_LOGS");
                  }}>Record investigation</ActionButton>
                )}
              </div>
            </details>
          ))}
          {cancellation && (
            <form
              className="os-panel os-stack"
              onSubmit={async (event) => {
                event.preventDefault();
                const reason = cancellationReason.trim();
                if (!cancellable || reason.length < 10 || reason.length > 1000) return;
                if (await action(
                  `shopify/prices/${cancellation.id}/cancel`,
                  { reason },
                  "Proposal cancelled. Its reason and history remain in the durable record.",
                )) setCancellation(null);
              }}
            >
              <h3>Cancel pending price proposal</h3>
              <p>
                {cancellation.before.title}: {cancellation.before.price} →{" "}
                {cancellation.input.price} {cancellation.before.currency}.
                Cancellation preserves the proposal and records your reason.
              </p>
              {!cancellable && <Notice error>This proposal is no longer pending. Review its latest status.</Notice>}
              <label className="form-label">
                Reason for cancellation
                <textarea
                  required
                  minLength={10}
                  maxLength={1000}
                  value={cancellationReason}
                  onChange={(event) => setCancellationReason(event.target.value)}
                />
              </label>
              <div className="os-toolbar-actions">
                <ActionButton type="button" disabled={busy} onClick={() => setCancellation(null)}>
                  Keep proposal
                </ActionButton>
                <ActionButton
                  type="submit"
                  busy={busy}
                  disabled={!cancellable || cancellationReason.trim().length < 10}
                >
                  Confirm cancellation
                </ActionButton>
              </div>
            </form>
          )}
          {investigation && (
            <form className="os-panel os-stack" onSubmit={async (event) => {
              event.preventDefault();
              if (!["DISPATCHING", "UNKNOWN", "DRIFT"].includes(investigation.status)) return;
              const note = investigationNote.trim(), reference = evidenceReference.trim();
              if (note.length < 20 || (reference && reference.length < 8)) return;
              if (await action(`shopify/prices/${investigation.id}/investigations`, {
                expectedStatus: investigation.status,
                expectedReconciliationAt: investigation.reconciliation?.at ?? null,
                expectedReconciliationRevision: investigation.reconciliation ? investigation.reconciliation.revision ?? 1 : null,
                nextStep: investigationStep, note,
                evidence: reference ? [{ source: evidenceSource, reference }] : [],
              }, "Investigation recorded in the durable ledger. The price lock remains in place.")) setInvestigation(null);
            }}>
              <h3>Record unresolved price investigation</h3>
              <p>Operation {investigation.id} is {investigation.status}. This records an owner assessment and keeps the price write blocked. A matching provider price is not proof of who changed it.</p>
              <label className="form-label">Next step
                <select value={investigationStep} onChange={(event) => setInvestigationStep(event.target.value as typeof investigationStep)}>
                  <option value="INVESTIGATE_PROVIDER_LOGS">Investigate provider logs</option>
                  <option value="CONTACT_SHOPIFY_SUPPORT">Contact Shopify support</option>
                  <option value="KEEP_RESOURCE_BLOCKED">Keep resource blocked</option>
                </select>
              </label>
              <label className="form-label">Owner note
                <textarea required minLength={20} maxLength={2000} value={investigationNote} onChange={(event) => setInvestigationNote(event.target.value)} />
              </label>
              <label className="form-label">Evidence source, if available
                <select value={evidenceSource} onChange={(event) => setEvidenceSource(event.target.value as typeof evidenceSource)}>
                  <option value="SHOPIFY_ADMIN">Shopify admin</option>
                  <option value="SHOPIFY_SUPPORT">Shopify support</option>
                  <option value="INTERNAL_AUDIT">Internal audit</option>
                </select>
              </label>
              <label className="form-label">Evidence reference, if available
                <input maxLength={300} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Provider event or support case reference" />
              </label>
              <p className="os-footnote">References and notes are owner supplied; HOTL does not verify provider event evidence here. Do not enter tokens or customer data.</p>
              <div className="os-toolbar-actions">
                <ActionButton type="button" disabled={busy} onClick={() => setInvestigation(null)}>Cancel</ActionButton>
                <ActionButton type="submit" busy={busy} disabled={investigationNote.trim().length < 20 || (!!evidenceReference.trim() && evidenceReference.trim().length < 8)}>Save investigation</ActionButton>
              </div>
            </form>
          )}
          {execution && (
            <form
              className="os-panel"
              onSubmit={async (event) => {
                event.preventDefault();
                if (confirmation !== `CHANGE PRICE TO ${execution.input.price}`)
                  return;
                if (
                  await action(
                    `shopify/prices/${execution.id}/execute`,
                    {},
                    "Execution request returned. Review the durable status and receipt; only CONFIRMED reports a confirmed operation.",
                  )
                )
                  setExecution(null);
              }}
            >
              <h3>Execute development-store price change</h3>
              <p>
                {execution.before.title}: {execution.before.price} →{" "}
                {execution.input.price} {execution.before.currency}. The server
                rechecks current policy, installation, economics and provider
                state.
              </p>
              <Notice>
                Shopify price changes cannot guarantee a compare-and-swap
                against concurrent external edits. Unknown outcomes require
                reconciliation, not a fresh write attempt.
              </Notice>
              <label className="form-label">
                Type CHANGE PRICE TO {execution.input.price}
                <input
                  autoComplete="off"
                  required
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
              <div className="os-toolbar-actions">
                <ActionButton
                  type="button"
                  disabled={busy}
                  onClick={() => setExecution(null)}
                >
                  Cancel
                </ActionButton>
                <ActionButton
                  type="submit"
                  className="danger"
                  busy={busy}
                  disabled={
                    confirmation !== `CHANGE PRICE TO ${execution.input.price}`
                  }
                >
                  Execute guarded price change
                </ActionButton>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}

function VariantForm({
  variant,
  kind,
  constitutionVersion,
  busy,
  onCancel,
  onSubmit,
}: {
  variant: Variant;
  kind: "economics" | "price";
  constitutionVersion: number;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (path: string, body: unknown) => Promise<void>;
}) {
  const [price, setPrice] = useState(variant.price);
  const [reason, setReason] = useState("");
  const [cost, setCost] = useState(
    variant.economics?.landedCost.toString() ?? "",
  );
  const [cac, setCac] = useState(
    variant.economics?.estimatedCac.toString() ?? "",
  );
  const [category, setCategory] = useState(variant.economics?.category ?? "");
  const [country, setCountry] = useState(
    variant.economics?.countryOfOrigin ?? "",
  );
  const [expiry, setExpiry] = useState("");
  const [compensation, setCompensation] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const context = {
      installationId: variant.installationId,
      variantId: variant.variantId,
      expectedRevision: variant.revision,
    };
    if (kind === "price")
      await onSubmit("shopify/prices/propose", {
        ...context,
        expectedConstitutionVersion: constitutionVersion,
        price,
        reason,
        ...(compensation ? { compensationFor: compensation } : {}),
      });
    else
      await onSubmit("shopify/economics", {
        ...context,
        landedCost: Number(cost),
        estimatedCac: Number(cac),
        category,
        ...(country ? { countryOfOrigin: country } : {}),
        evidence: reason,
        validUntil: new Date(expiry).toISOString(),
      });
  }
  return (
    <form className="os-panel os-stack" onSubmit={submit}>
      <h3>
        {kind === "price"
          ? "Prepare a guarded price proposal"
          : "Record verified cost evidence"}{" "}
        · {variant.title}
      </h3>
      <p className="os-footnote">
        Variant revision {variant.revision}
        {kind === "price" && ` · Constitution ${constitutionVersion}`}. Changes
        made after opening this form require a fresh review.
      </p>
      <div className="os-fields-grid">
        {kind === "price" ? (
          <>
            <label className="form-label">
              New price ({variant.currency})
              <input
                required
                pattern="(0|[1-9][0-9]{0,6})\.[0-9]{2}"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </label>
            <label className="form-label">
              Compensated operation ID (optional)
              <input
                value={compensation}
                placeholder="Original operation UUID"
                onChange={(event) => setCompensation(event.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label className="form-label">
              Landed cost ({variant.currency})
              <input
                required
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
              />
            </label>
            <label className="form-label">
              Estimated acquisition cost ({variant.currency})
              <input
                required
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={cac}
                onChange={(event) => setCac(event.target.value)}
              />
            </label>
            <label className="form-label">
              Category
              <input
                required
                maxLength={100}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            </label>
            <label className="form-label">
              Country of origin (optional)
              <input
                pattern="[A-Z]{2}"
                maxLength={2}
                value={country}
                onChange={(event) =>
                  setCountry(event.target.value.toUpperCase())
                }
              />
            </label>
            <label className="form-label">
              Evidence expires (local time, within 30 days)
              <input
                required
                type="datetime-local"
                value={expiry}
                onChange={(event) => setExpiry(event.target.value)}
              />
            </label>
          </>
        )}
        <label className="form-label">
          {kind === "price" ? "Reason for change" : "Cost evidence and source"}
          <textarea
            required
            minLength={10}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      </div>
      {kind === "price" && (
        <p className="os-footnote">
          Compensation is a new guarded proposal with fresh authorization. It
          must not overwrite a later owner edit.
        </p>
      )}
      <div className="os-toolbar-actions">
        <ActionButton type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </ActionButton>
        <ActionButton type="submit" busy={busy} className="primary">
          {kind === "price" ? "Prepare proposal" : "Save evidence"}
        </ActionButton>
      </div>
    </form>
  );
}
