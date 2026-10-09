export type StagingReadinessReport = {
  staticConfiguration: {
    status: string;
    evidenceScope: string;
    missing: Array<{ field: string; reason: string }>;
  };
  workerReadiness: { ingress: string; worker: string; reconciliation: string; mode: string };
  activeProbes: {
    status: string;
    notProbed: string[];
    missing?: string[];
    results: Array<{ name: string; status: string; mode?: string; worker?: string }>;
  };
  externalStagingVerified: boolean;
  readyForOperatorReview: boolean;
  failures: Array<{ field: string; reason: string }>;
};

export type StagingReadinessRow = { label: string; status: string; detail: string };

export function buildStagingReadinessRows(
  report: StagingReadinessReport,
  gateAStatus: string,
): StagingReadinessRow[] {
  const missing = new Set(report.failures.map((failure) => failure.field));
  const probe = (name: string) =>
    report.activeProbes.results.find((result) => result.name === name)?.status;
  const configurationStatus = (fields: string[], probeName?: string) => {
    if (fields.some((field) => missing.has(field))) return "BLOCKED · MISSING SETTINGS";
    return probeName && probe(probeName) === "VERIFIED"
      ? "READ-ONLY PROBE PASSED"
      : "CONFIGURED · UNVERIFIED";
  };
  const workerState = (state: string) =>
    state === "BLOCKED" ? "BLOCKED" : state === "MANUAL_ONLY" ? "OWNER-MANAGED" : "CONFIGURED · UNVERIFIED";

  return [
    {
      label: "Gate A business and risk authority",
      status: gateAStatus,
      detail: "AI research can advise. Only the owner can enter sourced values and approve the current Business Constitution version.",
    },
    {
      label: "One Shopify development store",
      status: configurationStatus(["SHOPIFY_STAGING_SHOPS"]),
      detail: "The allowlist shape does not prove that the store exists or is a Shopify development store.",
    },
    {
      label: "Dedicated Shopify app and minimum scopes",
      status: configurationStatus(["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET", "SHOPIFY_SCOPES"]),
      detail: "Static credentials and requested scopes do not prove Dev Dashboard registration, version release, or installation.",
    },
    {
      label: "Owner HTTPS callback",
      status: configurationStatus(["HOTL_PUBLIC_ORIGIN", "SHOPIFY_REDIRECT_URI"], "SHOPIFY_OAUTH_CALLBACK_ROUTE"),
      detail: "A callback probe checks the unauthenticated route only; it does not install the app.",
    },
    {
      label: "Shopify webhook ingress",
      status: configurationStatus(["SHOPIFY_WEBHOOK_ORIGIN", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET", "SHOPIFY_STAGING_SHOPS"], "SHOPIFY_INGRESS_AND_RECONCILIATION_MODE"),
      detail: "The read-only health route does not prove Shopify delivered a signed webhook.",
    },
    {
      label: "Isolated PostgreSQL workspace and runtime role",
      status: configurationStatus(["GUARDRAIL_DATABASE_URL", "GUARDRAIL_WORKSPACE_ID", "GUARDRAIL_INITIALIZE_EMPTY_DATABASE", "GUARDRAIL_INITIALIZE_EMPTY_FILE"], "GUARDRAIL_SELF_REPORTED_WORKSPACE_AND_KILL_READER"),
      detail: "This probe reads the guardrail's OWN claim about its workspace binding and role privileges; it is self-reported, not independently verified against the database. Hosted isolation, RLS and restore evidence remain separate.",
    },
    {
      label: "Owner and agent identity",
      status: configurationStatus(["SUPABASE_URL", "OWNER_USER_IDS", "GUARDRAIL_AUTHORIZATION_VERSION", "AGENT_JWT_KEYS"]),
      detail: "Configuration presence does not prove the hosted issuer, owner account, or key-rotation drill.",
    },
    {
      label: "Independent emergency reader",
      status: configurationStatus(["KILL_SWITCH_URL", "KILL_SWITCH_READ_TOKEN"], "INDEPENDENT_KILL_STATE_READER"),
      detail: "A state read does not prove separate deployment ownership, credentials, storage, or revocation authority.",
    },
    {
      label: "Worker and reconciliation mode",
      status: `${workerState(report.workerReadiness.worker)} · ${workerState(report.workerReadiness.reconciliation)}`,
      detail: `Configured mode: ${report.workerReadiness.mode}. A health response is not a queue restart, webhook-delivery, or reconciliation drill.`,
    },
    {
      label: "Staging backup and restore target",
      status: configurationStatus(["HOTL_BACKUP_RESTORE_TARGET"]),
      detail: "A named target is configuration only; no restore drill is implied.",
    },
    {
      label: "Active read-only probes",
      status: report.activeProbes.status,
      detail: report.activeProbes.status === "PARTIALLY_VERIFIED"
        ? "The four configured read-only endpoints responded as expected; limitations remain open."
        : "Not run by this cockpit read. Run the preflight from the isolated staging environment after it is provisioned.",
    },
    {
      label: "External Shopify staging proof",
      status: report.externalStagingVerified ? "VERIFIED" : "NOT VERIFIED",
      detail: "No real Shopify price mutation or full external Gate C drill is represented by this report.",
    },
  ];
}
