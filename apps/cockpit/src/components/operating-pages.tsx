"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  CheckCircle2,
  History,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  autonomyDomains,
  constitutionPatchSchema,
  type BusinessConstitution,
  type ConstitutionHistory,
} from "@hotl/schemas";

export type OperatingApi = (
  path: string,
  method?: string,
  body?: unknown,
  customToken?: string,
) => Promise<Record<string, unknown>>;
export type ConstitutionResponse = {
  constitution: BusinessConstitution;
  history: ConstitutionHistory[];
};
export const titleCase = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (value) => value.toUpperCase());
export const usd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
export const timestamp = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Never";

export function ActionButton({
  children,
  busy,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      className={`button ${props.className ?? ""}`}
      disabled={props.disabled || busy}
    >
      {busy && <LoaderCircle size={15} className="spin" />}
      {children}
    </button>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`os-notice ${error ? "os-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {error ? <TriangleAlert size={17} /> : <ShieldCheck size={17} />}
      <span>{children}</span>
    </div>
  );
}
export function useOperatingResource<T>(api: OperatingApi, path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api(path);
      setData(result as unknown as T);
      setError("");
      return result as unknown as T;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to load this view.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [api, path]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { data, error, loading, refresh };
}
function ResourceState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => unknown;
}) {
  return (
    <div className="panel os-panel">
      {error ? (
        <>
          <Notice error>{error}</Notice>
          <ActionButton onClick={() => void retry()}>
            <RefreshCw size={15} />
            Retry connection
          </ActionButton>
        </>
      ) : (
        <div className="os-loading" role="status">
          <LoaderCircle className="spin" size={22} />
          {loading ? "Loading operating policy…" : "No policy available."}
        </div>
      )}
    </div>
  );
}
const modeDescriptions: Record<string, string> = {
  MANUAL:
    "Agents may analyze. Every consequential action stays under owner control.",
  COPILOT: "Agents prepare proposals. The owner decides what can proceed.",
  SUPERVISED:
    "Eligible routine actions may run within limits. Other actions need review.",
  AUTONOMOUS:
    "Agents may act within the constitution, granted scopes and mandatory guardrails.",
  CUSTOM: "Each business domain follows its own mode and limit below.",
};

export function ConstitutionPage({
  api,
  onSaved,
}: {
  api: OperatingApi;
  onSaved: () => Promise<void>;
}) {
  const resource = useOperatingResource<ConstitutionResponse>(
    api,
    "constitution",
  );
  const [draft, setDraft] = useState<BusinessConstitution | null>(null);
  const [tab, setTab] = useState("strategy");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [advisory, setAdvisory] = useState("");
  const [countryInputs, setCountryInputs] = useState({
    permittedCountries: "",
    prohibitedCountries: "",
  });
  function loadCountries(policy: BusinessConstitution) {
    setCountryInputs({
      permittedCountries: policy.permittedCountries.join(", "),
      prohibitedCountries: policy.prohibitedCountries.join(", "),
    });
  }
  useEffect(() => {
    if (resource.data && !draft) {
      setDraft(resource.data.constitution);
      loadCountries(resource.data.constitution);
      setAdvisory(JSON.stringify(resource.data.constitution.advisory, null, 2));
    }
  }, [resource.data, draft]);
  async function reload() {
    const loaded = await resource.refresh();
    if (loaded) {
      setDraft(loaded.constitution);
      loadCountries(loaded.constitution);
      setAdvisory(JSON.stringify(loaded.constitution.advisory, null, 2));
      setReason("");
      setError("");
      setMessage("");
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { version, updatedAt: _updatedAt, ...fields } = draft;
      const body = constitutionPatchSchema.parse({
        ...fields,
        goals: lines(fields.goals.join("\n")),
        prohibitedCategories: lines(fields.prohibitedCategories.join("\n")),
        permittedCountries: countryInputs.permittedCountries
          .split(",")
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean),
        prohibitedCountries: countryInputs.prohibitedCountries
          .split(",")
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean),
        advisory: JSON.parse(advisory),
        expectedVersion: version,
        reason,
      });
      await api("constitution", "PATCH", body);
      const loaded = await resource.refresh();
      if (loaded) {
        setDraft(loaded.constitution);
        loadCountries(loaded.constitution);
        setAdvisory(JSON.stringify(loaded.constitution.advisory, null, 2));
      }
      setReason("");
      setMessage(
        "Constitution saved. Earlier versioned proposals are expired; agents must prepare new proposals under this version. Legacy requests need an explicit current-policy review.",
      );
      await onSaved();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The policy could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!draft)
    return (
      <ResourceState
        loading={resource.loading}
        error={resource.error}
        retry={resource.refresh}
      />
    );
  const set = <K extends keyof BusinessConstitution>(
    key: K,
    value: BusinessConstitution[K],
  ) => setDraft({ ...draft, [key]: value });
  const lines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  const amountFields = [
    ["dailyAdSpendCeiling", "Daily advertising ceiling"],
    ["monthlyAdSpendCeiling", "Monthly advertising ceiling"],
    ["maxSupplierPurchase", "Maximum supplier purchase"],
    ["maxAutonomousTransaction", "Maximum autonomous transaction"],
    ["autoRefundThreshold", "Automatic refund threshold"],
  ] as const;
  return (
    <form onSubmit={save} className="os-stack">
      <div className="os-policy-banner">
        <span className="os-policy-icon">
          <ShieldCheck size={24} />
        </span>
        <div>
          <span className="eyebrow">BUSINESS CONSTITUTION</span>
          <h2>One operating policy. Your authority.</h2>
          <p>
            Version {draft.version} · Updated {timestamp(draft.updatedAt)}
          </p>
        </div>
        <ActionButton
          type="button"
          onClick={() => void reload()}
          busy={resource.loading}
        >
          <RefreshCw size={15} />
          Reload saved policy
        </ActionButton>
      </div>
      <div
        className="os-tabs"
        role="tablist"
        aria-label="Constitution settings"
      >
        {[
          ["strategy", "Business & goals"],
          ["autonomy", "Autonomy modes"],
          ["limits", "Financial limits"],
          ["boundaries", "Markets & rules"],
          ["history", "Version history"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`constitution-${id}`}
            onClick={() => setTab(id)}
            className={tab === id ? "active" : ""}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="panel os-panel"
        role="tabpanel"
        id={`constitution-${tab}`}
      >
        {tab === "strategy" && (
          <>
            <div className="os-section-heading">
              <h2>What your business is working toward</h2>
              <p>Give the team a shared name, goals and operating context.</p>
            </div>
            <label className="form-label">
              Workspace name
              <input
                required
                minLength={2}
                maxLength={80}
                value={draft.projectName}
                onChange={(event) => set("projectName", event.target.value)}
              />
            </label>
            <label className="form-label">
              Business goals <span>One goal per line</span>
              <textarea
                rows={6}
                value={draft.goals.join("\n")}
                onChange={(event) =>
                  set("goals", event.target.value.split("\n"))
                }
              />
            </label>
            <label className="form-label">
              Advisory context <span>JSON object with text values</span>
              <textarea
                className="mono"
                rows={5}
                value={advisory}
                onChange={(event) => setAdvisory(event.target.value)}
              />
            </label>
            <Notice>
              Goals and advisory context guide recommendations. Numeric limits
              and deterministic guardrails decide whether an action may execute.
            </Notice>
          </>
        )}
        {tab === "autonomy" && (
          <>
            <div className="os-section-heading">
              <h2>Decide where your team can act</h2>
              <p>A paused domain cannot execute, regardless of its mode.</p>
            </div>
            <div className="os-mode-options">
              {Object.keys(modeDescriptions).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() =>
                    set("mode", mode as BusinessConstitution["mode"])
                  }
                  aria-pressed={draft.mode === mode}
                  className={draft.mode === mode ? "selected" : ""}
                >
                  <strong>{titleCase(mode)}</strong>
                  <span>{modeDescriptions[mode]}</span>
                  {draft.mode === mode && <CheckCircle2 size={17} />}
                </button>
              ))}
            </div>
            <Notice>
              {draft.mode === "CUSTOM"
                ? "Per-domain modes below are active. Domain amount limits remain subject to the overall financial ceilings."
                : "The selected global mode governs every domain. Per-domain modes are used when Custom is selected; pause and amount limits remain available."}{" "}
              Unimplemented business domains do not acquire execution
              capabilities by changing a mode.
            </Notice>
            <div className="os-domain-list">
              {autonomyDomains.map((domain) => (
                <div className="os-domain-row" key={domain}>
                  <strong>{titleCase(domain)}</strong>
                  <label>
                    <span className="sr-only">{titleCase(domain)} mode</span>
                    <select
                      disabled={draft.mode !== "CUSTOM"}
                      value={draft.domains[domain].mode}
                      onChange={(event) =>
                        set("domains", {
                          ...draft.domains,
                          [domain]: {
                            ...draft.domains[domain],
                            mode: event.target
                              .value as BusinessConstitution["domains"][typeof domain]["mode"],
                          },
                        })
                      }
                    >
                      {Object.keys(modeDescriptions)
                        .filter((mode) => mode !== "CUSTOM")
                        .map((mode) => (
                          <option key={mode} value={mode}>
                            {titleCase(mode)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="os-domain-amount">
                    <span>Auto limit · USD</span>
                    <input
                      aria-label={`${titleCase(domain)} automatic action limit`}
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      required
                      value={draft.domains[domain].maxAutoActionAmount}
                      onChange={(event) =>
                        set("domains", {
                          ...draft.domains,
                          [domain]: {
                            ...draft.domains[domain],
                            maxAutoActionAmount: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="os-checkbox">
                    <input
                      type="checkbox"
                      checked={draft.domains[domain].paused}
                      onChange={(event) =>
                        set("domains", {
                          ...draft.domains,
                          [domain]: {
                            ...draft.domains[domain],
                            paused: event.target.checked,
                          },
                        })
                      }
                    />
                    Paused
                  </label>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "limits" && (
          <>
            <div className="os-section-heading">
              <h2>Keep every action inside your budget</h2>
              <p>
                Amounts are USD. A policy edit does not authorize a provider
                action.
              </p>
            </div>
            <div className="os-fields-grid">
              {amountFields.map(([key, label]) => (
                <label className="form-label" key={key}>
                  {label}
                  <span>USD</span>
                  <input
                    type="number"
                    required
                    min={key.includes("Ceiling") ? "0.01" : "0"}
                    max={key === "autoRefundThreshold" ? 25 : 1000000}
                    step="0.01"
                    value={draft[key]}
                    onChange={(event) => set(key, Number(event.target.value))}
                  />
                </label>
              ))}
              <label className="form-label">
                Minimum margin <span>40–99%</span>
                <input
                  type="number"
                  required
                  min="40"
                  max="99"
                  step="0.01"
                  value={Number((draft.marginFloor * 100).toFixed(2))}
                  onChange={(event) =>
                    set("marginFloor", Number(event.target.value) / 100)
                  }
                />
              </label>
              <label className="form-label">
                Maximum price change <span>Percent per action</span>
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.01"
                  value={draft.maxPriceChangePct}
                  onChange={(event) =>
                    set("maxPriceChangePct", Number(event.target.value))
                  }
                />
              </label>
            </div>
            <Notice>
              The mandatory 40% margin floor and $25 automatic refund ceiling
              cannot be weakened. Refund exposure is cumulative per order.
            </Notice>
          </>
        )}
        {tab === "boundaries" && (
          <>
            <div className="os-section-heading">
              <h2>Markets, product boundaries and hard rules</h2>
              <p>
                Use uppercase two-letter country codes. Separate entries with
                commas.
              </p>
            </div>
            {(["permittedCountries", "prohibitedCountries"] as const).map(
              (key) => (
                <label className="form-label" key={key}>
                  {titleCase(key.replace(/([A-Z])/g, " $1"))}
                  <input
                    value={countryInputs[key]}
                    onChange={(event) =>
                      setCountryInputs({
                        ...countryInputs,
                        [key]: event.target.value.toUpperCase(),
                      })
                    }
                    placeholder="US, GB, IN"
                  />
                </label>
              ),
            )}
            <label className="form-label">
              Prohibited product categories <span>One per line</span>
              <textarea
                rows={4}
                value={draft.prohibitedCategories.join("\n")}
                onChange={(event) =>
                  set("prohibitedCategories", event.target.value.split("\n"))
                }
              />
            </label>
            <div className="os-section-heading">
              <h2>Mandatory operating rules</h2>
              <p>
                These descriptions do not replace the guardrail service’s
                enforced policies.
              </p>
            </div>
            <ul className="os-rules">
              {draft.hardRules.map((rule, index) => (
                <li key={index}>
                  <ShieldCheck size={15} />
                  {rule}
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === "history" && (
          <>
            <div className="os-section-heading">
              <h2>Every policy change has a record</h2>
              <p>
                Review the author, reason and exact policy snapshot for each
                version.
              </p>
            </div>
            {(resource.data?.history ?? [])
              .slice()
              .reverse()
              .map((entry) => (
                <details key={entry.version} className="os-history">
                  <summary>
                    <History size={16} />
                    <strong>Version {entry.version}</strong>
                    <span>{timestamp(entry.changedAt)}</span>
                  </summary>
                  <p>{entry.reason}</p>
                  <small>Changed by {entry.changedBy}</small>
                  <pre>{JSON.stringify(entry.constitution, null, 2)}</pre>
                </details>
              ))}
          </>
        )}
      </div>
      {resource.error && (
        <Notice error>
          Refresh failed; this is the last loaded policy. {resource.error}
        </Notice>
      )}
      {error && (
        <Notice error>
          {error} Your edits remain here. If the policy changed elsewhere,
          reload the saved policy and review it before trying again.
        </Notice>
      )}
      {message && <Notice>{message}</Notice>}
      <div className="panel os-save-bar">
        <label className="form-label">
          Reason for this change
          <input
            required
            minLength={3}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Record why you are updating the operating policy"
          />
        </label>
        <ActionButton className="primary" type="submit" busy={busy}>
          Save constitution <ArrowRight size={15} />
        </ActionButton>
      </div>
    </form>
  );
}
