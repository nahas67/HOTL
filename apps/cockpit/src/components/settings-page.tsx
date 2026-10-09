"use client";

/**
 * HOTL Settings.
 *
 * A vertical, categorized settings surface built on the design-system
 * primitives. Every panel reads from a live endpoint through the cockpit proxy
 * and every control is bound to a real action.
 *
 * Honesty rules that this file is written against:
 *   - Nothing here is seeded. If an endpoint returns an empty collection the
 *     panel says so rather than filling it in.
 *   - A control is never rendered unless it performs a real write. Where the
 *     real editor lives on another route, the panel links to it instead of
 *     duplicating a partial, and therefore weaker, editor.
 *   - A value the system has not measured is labelled as unavailable or as
 *     illustrative. It is never rendered as an observed measurement.
 *   - A control that only reports state is described as reporting state. It is
 *     never styled or labelled as though it granted authority it does not have.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity as ActivityIcon,
  ArrowRight,
  Bell,
  Bot,
  Cable,
  CircleDollarSign,
  Gamepad2,
  LockKeyhole,
  Package,
  Pause,
  Play,
  ShieldCheck,
  Square,
  Store,
  type LucideIcon,
} from "lucide-react";
import type { Telemetry } from "@/lib/types";
import {
  buildStagingReadinessRows,
  type StagingReadinessReport,
} from "@/lib/staging-readiness";
import {
  titleCase,
  usd,
  useOperatingResource,
  type ConstitutionResponse,
  type OperatingApi,
} from "./operating-pages";
import {
  Badge,
  Button,
  Callout,
  Card,
  DataTable,
  Definition,
  EmptyState,
  Field,
  Grid,
  Input,
  Ledger,
  ResourceState,
  Row,
  Select,
  Stack,
  StatusBadge,
  Textarea,
  statusTone,
  type Tone,
} from "./ui";

/* ------------------------------------------------------------------ types */

type GuardrailConfig = {
  dailyAdSpendCeiling: number;
  marginFloor: number;
  autoRefundThreshold: number;
  currency: string;
};
type OperatingState = {
  constitution: ConstitutionResponse["constitution"];
  mode: string;
  paused: boolean;
  campaigns: Array<Record<string, unknown>>;
  proposals: Array<{ id: string; title: string; status: string; priority: string }>;
  resourceRevisions: Record<string, Record<string, number>>;
};
type SystemStatus = {
  status: string;
  paused: boolean;
  mode: string;
  killSwitch: {
    engaged: boolean;
    engagedAt: string | null;
    engagedBy: string | null;
    reason: string | null;
    revision: number;
    mode: string;
    reachable: boolean;
  };
};
type IntegrationsResponse = {
  connections: Array<{
    id: string;
    label: string;
    provider: string;
    revision: number;
    createdAt?: string;
  }>;
  providers: Array<{
    provider: string;
    name: string;
    implementation: string;
    capabilities: string[];
  }>;
  setup: { vaultConfigured: boolean; allowedWooCommerceHosts: string[] };
  mode: string;
};
type ShopifyResponse = {
  configured: boolean;
  installations: Array<Record<string, unknown>>;
  capabilities: { priceWrite: string; autonomousPriceWrite: string };
};
type FinanceResponse = {
  currency: string;
  period: string;
  source: string;
  metrics: Record<string, number | null>;
  dataQuality: { unavailable: string[]; missingCostLines: number };
};
type AuditResponse = {
  entries: Array<{
    id: string;
    actorType: string;
    actorId: string;
    eventType: string;
    createdAt: string;
    hash: string;
    prevHash: string;
  }>;
  /**
   * The guardrail's own verdict on the hash chain. Rendered verbatim. It is
   * never recomputed or asserted in the browser: a client-side check would not
   * be evidence that the durable journal is intact.
   */
  integrity: string;
};
type DomainMode = { mode: string; paused: boolean; maxAutoActionAmount: number };

export type SettingsActions = {
  runCycle: () => Promise<void>;
  togglePause: () => Promise<void>;
  paused: boolean;
  status: string;
  busy: string;
  onEmergencyStop: () => void;
};

type PanelId =
  | "business"
  | "stores"
  | "integrations"
  | "agents"
  | "automation"
  | "finance"
  | "permissions"
  | "notifications"
  | "system";

const PANELS: Array<{
  id: PanelId;
  label: string;
  icon: LucideIcon;
  group: string;
  blurb: string;
}> = [
  {
    id: "business",
    label: "Business configuration",
    icon: Store,
    group: "Workspace",
    blurb:
      "Who this workspace is, what it is trying to achieve, and the business rules every agent is bound by.",
  },
  {
    id: "stores",
    label: "Stores",
    icon: Package,
    group: "Workspace",
    blurb:
      "The product catalog and the inventory on hand. Both numbers come from the order and reservation ledger.",
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: Cable,
    group: "Connections",
    blurb:
      "External systems this workspace can read from, and exactly what each connector is permitted to do.",
  },
  {
    id: "agents",
    label: "Agents",
    icon: Bot,
    group: "Operations",
    blurb:
      "The agent roster, each agent's current task, and the token budget it is accountable for.",
  },
  {
    id: "automation",
    label: "Automation",
    icon: Gamepad2,
    group: "Operations",
    blurb:
      "Operating cycles and the per-domain autonomy modes that decide which actions an agent may take unattended.",
  },
  {
    id: "finance",
    label: "Financial controls",
    icon: CircleDollarSign,
    group: "Controls",
    blurb:
      "The ceilings and floors the deterministic guardrail enforces on every spend, margin and refund decision.",
  },
  {
    id: "permissions",
    label: "Permissions & security",
    icon: LockKeyhole,
    group: "Controls",
    blurb:
      "Who is acting, which identity is bound to this workspace, and the current state of the emergency stop.",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    group: "Governance",
    blurb:
      "Everything this system surfaces for you, where it appears, and how many are waiting right now.",
  },
  {
    id: "system",
    label: "System management",
    icon: ShieldCheck,
    group: "Governance",
    blurb:
      "Staging readiness, the tamper-evident audit chain, and the operating mode this deployment is running in.",
  },
];

/* ------------------------------------------------------------- formatting */

const when = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Never";

