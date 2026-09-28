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
  emptyPilotDraft,
  PILOT_ECONOMICS_FORMULA_VERSION,
  pilotDraftSchema,
  pilotDraftReadSchema,
  pilotEconomicsCalculationIssues,
  pilotStopMetricSchema,
  type BusinessConstitution,
  type ConstitutionHistory,
  type PilotDraft,
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

type PilotSection = "profile" | "economics" | "capital";
type PilotDatum = {
  value: string | number | null;
  provenance: "UNKNOWN" | "OWNER_ENTERED" | "PROVIDER_OBSERVED" | "CONTRACTUAL" | "CALCULATED" | "ESTIMATED";
  evidenceRef?: string;
};
type PilotField = { key: string; label: string; kind: "text" | "money" | "ratio" | "country" | "currency" | "channel" };
const pilotFields: Record<PilotSection, PilotField[]> = {
  profile: [
    { key: "country", label: "Pilot country", kind: "country" },
    { key: "salesChannel", label: "Sales channel", kind: "channel" },
    { key: "customerProfile", label: "Customer profile", kind: "text" },
    { key: "productCategory", label: "Product or category", kind: "text" },
    { key: "supplierModel", label: "Supplier model", kind: "text" },
    { key: "fulfillmentModel", label: "Fulfillment model", kind: "text" },
    { key: "currency", label: "Currency", kind: "currency" },
    { key: "returnModel", label: "Return model", kind: "text" },
    { key: "expectedOrderValue", label: "Expected order value", kind: "money" },
    { key: "initialSalesTarget", label: "Initial sales target (period in evidence)", kind: "money" },
  ],
  economics: [
    { key: "supplierProductCost", label: "Supplier product cost", kind: "money" },
    { key: "inboundFreight", label: "Inbound freight", kind: "money" },
    { key: "outboundShipping", label: "Outbound shipping", kind: "money" },
    { key: "packaging", label: "Packaging", kind: "money" },
    { key: "storeFees", label: "Store or channel fees", kind: "money" },
    { key: "paymentFees", label: "Payment fees", kind: "money" },
    { key: "advertisingAcquisition", label: "Planned advertising acquisition cost per order", kind: "money" },
    { key: "refundAllowance", label: "Refund allowance", kind: "money" },
    { key: "returnAllowance", label: "Return allowance", kind: "money" },
    { key: "fulfillmentExpense", label: "Fulfillment expense", kind: "money" },
    { key: "taxHandling", label: "Tax handling and reserves", kind: "text" },
    { key: "taxAndDutyPerOrder", label: "Tax and duty cost per order", kind: "money" },
    { key: "targetContribution", label: "Target contribution per order (after modeled variable costs)", kind: "money" },
    { key: "breakEvenCac", label: "Break-even CAC amount per order", kind: "money" },
    { key: "breakEvenRoas", label: "Break-even ROAS ratio", kind: "ratio" },
  ],
  capital: [
    { key: "maxPilotCapital", label: "Maximum pilot capital", kind: "money" },
    { key: "protectedReserve", label: "Protected cash reserve", kind: "money" },
    { key: "maxDailySpend", label: "Maximum daily spend", kind: "money" },
    { key: "maxWeeklySpend", label: "Maximum weekly spend", kind: "money" },
    { key: "maxMonthlySpend", label: "Maximum monthly spend", kind: "money" },
    { key: "maxAdvertisingExposure", label: "Maximum advertising exposure", kind: "money" },
    { key: "maxSupplierExposure", label: "Maximum supplier exposure", kind: "money" },
    { key: "maxInventoryExposure", label: "Maximum inventory exposure", kind: "money" },
    { key: "maxExperimentLoss", label: "Maximum experiment loss", kind: "money" },
    { key: "maxRefundAuthority", label: "Maximum refund authority", kind: "money" },
    { key: "maxSingleAutonomousTransaction", label: "Maximum single autonomous transaction", kind: "money" },
  ],
};
const pilotProvenance = ["UNKNOWN", "OWNER_ENTERED", "PROVIDER_OBSERVED", "CONTRACTUAL", "CALCULATED", "ESTIMATED"] as const;
type PilotStopMetric = (typeof pilotStopMetricSchema.options)[number];
function stopUnitForMetric(metric: PilotStopMetric): PilotDraft["stopRules"][number]["unit"] {
  if (metric === "REFUND_RATE" || metric === "CHARGEBACK_RATE") return "FRACTION";
  if (metric === "CONTRIBUTION_LOSS" || metric === "UNEXPECTED_SPEND") return "CURRENCY_AMOUNT";
  return "COUNT";
}

