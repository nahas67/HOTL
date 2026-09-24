"use client";

import { useState, type FormEvent } from "react";
import { ShopifyPanel } from "./shopify-panel";
import {
  ArrowUpRight,
  Cable,
  KeyRound,
  Plus,
  RefreshCw,
  Unplug,
} from "lucide-react";
import {
  ActionButton,
  Notice,
  timestamp,
  titleCase,
  useOperatingResource,
  type OperatingApi,
} from "./operating-pages";

type Provider = "shopify" | "woocommerce";
type Connection = {
  id: string;
  label: string;
  provider: Provider;
  host: string;
  status: string;
  revision: number;
  enabled: boolean;
  capabilities: string[];
  lastSyncAt: string | null;
  lastError: { code: string; message: string } | null;
  productCount: number;
  orderCount: number;
  readOnly: true;
};
type Manifest = {
  provider: Provider;
  name: string;
  apiVersion: string;
  capabilities: string[];
  requiredPermissions: Record<string, string[]>;
  limitations: string[];
};
type IntegrationData = {
  connections: Connection[];
  providers: Manifest[] | Record<string, Manifest>;
  setup: { vaultConfigured: boolean; allowedWooCommerceHosts: string[] };
  mode: string;
};
type Catalog = {
  products: {
    externalId: string;
    connectionId: string;
    title: string;
    status: string;
    updatedAt: string | null;
  }[];
  orders: {
    externalId: string;
    connectionId: string;
    number: string;
    status: string;
    total: { amount: string; currency: string };
    createdAt: string;
  }[];
};
const statusTone = (status: string) =>
  status === "CONNECTED"
    ? "green"
    : status === "DISCONNECTED"
      ? "neutral"
      : status === "DEGRADED" || status === "RATE_LIMITED"
        ? "amber"
        : "red";