const relative = (value?: string | null) => {
  if (!value) return "Never";
  const delta = Date.now() - new Date(value).getTime();
  if (delta < 60_000) return "Just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

/** Renders a measured value, or an honest "Unavailable" when it is null. */
function Measured({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || Number.isNaN(value))
    return <span className="ds-stat-note">Unavailable</span>;
  return <span className="ds-stat-value">{usd(value)}</span>;
}

function PanelHead({ panel }: { panel: (typeof PANELS)[number] }) {
  return (
    <div className="ds-settings-panel-head">
      <h2>{panel.label}</h2>
      <p>{panel.blurb}</p>
    </div>
  );
}

/* ============================================================ 1. business */

function BusinessPanel({
  api,
  onSaved,
}: {
  api: OperatingApi;
  onSaved: () => Promise<void>;
}) {
  const resource = useOperatingResource<ConstitutionResponse>(api, "constitution");
  const [name, setName] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const constitution = resource.data?.constitution;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!constitution) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      // Mirrors the constitution editor: the whole current policy is sent with an
      // expected version, so a concurrent change is rejected rather than
      // overwritten. The service, not this form, decides what is valid.
      const { version, updatedAt: _u, pilot: _p, ...fields } = constitution;
      await api("constitution", "PATCH", {
        ...fields,
        projectName: name ?? constitution.projectName,
        reason,
        expectedVersion: version,
      });
      setSaved(`Workspace saved as policy version ${version + 1}.`);
      setReason("");
      await resource.refresh();
      await onSaved();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The policy could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResourceState
      loading={resource.loading}
      error={resource.error}
      data={resource.data}
      empty={{
        title: "No business policy yet",
        description:
          "The guardrail service returned no constitution. Create one before configuring agents.",
      }}
    >
      {(data) => {
        const policy = data.constitution;
        const domains = Object.entries(policy.domains ?? {}) as Array<
          [string, DomainMode]
        >;
        const autonomous = domains.filter(
          ([, value]) => value.mode === "AUTONOMOUS",
        ).length;
        return (
          <Stack>
            <Card
              title="Workspace identity"
              subtitle="The name and goals every agent, audit record and page title is bound to. Saving creates a new immutable policy version."
              footer={
                <>
                  <span className="ds-help">
                    Version {policy.version} · updated {when(policy.updatedAt)}
                  </span>
                  <Row end>
                    <Button
                      type="button"
                      onClick={() => {
                        setName(null);
                        setReason("");
                        setError("");
                        setSaved("");
                      }}
                      disabled={!name || name === policy.projectName}
                    >
                      Reset
                    </Button>
                    <Button
                      type="submit"
                      form="settings-workspace-form"
                      variant="primary"
                      busy={busy}
                      disabled={!reason.trim() || (name ?? policy.projectName) === policy.projectName}
                    >
                      Save constitution
                    </Button>
                  </Row>
                </>
              }
            >
              <form id="settings-workspace-form" className="ds-stack" onSubmit={save}>
                <Grid min={300}>
                  <Field
                    label="Workspace name"
                    htmlFor="settings-workspace-name"
                    help="Shown in the browser title, the audit record and every agent prompt."
                  >
                    <Input
                      id="settings-workspace-name"
                      value={name ?? policy.projectName}
                      onChange={(event) => setName(event.target.value)}
                      disabled={busy}
                    />
                  </Field>
                  <Field
                    label="Reason for this change"
                    htmlFor="settings-workspace-reason"
                    help="Required. Stored on the new policy version so the change is attributable."
                  >
                    <Textarea
                      id="settings-workspace-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Why this workspace identity is changing"
                      disabled={busy}
                    />
                  </Field>
                </Grid>
                {error && <Callout tone="danger">{error}</Callout>}
                {saved && <Callout>{saved}</Callout>}
              </form>
            </Card>

            <Card title="Current policy" subtitle="Read from the constitution this workspace is currently enforcing.">
              <Ledger
                items={[
                  { label: "Project name", value: policy.projectName },
                  { label: "Operating mode", value: titleCase(policy.mode) },
                  { label: "Policy version", value: policy.version },
                  {
                    label: "Governed domains",
                    value: `${domains.length} domains`,
                  },
                  {
                    label: "Autonomous domains",
                    value: `${autonomous} of ${domains.length}`,
                  },
                  {
                    label: "Permitted countries",
                    value: policy.permittedCountries.length
                      ? policy.permittedCountries.join(", ")
                      : "None configured",
                  },
                  {
                    label: "Prohibited countries",
                    value: policy.prohibitedCountries.length
                      ? policy.prohibitedCountries.join(", ")
                      : "None configured",
                  },
                  {
                    label: "Prohibited categories",
                    value: policy.prohibitedCategories.length
                      ? policy.prohibitedCategories.join(", ")
                      : "None configured",
                  },
                ]}
              />
              {policy.goals.length > 0 && (
                <div>
                  <p className="ds-section-title">Stated goals</p>
                  <ul className="ds-rules">
                    {policy.goals.map((goal) => (
                      <li key={goal}>{goal}</li>
                    ))}
                  </ul>
                </div>
              )}
              {policy.hardRules.length > 0 && (
                <div>
                  <p className="ds-section-title">Hard rules</p>
                  <ul className="ds-rules">
                    {policy.hardRules.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card
              title="Domain autonomy"
              subtitle="Each domain carries its own mode and autonomous action ceiling. Per-domain modes are edited in Autonomy & policy."
              actions={
                <Link className="button" href="/autonomy">
                  Edit autonomy modes <ArrowRight size={14} />
                </Link>
              }
            >
              <DataTable
                rows={domains}
                rowKey={([name_]) => name_}
                columns={[
                  { key: "domain", header: "Domain", render: ([name_]) => titleCase(name_) },
                  {
                    key: "mode",
                    header: "Mode",
                    render: ([, value]) => (
                      <Badge tone={statusTone(value.mode)}>{titleCase(value.mode)}</Badge>
                    ),
                  },
                  {
                    key: "state",
                    header: "Paused",
                    render: ([, value]) =>
                      value.paused ? <Badge tone="warn">Paused</Badge> : <Badge tone="ok">Active</Badge>,
                  },
                  {
                    key: "ceiling",
                    header: "Max autonomous action",
                    numeric: true,
                    render: ([, value]) => usd(value.maxAutoActionAmount),
                  },
                ]}
              />
              <Callout>
                A mode describes the authority an agent has inside a domain. It is
                policy, not permission: every financial write is still evaluated by
                the deterministic guardrail, and a mode never overrides a denial.
              </Callout>
            </Card>
          </Stack>
        );
      }}
    </ResourceState>
  );
}

/* ============================================================== 2. stores */

function StoresPanel({ telemetry }: { telemetry: Telemetry | null }) {
  const products = telemetry?.products ?? [];
  const unitsOnHand = products.reduce((sum, item) => sum + item.inventory, 0);
  const held = products.filter((item) => item.status !== "active");
  const belowFloor = products.filter(
    (item) => telemetry && item.margin < telemetry.config.marginFloor,
  );
  const orders = telemetry?.orders ?? [];
  const refunded = orders.filter((order) => (order.refunded ?? 0) > 0);

  if (!telemetry)
    return (
      <Card title="Store catalog">
        <EmptyState
          icon={<Package size={20} />}
          title="Catalog unavailable"
          description="The telemetry snapshot has not loaded, so no product or inventory values can be shown."
        />
      </Card>
    );

  return (
    <Stack>
      <Grid min={200}>
        <div className="ds-stat">
          <span className="ds-stat-label">Products tracked</span>
          <span className="ds-stat-value">{products.length}</span>
          <span className="ds-stat-note">From the product ledger</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat-label">Units on hand</span>
          <span className="ds-stat-value">{unitsOnHand}</span>
          <span className="ds-stat-note">Aggregated across products</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat-label">Held for review</span>
          <span className="ds-stat-value">{held.length}</span>
          <span className="ds-stat-note">Not published to the store</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat-label">Below margin floor</span>
          <span className="ds-stat-value">{belowFloor.length}</span>
          <span className="ds-stat-note">Floor is {pct(telemetry.config.marginFloor)}</span>
        </div>
      </Grid>

      <Card
        title="Product catalog and inventory"
        subtitle="Prices, landed cost, customer acquisition estimate and on-hand units as recorded in the ledger."
        actions={
          <Link className="button" href="/products">
            Open catalog <ArrowRight size={14} />
          </Link>
        }
      >
        <DataTable
          caption={`${products.length} products · ${usd(
            products.reduce((sum, item) => sum + item.price * item.inventory, 0),
          )} of listed inventory value`}
          rows={products}
          rowKey={(item) => item.id}
          columns={[
            { key: "name", header: "Product", render: (item) => item.name },
            {
              key: "sku",
              header: "SKU",
              render: (item) => <span className="mono">{item.sku}</span>,
            },
            { key: "price", header: "Price", numeric: true, render: (item) => usd(item.price) },
            {
              key: "cost",
              header: "Landed cost",
              numeric: true,
              render: (item) => usd(item.landedCost),
            },
            {
              key: "margin",
              header: "Margin",
              numeric: true,
              render: (item) => (
                <Badge tone={item.margin < telemetry.config.marginFloor ? "danger" : "ok"}>
                  {pct(item.margin)}
                </Badge>
              ),
            },
            {
              key: "inventory",
              header: "On hand",
              numeric: true,
              render: (item) => item.inventory,
            },
            {
              key: "status",
              header: "Status",
              render: (item) => <StatusBadge value={item.status} />,
            },
            {
              key: "orders",
              header: "Orders",
              numeric: true,
              render: (item) => item.orders,
            },
          ]}
        />
        <Callout>
          Landed cost and acquisition cost are recorded estimates carried on the
          product record. Net profitability is not derivable from this table; the
          Finance panel reports what the order ledger can and cannot measure.
        </Callout>
      </Card>

      <Card
        title="Order-side inventory pressure"
        subtitle="How the catalog is being consumed, drawn from the order ledger."
        actions={
          <Link className="button" href="/orders">
            Open orders <ArrowRight size={14} />
          </Link>
        }
      >
        <Ledger
          items={[
            { label: "Orders recorded", value: orders.length },
            { label: "Orders with a refund", value: refunded.length },
            {
              label: "Products held below the floor",
              value: belowFloor.length
                ? belowFloor.map((item) => item.name).join(", ")
                : "None",
            },
            {
              label: "Lowest on-hand product",
              value: products.length
                ? products.reduce((a, b) => (a.inventory <= b.inventory ? a : b)).name
                : "No products",
            },
          ]}
        />
      </Card>
    </Stack>
  );
}

/* ======================================================== 3. integrations */

function IntegrationsPanel({ api }: { api: OperatingApi }) {
  const integrations = useOperatingResource<IntegrationsResponse>(api, "integrations");
  const shopify = useOperatingResource<ShopifyResponse>(api, "shopify");

  return (
    <Stack>
      <ResourceState
        loading={integrations.loading}
        error={integrations.error}
        data={integrations.data}
        empty={{
          title: "Connector registry unavailable",
          description:
            "The guardrail service did not return a connector registry, so no connector capability can be listed.",
        }}
      >
        {(data) => (
          <>
            <Card
              title="Connections"
              subtitle="Credential-backed connectors registered against this workspace. Every connector is read only."
              actions={
                <Link className="button primary" href="/integrations">
                  Add connection <ArrowRight size={14} />
                </Link>
              }
            >
              <DataTable
                rows={data.connections}
                rowKey={(item) => item.id}
                empty={
                  <EmptyState
                    icon={<Cable size={20} />}
                    title="No connections registered"
                    description="Nothing is connected to this workspace. Adding a connection stores credentials in the guardrail vault; it does not grant write authority."
                  />
                }
                columns={[
                  { key: "label", header: "Name", render: (item) => item.label },
                  { key: "provider", header: "Provider", render: (item) => titleCase(item.provider) },
                  { key: "revision", header: "Revision", numeric: true, render: (item) => item.revision },
                  {
                    key: "created",
                    header: "Registered",
                    render: (item) => relative(item.createdAt),
                  },
                ]}
              />
            </Card>

            <Card
              title="Connector capabilities"
              subtitle="What each supported provider is permitted to do through the cockpit. These come from the service, not from this screen."
            >
              <DataTable
                rows={data.providers}
                rowKey={(item) => item.provider}
                columns={[
                  { key: "name", header: "Provider", render: (item) => item.name },
                  {
                    key: "implementation",
                    header: "Implementation",
                    render: (item) => (
                      <Badge tone={statusTone(item.implementation)}>
                        {titleCase(item.implementation)}
                      </Badge>
                    ),
                  },
                  {
                    key: "capabilities",
                    header: "Permitted reads",
                    render: (item) => (
                      <Row className="ds-badges">
                        {item.capabilities.map((capability) => (
                          <Badge key={capability} tone="neutral">
                            {capability}
                          </Badge>
                        ))}
                      </Row>
                    ),
                  },
                ]}
              />
            </Card>

            <Card title="Credential vault" subtitle="Server-side storage for connector credentials.">
              <Ledger
                items={[
                  {
                    label: "Vault configured",
                    value: data.setup.vaultConfigured ? (
                      <Badge tone="ok">Configured</Badge>
                    ) : (
                      <Badge tone="danger">Not configured</Badge>
                    ),
                  },
                  {
                    label: "Allowed WooCommerce hosts",
                    value: data.setup.allowedWooCommerceHosts.length
                      ? data.setup.allowedWooCommerceHosts.join(", ")
                      : "No host allowlist",
                  },
                  {
                    label: "Operating mode",
                    value: titleCase(data.mode ?? "unknown"),
                  },
                ]}
              />
            </Card>
          </>
        )}
      </ResourceState>

      <ResourceState
        loading={shopify.loading}
        error={shopify.error}
        data={shopify.data}
        empty={{
          title: "Shopify state unavailable",
          description: "The Shopify registry could not be read from the guardrail service.",
        }}
      >
        {(data) => (
          <Card
            title="Shopify staging commerce"
            subtitle="The owner-only development-store price path. Its capabilities are reported exactly as the service reports them."
            actions={
              <Link className="button" href="/integrations">
                Manage Shopify <ArrowRight size={14} />
              </Link>
            }
          >
            {data.configured ? (
              <Definition
                label="Installation"
                note={`${data.installations.length} installation(s) recorded on the server.`}
                value={<Badge tone="ok">Configured</Badge>}
              />
            ) : (
              <Callout tone="warn">
                Shopify installation is not configured on the server. No price
                proposal can be created until a development store is installed and
                allowlisted.
              </Callout>
            )}
            <Ledger
              items={[
                {
                  label: "Price write path",
                  value: (
                    <Badge tone={statusTone(data.capabilities.priceWrite)}>
                      {titleCase(data.capabilities.priceWrite)}
                    </Badge>
                  ),
                },
                {
                  label: "Autonomous price write",
                  value: (
                    <Badge tone={statusTone(data.capabilities.autonomousPriceWrite)}>
                      {titleCase(data.capabilities.autonomousPriceWrite)}
                    </Badge>
                  ),
                },
                {
                  label: "Installations",
                  value: data.installations.length,
                },
              ]}
            />
            <Callout>
              An implemented price path is not a verified one. Every price change
              still passes the deterministic guardrail, and a simulated or
              reconciled receipt is never presented as a live provider write.
            </Callout>
          </Card>
        )}
      </ResourceState>
    </Stack>
  );
}

/* ============================================================== 4. agents */

function AgentsPanel({ telemetry }: { telemetry: Telemetry | null }) {
  if (!telemetry)
    return (
      <Card title="Agent roster">
        <EmptyState
          icon={<Bot size={20} />}
          title="Roster unavailable"
          description="The telemetry snapshot has not loaded, so no agent state can be shown."
        />
      </Card>
    );
  const agents = telemetry.agents;
  const byActor = new Map<string, number>();
  for (const event of telemetry.activity) {
    const actor = event.agentName ?? event.actor ?? event.actorId;
    if (!actor) continue;
    byActor.set(actor, (byActor.get(actor) ?? 0) + 1);
  }
  const totalActions = agents.reduce((sum, agent) => sum + agent.actionsToday, 0);

  return (
    <Stack>
      <Grid min={200}>
        <div className="ds-stat">
          <span className="ds-stat-label">Agents on the roster</span>
          <span className="ds-stat-value">{agents.length}</span>
          <span className="ds-stat-note">Registered against this workspace</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat-label">Actions today</span>
          <span className="ds-stat-value">{totalActions}</span>
          <span className="ds-stat-note">Counted by the ledger</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat-label">Waiting on you</span>
          <span className="ds-stat-value">
            {telemetry.interrupts.filter((item) => item.status === "pending").length}
          </span>
          <span className="ds-stat-note">Pending approvals</span>
        </div>
      </Grid>

      <Card
        title="Agent roster and scopes"
        subtitle="Each agent's role, current task, recorded success rate and token accountability."
        actions={
          <Link className="button" href="/agents">
            Open agents <ArrowRight size={14} />
          </Link>
        }
      >
        <DataTable
          rows={agents}
          rowKey={(agent) => agent.id}
          columns={[
            { key: "name", header: "Agent", render: (agent) => agent.name },
            { key: "role", header: "Role", render: (agent) => agent.role },
            {
              key: "status",
              header: "Status",
              render: (agent) => <StatusBadge value={agent.status} />,
            },
            { key: "task", header: "Current task", render: (agent) => agent.currentTask },
            {
              key: "actions",
              header: "Actions today",
              numeric: true,
              render: (agent) => agent.actionsToday,
            },
            {
              key: "success",
              header: "Success rate",
              numeric: true,
              render: (agent) => (
                <Badge
                  tone={
                    agent.successRate >= 0.95
                      ? "ok"
                      : agent.successRate >= 0.8
                        ? "warn"
                        : "danger"
                  }
                >
                  {pct(agent.successRate)}
                </Badge>
              ),
            },
            {
              key: "budget",
              header: "Token budget",
              numeric: true,
              render: (agent) => `${agent.tokenUsage} / ${agent.tokenBudget}`,
            },
          ]}
        />
        <Callout>
          A success rate is the share of that agent's recorded actions that
          completed without a guardrail denial or an execution error. It is not a
          measure of commercial outcome.
        </Callout>
      </Card>

      <Card
        title="Recent agent activity"
        subtitle="Ledger events attributed to each agent, most recent first."
        actions={
          <Link className="button" href="/activity">
            Full audit trail <ArrowRight size={14} />
          </Link>
        }
      >
        <DataTable
          rows={agents}
          rowKey={(agent) => agent.id}
          columns={[
            { key: "name", header: "Agent", render: (agent) => agent.name },
            {
              key: "events",
              header: "Ledger events",
              numeric: true,
              render: (agent) => byActor.get(agent.name) ?? 0,
            },
            {
              key: "last",
              header: "Last active",
              render: (agent) => relative(agent.lastActive),
            },
            {
              key: "usage",
              header: "Token usage",
              numeric: true,
              render: (agent) =>
                agent.tokenBudget > 0
                  ? `${pct(agent.tokenUsage / agent.tokenBudget)} of budget`
                  : "No budget recorded",
            },
          ]}
        />
      </Card>
    </Stack>
  );
}

/* ============================================================ 5. automation */

function AutomationPanel({
  api,
  actions,
  onSaved,
}: {
  api: OperatingApi;
  actions: SettingsActions;
  onSaved: () => Promise<void>;
}) {
  const state = useOperatingResource<OperatingState>(api, "operating-state");
  const [localBusy, setLocalBusy] = useState("");

  const runCycle = useCallback(async () => {
    setLocalBusy("cycle");
    await actions.runCycle();
    setLocalBusy("");
    // Re-read operating-state too: pausing changes `paused` and can change the
    // held-proposal set, and the cockpit refresh alone will not update this one.
    await Promise.all([state.refresh(), onSaved()]);
  }, [actions, onSaved, state]);

  const togglePause = useCallback(async () => {
    setLocalBusy("pause");
    await actions.togglePause();
    setLocalBusy("");
    await Promise.all([state.refresh(), onSaved()]);
  }, [actions, onSaved, state]);

  return (
    <ResourceState
      loading={state.loading}
      error={state.error}
      data={state.data}
      empty={{
        title: "Operating state unavailable",
        description: "The guardrail service did not return an operating state.",
      }}
    >
      {(data) => {
        const domains = Object.entries(data.constitution.domains ?? {}) as Array<
          [string, DomainMode]
        >;
        const byMode = new Map<string, number>();
        for (const [, value] of domains)
          byMode.set(value.mode, (byMode.get(value.mode) ?? 0) + 1);
        const pausedDomains = domains.filter(([, value]) => value.paused);
        const proposals = data.proposals ?? [];
        const waiting = proposals.filter((item) => item.status === "pending");
        const superseded = proposals.filter((item) => item.status === "expired");

        return (
          <Stack>
            <Card
              title="Operating cycles"
              subtitle="Starting a cycle hands work to the orchestrator. Any action that needs a human decision interrupts the run and waits for you."
              actions={
                <Row end>
                  <Button onClick={togglePause} busy={localBusy === "pause"} icon={actions.paused ? <Play size={14} /> : <Pause size={14} />}>
                    {actions.paused ? "Resume agents" : "Pause agents"}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={runCycle}
                    busy={localBusy === "cycle"}
                    disabled={actions.paused || actions.status === "killed"}
                    icon={<Play size={14} fill="currentColor" />}
                  >
                    Run a cycle
                  </Button>
                </Row>
              }
            >
              <Ledger
                items={[
                  {
                    label: "System state",
                    value: <StatusBadge value={data.paused ? "paused" : actions.status} />,
                  },
                  {
                    label: "Deployment mode",
                    value: <Badge tone="brand">{titleCase(data.mode)}</Badge>,
                  },
                  {
                    label: "Pending decisions",
                    value: (
                      <Row end>
                        <span>{waiting.length}</span>
                        <Link className="button" href="/approvals">
                          Review <ArrowRight size={13} />
                        </Link>
                      </Row>
                    ),
                  },
                  {
                    label: "Superseded proposals",
                    value: superseded.length
                      ? `${superseded.length} must be replanned`
                      : "None",
                  },
                  {
                    label: "Paused domains",
                    value: pausedDomains.length
                      ? pausedDomains.map(([name]) => titleCase(name)).join(", ")
                      : "None",
                  },
                ]}
              />
              <Callout>
                Pausing blocks new agent actions and new checkouts immediately.
                It is reversible. The emergency stop in Permissions &amp; security
                is not.
              </Callout>
            </Card>

            <Card
              title="Requests awaiting an owner decision"
              subtitle="Proposals currently held by the guardrail. Each one must be approved, rejected or replanned before the run continues."
              actions={
                <Link className="button" href="/approvals">
                  Open approvals <ArrowRight size={14} />
                </Link>
              }
            >
              <DataTable
                rows={proposals}
                rowKey={(item) => item.id}
                empty={
                  <EmptyState
                    icon={<Gamepad2 size={20} />}
                    title="No proposals held"
                    description="The guardrail holds no interrupt records for this workspace."
                  />
                }
                columns={[
                  { key: "title", header: "Proposal", render: (item) => item.title },
                  {
                    key: "status",
                    header: "Status",
                    render: (item) => <StatusBadge value={item.status} />,
                  },
                  {
                    key: "priority",
                    header: "Priority",
                    render: (item) => <StatusBadge value={item.priority} />,
                  },
                ]}
              />
            </Card>

            <Card
              title="Autonomy modes by domain"
              subtitle="How much authority each operating domain currently carries, derived from the enforced constitution."
              actions={
                <Link className="button" href="/autonomy">
                  Edit modes <ArrowRight size={14} />
                </Link>
              }
            >
              <Grid min={180}>
                {[...byMode.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([mode, count]) => (
                    <div className="ds-stat" key={mode}>
                      <span className="ds-stat-label">{titleCase(mode)}</span>
                      <span className="ds-stat-value">{count}</span>
                      <span className="ds-stat-note">
                        of {domains.length} domains
                      </span>
                    </div>
                  ))}
              </Grid>
              <p className="ds-help">
                {domains.length} domains are governed. Each one is edited
                individually in Autonomy &amp; policy, where the full constitution
                and its version history are available.
              </p>
            </Card>

            <Card
              title="Campaigns"
              subtitle="Campaign records held by the guardrail ledger."
              actions={
                <Link className="button" href="/activity">
                  Campaign activity <ArrowRight size={14} />
                </Link>
              }
            >
              <DataTable
                rows={data.campaigns}
                rowKey={(row, index) => String(row.id ?? row.campaignId ?? index)}
                empty={
                  <EmptyState
                    icon={<Gamepad2 size={20} />}
                    title="No campaigns recorded"
                    description="The ledger holds no campaign records. This is an empty ledger, not a missing read."
                  />
                }
                columns={[
                  {
                    key: "id",
                    header: "Campaign",
                    render: (row) => String(row.id ?? row.campaignId ?? "—"),
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (row) => <StatusBadge value={String(row.status ?? "unknown")} />,
                  },
                  {
                    key: "budget",
                    header: "Budget",
                    numeric: true,
                    render: (row) =>
                      typeof row.budget === "number" ? usd(row.budget) : "Not recorded",
                  },
                ]}
              />
            </Card>
          </Stack>
        );
      }}
    </ResourceState>
  );
}

/* =============================================== 6. financial controls */

function FinancePanel({ api }: { api: OperatingApi }) {
  const config = useOperatingResource<{ config: GuardrailConfig }>(api, "config");
  const finance = useOperatingResource<FinanceResponse>(api, "finance?period=30d");

  return (
    <Stack>
      <ResourceState
        loading={config.loading}
        error={config.error}
        data={config.data}
        empty={{
          title: "Guardrail config unavailable",
          description:
            "The guardrail service did not return its financial configuration, so no ceiling or floor can be displayed.",
        }}
      >
        {({ config: limits }) => (
          <Card
            title="Enforced financial limits"
            subtitle="These are read directly from the guardrail service. They are the numbers it evaluates against — not preferences stored in the browser."
            actions={
              <Link className="button" href="/guardrails">
                Edit boundaries <ArrowRight size={14} />
              </Link>
            }
          >
            <Ledger
              items={[
                {
                  label: "Daily ad spend ceiling",
                  value: usd(limits.dailyAdSpendCeiling),
                },
                {
                  label: "Margin floor",
                  value: pct(limits.marginFloor),
                },
                {
                  label: "Automatic refund threshold",
                  value: usd(limits.autoRefundThreshold),
                },
                { label: "Settlement currency", value: limits.currency },
              ]}
            />
            <Callout>
              Raising a ceiling here does not grant spending authority by itself,
              and it is not editable on this screen: the same values are written
              through the versioned constitution in Guardrails, so every change is
              attributed to a reason and a policy version.
            </Callout>
          </Card>
        )}
      </ResourceState>

      <ResourceState
        loading={finance.loading}
        error={finance.error}
        data={finance.data}
        empty={{
          title: "Finance unavailable",
          description: "The order ledger did not return a finance summary.",
        }}
      >
        {(data) => (
          <Card
            title="Ledger position (last 30 days)"
            subtitle={`Derived from the ${data.source.replaceAll("_", " ")}. Values the ledger cannot measure are reported as unavailable, not estimated.`}
            actions={
              <Link className="button" href="/finance">
                Open finance <ArrowRight size={14} />
              </Link>
            }
          >
            <Grid min={190}>
              <div className="ds-stat">
                <span className="ds-stat-label">Gross sales</span>
                <Measured value={data.metrics.grossSales} />
              </div>
              <div className="ds-stat">
                <span className="ds-stat-label">Net sales</span>
                <Measured value={data.metrics.netSales} />
              </div>
              <div className="ds-stat">
                <span className="ds-stat-label">Net operating profit</span>
                <Measured value={data.metrics.netOperatingProfit} />
              </div>
              <div className="ds-stat">
                <span className="ds-stat-label">Average order value</span>
                <Measured value={data.metrics.aov} />
              </div>
              <div className="ds-stat">
                <span className="ds-stat-label">Customer acquisition cost</span>
                <Measured value={data.metrics.cac} />
              </div>
              <div className="ds-stat">
                <span className="ds-stat-label">Lifetime value</span>
                <Measured value={data.metrics.ltv} />
              </div>
            </Grid>
            {data.dataQuality.unavailable.length > 0 && (
              <Callout tone="warn">
                Not measured by this ledger:{" "}
                {data.dataQuality.unavailable.map(titleCase).join(", ")}.{" "}
                {data.dataQuality.missingCostLines} cost lines are missing. These
                gaps are reported rather than filled with an estimate.
              </Callout>
            )}
          </Card>
        )}
      </ResourceState>
    </Stack>
  );
}

/* ================================================ 7. permissions & security */

function PermissionsPanel({
  api,
  actions,
  onEmergencyStop,
}: {
  api: OperatingApi;
  actions: SettingsActions;
  onEmergencyStop: () => void;
}) {
  const status = useOperatingResource<SystemStatus>(api, "status");
  const session = useOperatingResource<{ mode: string }>(api, "session");
  const state = useOperatingResource<OperatingState>(api, "operating-state");
  const readiness = useOperatingResource<StagingReadinessReport>(api, "staging-readiness");

  const identityFields = useMemo(
    () =>
      [
        "SUPABASE_URL",
        "OWNER_USER_IDS",
        "GUARDRAIL_AUTHORIZATION_VERSION",
        "AGENT_JWT_KEYS",
        "GUARDRAIL_WORKSPACE_ID",
        "GUARDRAIL_DATABASE_URL",
      ] as const,
    [],
  );

  return (
    <Stack>
      <ResourceState
        loading={status.loading}
        error={status.error}
        data={status.data}
        empty={{
          title: "System state unavailable",
          description: "The guardrail service did not report its operating state.",
        }}
      >
        {(data) => {
          const kill = data.killSwitch;
          return (
            <Card
              title="Emergency stop"
              subtitle="The state of the independently deployed kill service, read through a separate reader credential."
              actions={
                <Link className="button" href="/guardrails">
                  Guardrails <ArrowRight size={14} />
                </Link>
              }
            >
              {kill.engaged ? (
                <Callout tone="danger">
                  The emergency stop is engaged. It is a durable one-way latch with
                  no disengage endpoint in this system. Recovery requires credential
                  replacement and the manual recovery runbook.
                </Callout>
              ) : (
                <Callout>
                  The emergency stop is not engaged. Engaging it requires typing a
                  confirmation phrase and reauthenticating, and it cannot be undone
                  from this interface.
                </Callout>
              )}
              <Ledger
                items={[
                  {
                    label: "Kill service state",
                    value: (
                      <Badge tone={kill.engaged ? "danger" : "ok"}>
                        {kill.engaged ? "Engaged" : "Not engaged"}
                      </Badge>
                    ),
                  },
                  {
                    label: "Emergency reader reachable",
                    value: (
                      <Badge tone={kill.reachable ? "ok" : "danger"}>
                        {kill.reachable ? "Reachable" : "Unreachable"}
                      </Badge>
                    ),
                  },
                  { label: "Engaged at", value: when(kill.engagedAt) },
                  { label: "Engaged by", value: kill.engagedBy ?? "—" },
                  { label: "State revision", value: kill.revision },
                  { label: "Kill service mode", value: titleCase(kill.mode) },
                  { label: "Recorded reason", value: kill.reason ?? "—" },
                ]}
              />
              <Row end>
                <Button
                  variant="danger"
                  onClick={onEmergencyStop}
                  icon={<Square size={14} />}
                  disabled={actions.status === "killed"}
                >
                  Emergency stop
                </Button>
              </Row>
              <p className="ds-help">
                This button opens the confirmation dialog. It submits nothing until
                a reason, the confirmation phrase and a reauthentication token have
                been supplied.
              </p>
            </Card>
          );
        }}
      </ResourceState>

      <ResourceState
        loading={session.loading}
        error={session.error}
        data={session.data}
        empty={{
          title: "Session unavailable",
          description: "The cockpit session endpoint did not respond.",
        }}
      >
        {(data) => (
          <Card
            title="Acting identity"
            subtitle="The authority this cockpit session is currently acting with."
          >
            <Ledger
              items={[
                {
                  label: "Deployment mode",
                  value: (
                    <Badge tone={data.mode === "live" ? "ok" : "warn"}>
                      {data.mode === "live" ? "Live workspace" : "Simulation mode"}
                    </Badge>
                  ),
                },
                {
                  label: "Owner authentication",
                  value:
                    data.mode === "live"
                      ? "Supabase owner session required"
                      : "Local internal token",
                },
                {
                  label: "Authorization basis",
                  value:
                    data.mode === "live"
                      ? "Owner allowlist evaluated by the guardrail service"
                      : "Local simulation token. It grants no production authority.",
                },
              ]}
            />
          </Card>
        )}
      </ResourceState>

      <ResourceState
        loading={state.loading}
        error={state.error}
        data={state.data}
        empty={{
          title: "Workspace binding unavailable",
          description: "The durable workspace ledger did not respond.",
        }}
      >
        {(data) => {
          const revisions = data.resourceRevisions ?? {};
          const rows = Object.entries(revisions);
          const total = rows.reduce(
            (sum, [, records]) =>
              sum + Object.values(records ?? {}).reduce((a, b) => a + b, 0),
            0,
          );
          return (
            <Card
              title="Workspace binding"
              subtitle="Every mutation is bound to this workspace and checked against the record's current revision before it is applied."
            >
              <Grid min={180}>
                <div className="ds-stat">
                  <span className="ds-stat-label">Bound resources</span>
                  <span className="ds-stat-value">{rows.length}</span>
                  <span className="ds-stat-note">Resource kinds in the ledger</span>
                </div>
                <div className="ds-stat">
                  <span className="ds-stat-label">Recorded revisions</span>
                  <span className="ds-stat-value">{total}</span>
                  <span className="ds-stat-note">Across all bound resources</span>
                </div>
                <div className="ds-stat">
                  <span className="ds-stat-label">Policy version</span>
                  <span className="ds-stat-value">
                    {data.constitution.version}
                  </span>
                  <span className="ds-stat-note">Enforced constitution</span>
                </div>
              </Grid>
              <DataTable
                rows={rows}
                rowKey={([kind]) => kind}
                empty={
                  <EmptyState
                    icon={<LockKeyhole size={20} />}
                    title="No bound resources"
                    description="The workspace ledger holds no revision-tracked resources yet."
                  />
                }
                columns={[
                  { key: "kind", header: "Resource kind", render: ([kind]) => titleCase(kind) },
                  {
                    key: "records",
                    header: "Records",
                    numeric: true,
                    render: ([, records]) => Object.keys(records ?? {}).length,
                  },
                  {
                    key: "revisions",
                    header: "Highest revision",
                    numeric: true,
                    render: ([, records]) =>
                      Math.max(0, ...Object.values(records ?? {})),
                  },
                ]}
              />
            </Card>
          );
        }}
      </ResourceState>

      <Card
        title="Identity and credential configuration"
        subtitle="Which identity settings are configured on the server. Configuration presence does not prove the external facts behind them."
      >
        <ResourceState
          loading={readiness.loading}
          error={readiness.error}
          data={readiness.data}
          empty={{
            title: "Staging readiness unavailable",
            description: "The readiness report could not be read.",
          }}
        >
          {(data) => {
            const missing = new Set(
              (data.staticConfiguration?.missing ?? []).map((item) => item.field),
            );
            return (
              <>
                <DataTable
                  rows={identityFields.map((field) => ({
                    field,
                    missing: missing.has(field),
                    reason:
                      data.staticConfiguration?.missing?.find(
                        (item) => item.field === field,
                      )?.reason,
                  }))}
                  rowKey={(row) => row.field}
                  columns={[
                    { key: "field", header: "Setting", render: (row) => <span className="mono">{row.field}</span> },
                    {
                      key: "state",
                      header: "Server configuration",
                      render: (row) =>
                        row.missing ? (
                          <Badge tone="danger">Not configured</Badge>
                        ) : (
                          <Badge tone="warn">Present · unverified</Badge>
                        ),
                    },
                    {
                      key: "reason",
                      header: "Why it matters",
                      render: (row) => row.reason ?? "Configured on the server.",
                    },
                  ]}
                />
                <Callout>
                  A value being present in configuration is not proof that the
                  external fact holds. Owner allowlisting, agent signing keys and
                  the workspace database binding each need their own external
                  verification before a live deployment is trusted.
                </Callout>
              </>
            );
          }}
        </ResourceState>
      </Card>
    </Stack>
  );
}

/* ========================================================= 8. notifications */

type NotificationChannel = {
  label: string;
  destination: string;
  source: string;
  count: number | null;
  detail: string;
  tone: Tone;
};

function NotificationsPanel({
  api,
  telemetry,
}: {
  api: OperatingApi;
  telemetry: Telemetry | null;
}) {
  const status = useOperatingResource<SystemStatus>(api, "status");
  const integrations = useOperatingResource<IntegrationsResponse>(api, "integrations");

  const pending = telemetry?.interrupts.filter((item) => item.status === "pending") ?? [];
  const escalated = telemetry?.interrupts.filter((item) => item.status === "expired") ?? [];
  const channels: NotificationChannel[] = [
    {
      label: "Owner approval requests",
      destination: "/approvals",
      source: "Pending interrupts",
      count: pending.length,
      detail:
        "Any agent action that exceeds its configured authority interrupts and waits for a recorded owner decision.",
      tone: pending.length ? "warn" : "neutral",
    },
    {
      label: "Expired proposals",
      destination: "/approvals",
      source: "Expired interrupts",
      count: escalated.length,
      detail:
        "A proposal prepared under a superseded policy version. It must be replanned; it can never be approved on its original terms.",
      tone: escalated.length ? "warn" : "neutral",
    },
    {
      label: "Ledger activity",
      destination: "/activity",
      source: "Audit events",
      count: telemetry?.activity.length ?? null,
      detail:
        "Every agent action, owner decision and denial is appended to a hash-chained audit record.",
      tone: "neutral",
    },
    {
      label: "Decision saved, resume pending",
      destination: "/activity",
      source: "Orchestrator resume notices",
      count: null,
      detail:
        "Raised when a decision is durably saved but the orchestrator has not yet resumed the run. Retryable from Activity.",
      tone: "neutral",
    },
    {
      label: "Emergency stop engaged",
      destination: "/guardrails",
      source: "Kill service state",
      count: status.data?.killSwitch.engaged ? 1 : 0,
      detail:
        "A durable one-way latch. Recovery is credential replacement and a manual runbook, never a notification.",
      tone: status.data?.killSwitch.engaged ? "danger" : "neutral",
    },
    {
      label: "Connector health",
      destination: "/integrations",
      source: "Registered connections",
      count: integrations.data?.connections.length ?? null,
      detail:
        "Connector health is reported by the guardrail service. A connector that cannot be read is shown as unread, never as healthy.",
      tone:
        integrations.data && integrations.data.connections.length === 0
          ? "neutral"
          : "neutral",
    },
  ];

  return (
    <Stack>
      <Callout>
        HOTL does not send email or push notifications in this build. Everything the
        system surfaces appears in the cockpit, and every destination below is a
        live section reading the same API this panel reads.
      </Callout>

      <Card
        title="What the system surfaces, and where"
        subtitle="Counts are read live from the same endpoints the destination sections use."
      >
        <DataTable
          rows={channels}
          rowKey={(row) => row.label}
          columns={[
            { key: "label", header: "Notification", render: (row) => row.label },
            { key: "source", header: "Measured from", render: (row) => row.source },
            {
              key: "count",
              header: "Waiting now",
              numeric: true,
              render: (row) =>
                row.count === null ? (
                  <span className="ds-stat-note">Unavailable</span>
                ) : (
                  <Badge tone={row.tone}>{row.count}</Badge>
                ),
            },
            { key: "detail", header: "Meaning", render: (row) => row.detail },
            {
              key: "open",
              header: "Destination",
              render: (row) => (
                <Link className="button" href={row.destination}>
                  Open <ArrowRight size={14} />
                </Link>
              ),
            },
          ]}
        />
      </Card>

      <Card
        title="Pending approval detail"
        subtitle="Every decision currently waiting on an owner, with the agent that raised it."
      >
        <DataTable
          rows={pending}
          rowKey={(item) => item.id}
          empty={
            <EmptyState
              icon={<Bell size={20} />}
              title="Nothing is waiting on you"
              description="No agent action currently requires an owner decision."
            />
          }
          columns={[
            { key: "title", header: "Request", render: (item) => item.title },
            { key: "agent", header: "Raised by", render: (item) => item.agentName },
            {
              key: "priority",
              header: "Priority",
              render: (item) => <StatusBadge value={item.priority} />,
            },
            {
              key: "category",
              header: "Category",
              render: (item) => titleCase(item.category),
            },
            { key: "age", header: "Waiting", render: (item) => relative(item.createdAt) },
          ]}
        />
      </Card>
    </Stack>
  );
}

/* ===================================================== 9. system management */

function SystemPanel({ api }: { api: OperatingApi }) {
  const readiness = useOperatingResource<StagingReadinessReport>(api, "staging-readiness");
  const audit = useOperatingResource<AuditResponse>(api, "audit-log");
  const status = useOperatingResource<SystemStatus>(api, "status");

  return (
    <Stack>
      <ResourceState
        loading={status.loading}
        error={status.error}
        data={status.data}
        empty={{
          title: "Health unavailable",
          description: "The guardrail service did not report its health.",
        }}
      >
        {(data) => (
          <Card
            title="Service health"
            subtitle="What the cockpit can actually observe about the services behind it."
            actions={
              <Link className="button" href="/activity">
                Audit log <ArrowRight size={14} />
              </Link>
            }
          >
            <Grid min={190}>
              <div className="ds-stat">
                <span className="ds-stat-label">Guardrail service</span>
                <span className="ds-stat-value">
                  <StatusBadge value={data.status} />
                </span>
                <span className="ds-stat-note">
                  {data.paused ? "New actions are paused" : "Accepting work"}
                </span>
              </div>
              <div className="ds-stat">
                <span className="ds-stat-label">Deployment mode</span>
                <span className="ds-stat-value">
                  <StatusBadge value={data.mode} />
                </span>
                <span className="ds-stat-note">
                  {data.mode === "live"
                    ? "Connected to configured services"
                    : "Explicitly labeled local simulation"}
                </span>
              </div>
              <div className="ds-stat">
                <span className="ds-stat-label">Emergency reader</span>
                <span className="ds-stat-value">
                  <StatusBadge value={data.killSwitch.reachable ? "reachable" : "unreachable"} />
                </span>
                <span className="ds-stat-note">Separate deployment and credential</span>
              </div>
            </Grid>
          </Card>
        )}
      </ResourceState>

      <ResourceState
        loading={readiness.loading}
        error={readiness.error}
        data={readiness.data}
        empty={{
          title: "Readiness report unavailable",
          description: "The staging preflight could not be read.",
        }}
      >
        {(data) => {
          const rows = buildStagingReadinessRows(data, data.staticConfiguration.status);
          const verified = data.externalStagingVerified;
          return (
            <Card
              title="Staging readiness"
              subtitle="What is configured, and what remains unproven. A passing configuration check is never presented as a completed external drill."
            >
              {verified ? (
                <Callout>External staging verification is recorded as complete.</Callout>
              ) : (
                <Callout tone="warn">
                  External staging is not verified. This deployment is a local
                  simulation and must not be described as a proof environment.
                </Callout>
              )}
              <DataTable
                rows={rows}
                rowKey={(row) => row.label}
                columns={[
                  { key: "label", header: "Gate", render: (row) => row.label },
                  {
                    key: "status",
                    header: "Status",
                    render: (row) => <StatusBadge value={row.status} />,
                  },
                  { key: "detail", header: "What this proves", render: (row) => row.detail },
                ]}
              />
              {data.activeProbes?.notProbed?.length > 0 && (
                <Callout>
                  Not probed from this cockpit:{" "}
                  {data.activeProbes.notProbed.map(titleCase).join(", ")}. Run the
                  preflight from the isolated staging environment once it is
                  provisioned.
                </Callout>
              )}
            </Card>
          );
        }}
      </ResourceState>

      <Card
        title="Audit chain"
        subtitle="The most recent append-only audit records. Each entry commits to the hash of the one before it."
        actions={
          <Link className="button" href="/activity">
            Full activity <ArrowRight size={14} />
          </Link>
        }
      >
        <ResourceState
          loading={audit.loading}
          error={audit.error}
          data={audit.data}
          empty={{
            title: "Audit log unavailable",
            description: "The audit journal could not be read.",
          }}
        >
          {(data) => (
            <>
              {/* Server-derived verdict. The browser does not verify the chain. */}
              <Row between>
                <div className="ds-row">
                  <ShieldCheck size={16} />
                  <span className="ds-label">Hash chain integrity</span>
                </div>
                <StatusBadge value={data.integrity || "unknown"} />
              </Row>
              <p className="ds-help">
                Reported by the guardrail service across {data.entries.length}{" "}
                {data.entries.length === 1 ? "entry" : "entries"}. Each entry
                commits to the hash of the one before it.
              </p>
              <DataTable
                rows={data.entries}
                rowKey={(entry) => entry.id}
                empty={
                  <EmptyState
                    icon={<ActivityIcon size={20} />}
                    title="No audit entries"
                    description="The audit journal is empty. No action has been recorded against this workspace."
                  />
                }
                columns={[
                  {
                    key: "event",
                    header: "Event",
                    render: (entry) => (
                      <span className="mono">{entry.eventType}</span>
                    ),
                  },
                  {
                    key: "actor",
                    header: "Actor",
                    render: (entry) => (
                      <Badge tone="neutral">
                        {entry.actorType}: {entry.actorId}
                      </Badge>
                    ),
                  },
                  { key: "time", header: "Recorded", render: (entry) => relative(entry.createdAt) },
                  {
                    key: "hash",
                    header: "Hash",
                    render: (entry) => (
                      <span className="mono">
                        {entry.hash.slice(0, 12)}…
                      </span>
                    ),
                  },
                ]}
              />
              <Callout>
                The hash chain detects tampering after the fact. It is evidence that
                a record has not changed; it is not proof that any recorded action
                was correct or was executed against a live provider.
              </Callout>
            </>
          )}
        </ResourceState>
      </Card>
    </Stack>
  );
}

/* ============================================================== container */

export function SettingsPage({
  api,
  telemetry,
  actions,
  onSaved,
}: {
  api: OperatingApi;
  telemetry: Telemetry | null;
  actions: SettingsActions;
  onSaved: () => Promise<void>;
}) {
  const [active, setActive] = useState<PanelId>("business");
  const panel = PANELS.find((entry) => entry.id === active) ?? PANELS[0];

  const groups = useMemo(() => {
    const map = new Map<string, typeof PANELS>();
    for (const entry of PANELS) {
      const list = map.get(entry.group) ?? [];
      list.push(entry);
      map.set(entry.group, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <div className="ds-settings">
      <nav className="ds-settings-nav" aria-label="Settings sections">
        {groups.map(([group, entries]) => (
          <div key={group} style={{ display: "contents" }}>
            <p className="ds-settings-group">{group}</p>
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`ds-settings-link${active === entry.id ? " active" : ""}`}
                aria-current={active === entry.id ? "true" : undefined}
                onClick={() => setActive(entry.id)}
              >
                <entry.icon size={16} strokeWidth={1.8} />
                <span>{entry.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="ds-settings-content">
        <PanelHead panel={panel} />
        {panel.id === "business" && <BusinessPanel api={api} onSaved={onSaved} />}
        {panel.id === "stores" && <StoresPanel telemetry={telemetry} />}
        {panel.id === "integrations" && <IntegrationsPanel api={api} />}
        {panel.id === "agents" && <AgentsPanel telemetry={telemetry} />}
        {panel.id === "automation" && (
          <AutomationPanel api={api} actions={actions} onSaved={onSaved} />
        )}
        {panel.id === "finance" && <FinancePanel api={api} />}
        {panel.id === "permissions" && (
          <PermissionsPanel
            api={api}
            actions={actions}
            onEmergencyStop={actions.onEmergencyStop}
          />
        )}
        {panel.id === "notifications" && (
          <NotificationsPanel api={api} telemetry={telemetry} />
        )}
        {panel.id === "system" && <SystemPanel api={api} />}
      </div>
    </div>
  );
}

/** Exported for the navigation so the Settings route cannot drift from the panels. */
export const SETTINGS_PANEL_COUNT = PANELS.length;