export function pilotDraftGaps(draft: PilotDraft): string[] {
  const gaps = (Object.keys(pilotFields) as PilotSection[]).flatMap((section) =>
    pilotFields[section].flatMap(({ key, label }) =>
      (() => {
        const field = (draft[section] as unknown as Record<string, PilotDatum>)[key];
        if (!field || field.provenance === "UNKNOWN" || field.value === null) return [label];
        if (typeof field.value === "string" && !field.value.trim()) return [label];
        if (typeof field.value === "number" && !Number.isFinite(field.value)) return [label];
        if (!field.evidenceRef?.trim()) return [`${label} needs evidence`];
        if (field.provenance === "ESTIMATED") return [`${label} is estimated`];
        if (section === "economics" && field.provenance === "CALCULATED" && !["targetContribution", "breakEvenCac", "breakEvenRoas"].includes(key)) return [`${label} needs a source observation`];
        if (section === "capital" && field.provenance !== "OWNER_ENTERED") return [`${label} needs owner-entered authority`];
        return [];
      })(),
    ),
  );
  for (const metric of ["UNCERTAIN_PROVIDER_OPERATIONS", "PROVIDER_RECONCILIATION_FAILURES"]) {
    if (!draft.stopRules.some((rule) => rule.metric === metric && rule.enabled && rule.threshold >= 1))
      gaps.push(`${titleCase(metric)} stop rule`);
  }
  for (const rule of draft.stopRules) {
    if (rule.enabled && !["UNCERTAIN_PROVIDER_OPERATIONS", "PROVIDER_RECONCILIATION_FAILURES"].includes(rule.metric))
      gaps.push(`${titleCase(rule.metric)} has no live deterministic signal yet`);
  }
  if (draft.profile.currency.value !== null && draft.profile.currency.value !== "USD") gaps.push("Pilot currency must be USD for current guardrails");
  for (const issue of pilotEconomicsCalculationIssues(draft)) gaps.push(`${titleCase(issue.field)}: ${issue.message}`);
  return gaps;
}

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
  const [pilotDraft, setPilotDraft] = useState<PilotDraft>(emptyPilotDraft);
  const [pilotReason, setPilotReason] = useState("");
  const [pilotApprovalReason, setPilotApprovalReason] = useState("");
  const [newStopMetric, setNewStopMetric] = useState("");
  const [pilotBusy, setPilotBusy] = useState(false);
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
      setPilotDraft(pilotDraftReadSchema.parse(resource.data.constitution.pilot?.draft ?? emptyPilotDraft()));
      loadCountries(resource.data.constitution);
      setAdvisory(JSON.stringify(resource.data.constitution.advisory, null, 2));
    }
  }, [resource.data, draft]);
  async function reload() {
    const loaded = await resource.refresh();
    if (loaded) {
      setDraft(loaded.constitution);
      setPilotDraft(pilotDraftReadSchema.parse(loaded.constitution.pilot?.draft ?? emptyPilotDraft()));
      loadCountries(loaded.constitution);
      setAdvisory(JSON.stringify(loaded.constitution.advisory, null, 2));
      setReason("");
      setPilotReason("");
      setPilotApprovalReason("");
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
      const { version, updatedAt: _updatedAt, pilot: _pilot, ...fields } = draft;
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
      const result = await api("constitution", "PATCH", body);
      if (result.decision !== "allow") throw new Error(String(result.reason ?? "The policy change was denied."));
      const loaded = await resource.refresh();
      if (!loaded) {
        setMessage("The change was accepted, but the latest policy could not be loaded. Reload before making another change.");
        return;
      }
      if (loaded) {
        setDraft(loaded.constitution);
        setPilotDraft(pilotDraftReadSchema.parse(loaded.constitution.pilot?.draft ?? emptyPilotDraft()));
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
  function updatePilotField(section: PilotSection, key: string, value: PilotDatum) {
    setPilotDraft((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    } as PilotDraft));
  }
  async function savePilot() {
    if (!draft) return;
    setPilotBusy(true);
    setError("");
    setMessage("");
    try {
      const body = constitutionPatchSchema.parse({
        expectedVersion: draft.version,
        reason: pilotReason,
        pilotDraft: pilotDraftSchema.parse(pilotDraft),
      });
      const result = await api("constitution", "PATCH", body);
      if (result.decision !== "allow") throw new Error(String(result.reason ?? "The pilot draft was denied."));
      const loaded = await resource.refresh();
      if (!loaded) {
        setMessage("The pilot draft was accepted, but the latest version could not be loaded. Reload before requesting approval.");
        return;
      }
      if (loaded) {
        setDraft(loaded.constitution);
        setPilotDraft(pilotDraftReadSchema.parse(loaded.constitution.pilot?.draft ?? emptyPilotDraft()));
        loadCountries(loaded.constitution);
        setAdvisory(JSON.stringify(loaded.constitution.advisory, null, 2));
      }
      setPilotReason("");
      setMessage("Pilot draft saved as a new Constitution version. Owner approval is still required; unknown values remain blocked.");
      await onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The pilot draft could not be saved.");
    } finally {
      setPilotBusy(false);
    }
  }
  async function approvePilot() {
    if (!draft || !draft.pilot) return;
    setPilotBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("constitution/pilot/approve", "POST", {
        expectedVersion: draft.version,
        reason: pilotApprovalReason.trim(),
      });
      if (result.decision !== "allow") throw new Error(String(result.reason ?? "Pilot approval was denied."));
      const loaded = await resource.refresh();
      if (!loaded) {
        setMessage("The approval was accepted, but the latest status could not be loaded. Reload to verify the approved version.");
        return;
      }
      if (loaded) {
        setDraft(loaded.constitution);
        setPilotDraft(pilotDraftReadSchema.parse(loaded.constitution.pilot?.draft ?? emptyPilotDraft()));
        loadCountries(loaded.constitution);
        setAdvisory(JSON.stringify(loaded.constitution.advisory, null, 2));
      }
      setPilotApprovalReason("");
      setMessage("Pilot envelope approved by the owner. Provider and deployment gates still require their own evidence.");
      await onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Pilot approval was denied.");
    } finally {
      setPilotBusy(false);
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
  const storedPilot = draft.pilot?.draft;
  const pilotHasUnsavedEdits = JSON.stringify(pilotDraft) !== JSON.stringify(storedPilot ?? emptyPilotDraft());
  const pilotGaps = pilotDraftGaps(pilotDraft);
  const pilotApproved = draft.pilot?.approval?.constitutionVersion === draft.version;
  function renderPilotField(section: PilotSection, field: PilotField) {
    const item = (pilotDraft[section] as unknown as Record<string, PilotDatum>)[field.key];
    const unknown = item.provenance === "UNKNOWN";
    const fieldId = `pilot-${section}-${field.key}`;
    const inputValue = unknown || item.value === null || (typeof item.value === "number" && !Number.isFinite(item.value)) ? "" : item.value;
    const update = (changes: Partial<PilotDatum>) => updatePilotField(section, field.key, { ...item, ...changes });
    return (
      <fieldset key={field.key} className="os-pilot-field">
        <legend>{field.label}</legend>
        <div className="os-pilot-field-grid">
          <label className="form-label" htmlFor={fieldId}>
            Value {field.kind === "money" && <span>{pilotDraft.profile.currency.value ?? "Currency UNKNOWN"}</span>}
            {field.kind === "ratio" && <span>ratio (×)</span>}
            {field.kind === "channel" ? (
              <select id={fieldId} disabled={unknown} value={inputValue} onChange={(event) => update({ value: event.target.value })}>
                <option value="">Select channel</option>
                <option value="SHOPIFY_DEVELOPMENT_STORE">Shopify development store</option>
                <option value="OTHER">Other</option>
              </select>
            ) : (
              <input
                id={fieldId}
                type={field.kind === "money" || field.kind === "ratio" ? "number" : "text"}
                min={field.kind === "money" || field.kind === "ratio" ? "0" : undefined}
                max={field.kind === "money" ? "1000000" : field.kind === "ratio" ? "100000" : undefined}
                step={field.kind === "money" ? "0.01" : field.kind === "ratio" ? "0.0001" : undefined}
                maxLength={field.kind === "country" ? 2 : field.kind === "currency" ? 3 : 500}
                disabled={unknown}
                value={inputValue}
                placeholder={unknown ? "UNKNOWN" : "Enter value"}
                onChange={(event) => update({ value: field.kind === "money" || field.kind === "ratio" ? (event.target.value === "" ? Number.NaN : Number(event.target.value)) : ["country", "currency"].includes(field.kind) ? event.target.value.toUpperCase() : event.target.value })}
              />
            )}
          </label>
          <label className="form-label">
            Provenance
            <select
              aria-label={`${field.label} provenance`}
              value={item.provenance}
              onChange={(event) => {
                const provenance = event.target.value as PilotDatum["provenance"];
                updatePilotField(section, field.key, provenance === "UNKNOWN"
                  ? { value: null, provenance: "UNKNOWN" }
                  : { value: unknown ? (field.kind === "money" || field.kind === "ratio" ? Number.NaN : "") : item.value, provenance,
                      evidenceRef: provenance === "CALCULATED" ? PILOT_ECONOMICS_FORMULA_VERSION : unknown ? "" : item.evidenceRef ?? "" });
              }}
            >
              {pilotProvenance.map((source) => <option key={source} value={source}>{titleCase(source)}</option>)}
            </select>
          </label>
        </div>
        {!unknown && (
          <label className="form-label" htmlFor={`${fieldId}-evidence`}>
            Evidence reference <span>Document, contract, provider record or dated owner decision</span>
            <input id={`${fieldId}-evidence`} maxLength={500} value={item.evidenceRef ?? ""} onChange={(event) => update({ evidenceRef: event.target.value })} placeholder="Source and date" />
          </label>
        )}
        {field.key === "breakEvenRoas" && <p className="os-pilot-help">Calculated metrics use {PILOT_ECONOMICS_FORMULA_VERSION}; break-even ROAS is expected order value divided by pre-ad contribution per order.</p>}
      </fieldset>
    );
  }
  return (
    <form onSubmit={tab === "pilot" || tab === "history" ? (event) => event.preventDefault() : save} className="os-stack">
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
          ["pilot", "Pilot business & risk"],
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
        {tab === "pilot" && (
          <div className="os-pilot-editor">
            <div className="os-section-heading">
              <h2>Pilot business and risk envelope</h2>
              <p>Record actual owner inputs and their evidence. Save a draft first; approval is a separate owner action.</p>
            </div>
            <Notice>
              {pilotApproved ? `Approved by ${draft.pilot?.approval?.approvedBy} on ${timestamp(draft.pilot?.approval?.approvedAt)} for Constitution version ${draft.version}.` : "Gate A is blocked. A saved draft is not approval. UNKNOWN and estimated inputs cannot authorize real-money operations."}
            </Notice>
            {pilotHasUnsavedEdits && <Notice>There are unsaved pilot edits. Save them before requesting approval.</Notice>}
            {pilotGaps.length > 0 && (
              <div className="os-pilot-gaps">
                <strong>{pilotGaps.length} item{pilotGaps.length === 1 ? "" : "s"} still block approval</strong>
                <p>{pilotGaps.slice(0, 8).join(" · ")}{pilotGaps.length > 8 ? ` · and ${pilotGaps.length - 8} more` : ""}</p>
              </div>
            )}
            <p className="os-pilot-help">Every known value needs a source reference. Estimates remain planning inputs. Capital limits require owner-entered provenance; the guardrail service checks all approval conditions.</p>
            {(["profile", "economics", "capital"] as PilotSection[]).map((section) => (
              <section key={section} className="os-pilot-section" aria-labelledby={`pilot-${section}-heading`}>
                <div className="os-section-heading">
                  <h2 id={`pilot-${section}-heading`}>{section === "profile" ? "One pilot business" : section === "economics" ? "Unit economics" : "Capital and exposure limits"}</h2>
                  <p>{section === "economics" ? "Use per-order values where applicable. Calculated contribution and break-even figures need a traceable source." : section === "capital" ? "These values must come from the owner. They do not override the existing Constitution ceilings." : "Leave undecided inputs UNKNOWN until the owner can supply them."}</p>
                </div>
                <div className="os-pilot-fields">
                  {pilotFields[section].map((field) => renderPilotField(section, field))}
                </div>
              </section>
            ))}
            <section className="os-pilot-section" aria-labelledby="pilot-stop-heading">
              <div className="os-section-heading">
                <h2 id="pilot-stop-heading">Business stop rules</h2>
              <p>Count thresholds are whole events; refund and chargeback rates are fractions from 0 to 1; currency thresholds are USD amounts. Only uncertain provider operation and reconciliation failure counts currently have live signals. Other enabled rules fail closed until their signal is implemented.</p>
              </div>
              <div className="os-pilot-add-rule">
                <label className="form-label">
                  Metric
                  <select value={newStopMetric} onChange={(event) => setNewStopMetric(event.target.value)}>
                    <option value="">Select a metric</option>
                    {pilotStopMetricSchema.options.filter((metric) => !pilotDraft.stopRules.some((rule) => rule.metric === metric)).map((metric) => <option key={metric} value={metric}>{titleCase(metric)}</option>)}
                  </select>
                </label>
                <ActionButton type="button" disabled={!newStopMetric || pilotDraft.stopRules.length >= 30} onClick={() => {
                  const metric = pilotStopMetricSchema.parse(newStopMetric);
                  setPilotDraft({ ...pilotDraft, stopRules: [...pilotDraft.stopRules, { metric, unit: stopUnitForMetric(metric), threshold: Number.NaN, action: "BLOCK_NEW_ACTIONS", enabled: false }] });
                  setNewStopMetric("");
                }}>Add stop rule</ActionButton>
              </div>
              {pilotDraft.stopRules.length === 0 && <p className="os-pilot-help">No stop rules entered. Approval requires enabled rules for uncertain provider operations and reconciliation failures.</p>}
              {pilotDraft.stopRules.map((rule, index) => (
                <div className="os-pilot-rule" key={rule.metric}>
                  <strong>{titleCase(rule.metric)}</strong>
                  <label className="form-label">Threshold <span>{rule.unit === "COUNT" ? "Count" : rule.unit === "FRACTION" ? "Fraction 0–1" : "USD"}</span>
                    <input type="number" min="0" max={rule.unit === "FRACTION" ? "1" : "1000000"} step={rule.unit === "COUNT" ? "1" : "0.01"} value={Number.isFinite(rule.threshold) ? rule.threshold : ""} onChange={(event) => setPilotDraft({ ...pilotDraft, stopRules: pilotDraft.stopRules.map((item, position) => position === index ? { ...item, threshold: event.target.value === "" ? Number.NaN : Number(event.target.value) } : item) })} />
                  </label>
                  <label className="form-label">On trigger
                    <select value={rule.action} onChange={(event) => setPilotDraft({ ...pilotDraft, stopRules: pilotDraft.stopRules.map((item, position) => position === index ? { ...item, action: event.target.value as typeof item.action } : item) })}>
                      <option value="BLOCK_NEW_ACTIONS">Block new actions</option>
                      <option value="REQUIRE_OWNER_REVIEW">Require owner review</option>
                    </select>
                  </label>
                  <label className="os-checkbox"><input type="checkbox" checked={rule.enabled} onChange={(event) => setPilotDraft({ ...pilotDraft, stopRules: pilotDraft.stopRules.map((item, position) => position === index ? { ...item, enabled: event.target.checked } : item) })} />Enabled</label>
                  <ActionButton type="button" onClick={() => setPilotDraft({ ...pilotDraft, stopRules: pilotDraft.stopRules.filter((_, position) => position !== index) })}>Remove</ActionButton>
                </div>
              ))}
            </section>
            <div className="os-pilot-actions">
              <div>
                <label className="form-label">Reason for saving pilot draft
                  <input value={pilotReason} minLength={3} maxLength={1000} onChange={(event) => setPilotReason(event.target.value)} placeholder="Record the source or reason for this draft" />
                </label>
                <ActionButton type="button" busy={pilotBusy} disabled={pilotReason.trim().length < 3} onClick={() => void savePilot()}>Save pilot draft</ActionButton>
              </div>
              <div>
                <label className="form-label">Reason for owner approval
                  <input value={pilotApprovalReason} minLength={3} maxLength={1000} onChange={(event) => setPilotApprovalReason(event.target.value)} placeholder="Record the approval decision" />
                </label>
                <ActionButton type="button" className="primary" busy={pilotBusy} disabled={!storedPilot || !!resource.error || pilotHasUnsavedEdits || pilotGaps.length > 0 || pilotApproved || pilotApprovalReason.trim().length < 3} onClick={() => void approvePilot()}>Approve saved pilot envelope</ActionButton>
              </div>
            </div>
          </div>
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
      {tab !== "pilot" && tab !== "history" && <div className="panel os-save-bar">
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
      </div>}
    </form>
  );
}