export function IntegrationsPage({ api }: { api: OperatingApi }) {
  const resource = useOperatingResource<IntegrationData>(api, "integrations");
  const [form, setForm] = useState<"new" | Connection | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Connection | null>(null);
  const [disconnect, setDisconnect] = useState<Connection | null>(null);
  const [reason, setReason] = useState("");
  async function sync(connection: Connection) {
    setBusy(connection.id);
    setError("");
    setMessage("");
    try {
      const result = await api(`integrations/${connection.id}/sync`, "POST", {
        expectedRevision: connection.revision,
      });
      const sync = result.sync as
        { status?: string; error?: { message?: string } } | undefined;
      if (
        sync?.error ||
        (sync?.status &&
          ![
            "completed",
            "succeeded",
            "success",
            "COMPLETED",
            "SUCCEEDED",
          ].includes(sync.status))
      )
        setError(
          sync?.error?.message ??
            `Sync finished with status ${sync?.status}. Review the connection health before retrying.`,
        );
      else
        setMessage(
          "Sync response recorded. The connection card shows its current health and last successful sync.",
        );
      await resource.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sync failed.");
      await resource.refresh();
    } finally {
      setBusy("");
    }
  }
  async function confirmDisconnect(event: FormEvent) {
    event.preventDefault();
    if (!disconnect) return;
    setBusy(disconnect.id);
    setError("");
    try {
      await api(`integrations/${disconnect.id}/disconnect`, "POST", {
        expectedRevision: disconnect.revision,
        reason,
      });
      setMessage(
        "Connection disconnected. Imported business records are preserved.",
      );
      setDisconnect(null);
      setReason("");
      await resource.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Disconnect failed.");
    } finally {
      setBusy("");
    }
  }
  if (!resource.data)
    return (
      <div className="panel os-panel">
        <Notice error={!!resource.error}>
          {resource.error || "Loading integrations…"}
        </Notice>
        {resource.error && (
          <ActionButton onClick={() => void resource.refresh()}>
            Retry
          </ActionButton>
        )}
      </div>
    );
  const { connections, setup } = resource.data;
  const manifests = Array.isArray(resource.data.providers)
    ? resource.data.providers
    : Object.values(resource.data.providers);
  return (
    <div className="os-stack">
      <ShopifyPanel api={api} />
      <div className="os-toolbar">
        <div>
          <span className="eyebrow">YOUR CONNECTED BUSINESS</span>
          <h2>Bring your stores into one workspace.</h2>
          <p>
            Measured connection health, visible capabilities and a record of
            every sync.
          </p>
        </div>
        <ActionButton
          className="primary"
          onClick={() => {
            setForm("new");
            setError("");
          }}
          disabled={!setup.vaultConfigured}
        >
          <Plus size={15} />
          Add connection
        </ActionButton>
      </div>
      <Notice>
        Shopify and WooCommerce connections import read-only product and order
        snapshots. A successful sync proves the access used at that time.
        These credential-based connectors stay read only. Shopify OAuth and
        guarded staging operations are managed in the separate section above.
      </Notice>
      {!setup.vaultConfigured && (
        <Notice error>
          The server credential vault is not configured. Add its encryption key
          in server configuration before connecting a store.
        </Notice>
      )}
      {(resource.error || error) && (
        <Notice error>{error || resource.error}</Notice>
      )}
      {message && <Notice>{message}</Notice>}
      {form && (
        <ConnectionForm
          key={form === "new" ? "new" : form.id}
          api={api}
          connection={form === "new" ? undefined : form}
          setup={setup}
          onCancel={() => setForm(null)}
          onSaved={async () => {
            setForm(null);
            setMessage(
              "Credentials saved securely on the server. Run a sync to verify current access.",
            );
            await resource.refresh();
          }}
        />
      )}
      {disconnect && (
        <form className="panel os-panel" onSubmit={confirmDisconnect}>
          <h2>Disconnect {disconnect.label}</h2>
          <p className="os-footnote">
            This stops future syncs and preserves imported records. Revoke the
            token with your provider if you also want to remove its access.
          </p>
          <label className="form-label">
            Reason
            <input
              required
              minLength={3}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="os-toolbar-actions">
            <ActionButton type="button" onClick={() => setDisconnect(null)}>
              Cancel
            </ActionButton>
            <ActionButton
              type="submit"
              className="danger"
              busy={busy === disconnect.id}
            >
              Disconnect store
            </ActionButton>
          </div>
        </form>
      )}
      <div className="os-connection-grid">
        {connections.map((connection) => (
          <section key={connection.id} className="panel os-connection-card">
            <div className="os-connection-heading">
              <span className="os-provider-mark">
                <Cable size={23} />
              </span>
              <div>
                <h2>{connection.label}</h2>
                <p>
                  {titleCase(connection.provider)} · {connection.host}
                </p>
              </div>
              <span className={`badge ${statusTone(connection.status)}`}>
                {titleCase(connection.status)}
              </span>
            </div>
            <dl className="os-ledger">
              <div>
                <dt>Last successful sync</dt>
                <dd>{timestamp(connection.lastSyncAt)}</dd>
              </div>
              <div>
                <dt>Imported product snapshots</dt>
                <dd>{connection.productCount}</dd>
              </div>
              <div>
                <dt>Imported order snapshots</dt>
                <dd>{connection.orderCount}</dd>
              </div>
            </dl>
            <div className="os-capabilities">
              {connection.capabilities.map((capability) => (
                <span key={capability}>{capability}</span>
              ))}
            </div>
            {connection.lastError && (
              <Notice error>
                {connection.lastError.code}: {connection.lastError.message}
              </Notice>
            )}
            <div className="os-connection-actions">
              <ActionButton
                onClick={() => void sync(connection)}
                busy={busy === connection.id}
                disabled={!connection.enabled}
              >
                <RefreshCw size={14} />
                Sync now
              </ActionButton>
              <ActionButton onClick={() => setSelected(connection)}>
                <ArrowUpRight size={14} />
                View imports
              </ActionButton>
              <button
                className="icon-button"
                aria-label={`Update credentials for ${connection.label}`}
                title="Update credentials"
                onClick={() => setForm(connection)}
              >
                <KeyRound size={17} />
              </button>
              <button
                className="icon-button"
                aria-label={`Disconnect ${connection.label}`}
                title="Disconnect"
                disabled={!connection.enabled}
                onClick={() => {
                  setDisconnect(connection);
                  setReason("");
                }}
              >
                <Unplug size={17} />
              </button>
            </div>
            {connection.status === "DISCONNECTED" && (
              <p className="os-footnote">
                {connection.enabled
                  ? "Run a sync to verify current access. No successful connection has been confirmed yet."
                  : "Sync is disabled. Update credentials to reconnect; provider token revocation is managed with your provider."}
              </p>
            )}
          </section>
        ))}
      </div>
      {!connections.length && (
        <section className="panel os-empty">
          <Cable size={28} />
          <h2>No stores connected yet</h2>
          <p>
            Add read-only store credentials, then run a sync to verify access
            and import records.
          </p>
        </section>
      )}
      {selected && (
        <ImportedCatalog
          api={api}
          connection={selected}
          onClose={() => setSelected(null)}
        />
      )}
      <section className="panel os-panel">
        <div className="os-section-heading">
          <h2>Available connectors</h2>
          <p>
            Only the capabilities below have adapters. A credential alone does
            not enable more authority.
          </p>
        </div>
        <div className="os-fields-grid">
          {manifests.map((manifest) => (
            <details className="os-manifest" key={manifest.provider}>
              <summary>
                <strong>{manifest.name}</strong>
                <span>Read only · API {manifest.apiVersion}</span>
              </summary>
              <p>
                Required permissions:{" "}
                {[
                  ...new Set(
                    Object.values(manifest.requiredPermissions).flat(),
                  ),
                ].join(", ")}
              </p>
              <ul>
                {manifest.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function ConnectionForm({
  api,
  connection,
  setup,
  onSaved,
  onCancel,
}: {
  api: OperatingApi;
  connection?: Connection;
  setup: IntegrationData["setup"];
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [provider, setProvider] = useState<Provider>(
    connection?.provider ?? "shopify",
  );
  const [label, setLabel] = useState(connection?.label ?? "");
  const [host, setHost] = useState(
    connection
      ? connection.provider === "woocommerce"
        ? `https://${connection.host}`
        : connection.host
      : "",
  );
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const credentials =
      provider === "shopify"
        ? { shop: host, accessToken: secret }
        : { baseUrl: host, consumerKey: key, consumerSecret: secret, currency };
    try {
      await api(
        connection
          ? `integrations/${connection.id}/credentials`
          : "integrations",
        "POST",
        connection
          ? { expectedRevision: connection.revision, credentials }
          : { label, provider, credentials },
      );
      setKey("");
      setSecret("");
      await onSaved();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Credentials could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel os-panel" onSubmit={submit}>
      <div className="os-section-heading">
        <h2>
          {connection
            ? `Update ${connection.label} credentials`
            : "Connect a store"}
        </h2>
        <p>
          Credentials are sent through the owner API to the server vault. They
          are never returned in connection records or stored in browser storage.
        </p>
      </div>
      <div className="os-fields-grid">
        <label className="form-label">
          Provider
          <select
            disabled={!!connection}
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as Provider);
              setHost("");
              setKey("");
              setSecret("");
            }}
          >
            <option value="shopify">Shopify</option>
            <option value="woocommerce">WooCommerce</option>
          </select>
        </label>
        {!connection && (
          <label className="form-label">
            Connection name
            <input
              required
              maxLength={100}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Main storefront"
            />
          </label>
        )}
        <label className="form-label">
          {provider === "shopify" ? "Shop domain" : "Store HTTPS URL"}
          <input
            required
            maxLength={2000}
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder={
              provider === "shopify"
                ? "your-store.myshopify.com"
                : "https://store.example.com"
            }
          />
        </label>
        {provider === "woocommerce" && (
          <>
            <label className="form-label">
              Consumer key <span>Read-only key</span>
              <input
                type="password"
                autoComplete="off"
                required
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
            </label>
            <label className="form-label">
              Store currency
              <input
                required
                pattern="[A-Z]{3}"
                maxLength={3}
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value.toUpperCase())
                }
              />
            </label>
          </>
        )}
        <label className="form-label">
          {provider === "shopify"
            ? "Admin API access token"
            : "Consumer secret"}
          <input
            type="password"
            autoComplete="new-password"
            required
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
          />
        </label>
      </div>
      {provider === "woocommerce" && (
        <Notice>
          Server-approved hosts:{" "}
          {setup.allowedWooCommerceHosts.join(", ") || "None configured"}. Store
          hosts must be added in server configuration before use.
        </Notice>
      )}
      {error && <Notice error>{error}</Notice>}
      <div className="os-toolbar-actions">
        <ActionButton type="button" onClick={onCancel}>
          Cancel
        </ActionButton>
        <ActionButton type="submit" className="primary" busy={busy}>
          Save credentials
        </ActionButton>
      </div>
    </form>
  );
}

function ImportedCatalog({
  api,
  connection,
  onClose,
}: {
  api: OperatingApi;
  connection: Connection;
  onClose: () => void;
}) {
  const { data, error, loading, refresh } = useOperatingResource<Catalog>(
    api,
    `integration-catalog?connectionId=${encodeURIComponent(connection.id)}`,
  );
  const [tab, setTab] = useState("products");
  return (
    <section className="panel os-panel">
      <div className="os-toolbar">
        <div>
          <h2>{connection.label} imports</h2>
          <p>
            Read-only provider snapshots. These records are separate from the
            local simulation catalog.
          </p>
        </div>
        <ActionButton onClick={onClose}>Close imports</ActionButton>
      </div>
      <div className="os-tabs">
        {["products", "orders"].map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={tab === value ? "active" : ""}
          >
            {titleCase(value)}
          </button>
        ))}
      </div>
      {error ? (
        <Notice error>
          {error}
          <button onClick={() => void refresh()}>Retry</button>
        </Notice>
      ) : loading ? (
        <p className="os-empty">Loading imported records…</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {(tab === "products"
                  ? ["Product", "Provider ID", "Status", "Source updated"]
                  : ["Order", "Provider ID", "Status", "Total"]
                ).map((value) => (
                  <th key={value}>{value}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab === "products"
                ? data?.products.map((product) => (
                    <tr key={`${product.connectionId}-${product.externalId}`}>
                      <td>{product.title}</td>
                      <td className="mono">{product.externalId}</td>
                      <td>{titleCase(product.status)}</td>
                      <td>{timestamp(product.updatedAt)}</td>
                    </tr>
                  ))
                : data?.orders.map((order) => (
                    <tr key={`${order.connectionId}-${order.externalId}`}>
                      <td>{order.number}</td>
                      <td className="mono">{order.externalId}</td>
                      <td>{titleCase(order.status)}</td>
                      <td>
                        {order.total.amount} {order.total.currency}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {!data?.[tab === "products" ? "products" : "orders"].length && (
            <p className="os-empty">
              No {tab} imported yet. Run a successful sync to populate this
              view.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
