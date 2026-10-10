// Pass each process only its runtime configuration. The proxy administration key
// and provider write credentials never belong in the local application launcher.
const systemKeys = new Set(['PATH','PATHEXT','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMDATA','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','LANG','LC_ALL','TERM','COLORTERM','NO_COLOR','FORCE_COLOR','NODE_ENV']);
const common = ['HOTL_MODE','NEXT_TELEMETRY_DISABLED'];
const allowed = {
  guardrails: ['HOTL_INTERNAL_TOKEN','GUARDRAIL_STATE_PATH','GUARDRAIL_DATABASE_URL','GUARDRAIL_WORKSPACE_ID','GUARDRAIL_INITIALIZE_EMPTY_DATABASE','GUARDRAIL_INITIALIZE_EMPTY_FILE','GUARDRAIL_AUTHORIZATION_VERSION','GUARDRAIL_TOKENS_VALID_AFTER','GUARDRAIL_REVOKED_TOKEN_IDS','GUARDRAIL_REVOKED_SESSION_IDS','KILL_SWITCH_URL','KILL_SWITCH_READ_TOKEN','KILL_SWITCH_STATE_URL','SUPABASE_URL','OWNER_USER_IDS','OWNER_USER_ID','SUPABASE_OWNER_IDS','AGENT_JWT_SECRET','AGENT_JWT_KEYS','AGENT_JWT_ISSUER','AGENT_SCOPE_LIMITS','CONNECTOR_ENCRYPTION_KEY','CONNECTOR_KEY_PATH','CONNECTOR_ALLOWED_WOOCOMMERCE_HOSTS','SHOPIFY_CLIENT_ID','SHOPIFY_CLIENT_SECRET','SHOPIFY_PREVIOUS_CLIENT_SECRET','SHOPIFY_PREVIOUS_CLIENT_SECRET_REVOKED_AT','SHOPIFY_PREVIOUS_CLIENT_SECRET_VALID_UNTIL','SHOPIFY_REDIRECT_URI','SHOPIFY_WEBHOOK_ORIGIN','SHOPIFY_SCOPES','SHOPIFY_RECONCILIATION_MODE','SHOPIFY_WORKER_ENABLED'],
  cockpit: ['HOTL_INTERNAL_TOKEN','GUARDRAIL_SERVICE_URL','ORCHESTRATOR_URL','KILL_SWITCH_URL','KILL_SWITCH_READ_TOKEN','KILL_SWITCH_OWNER_TOKEN','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','HOTL_PUBLIC_ORIGIN'],
  storefront: ['COMMERCE_URL','STOREFRONT_PUBLIC_ORIGIN'],
  commerce: ['HOTL_INTERNAL_TOKEN','GUARDRAIL_URL','GUARDRAIL_SERVICE_URL','REDIS_URL','STRIPE_WEBHOOK_SECRET'],
  orchestrator: ['HOTL_INTERNAL_TOKEN','GUARDRAIL_URL','GUARDRAIL_SERVICE_URL','KILL_SWITCH_URL','KILL_SWITCH_READ_TOKEN','DATABASE_URL','REDIS_URL','ENABLE_QUEUE_WORKERS','ENABLE_SCHEDULED_RUNS','ORCHESTRATOR_STATE_PATH','LITELLM_BASE_URL','LITELLM_MODEL_ALIAS','LITELLM_ORCHESTRATOR_KEY','LITELLM_SOURCING_KEY','LITELLM_MARKETING_KEY','LITELLM_ORDER_KEY','LITELLM_SUPPORT_KEY','AGENT_JWT_MASTER_ORCHESTRATOR','AGENT_JWT_SOURCING_AGENT','AGENT_JWT_MARKETING_AGENT','AGENT_JWT_ORDER_AGENT','AGENT_JWT_SUPPORT_AGENT'],
  'kill-switch': ['KILL_SWITCH_JOURNAL','KILL_SWITCH_PORT','KILL_SWITCH_READ_TOKEN','KILL_SWITCH_OWNER_TOKEN','KILL_SWITCH_DEMO_PASSWORD'],
};
export function environmentFor(service, source) {
  if (!allowed[service]) throw new Error('Unknown local service');
  const names = new Set([...common, ...allowed[service]]);
  return Object.fromEntries(Object.entries(source).filter(([name,value]) => value !== undefined && (systemKeys.has(name.toUpperCase()) || names.has(name))));
}

// An isolated browser drill must not inherit database, provider, proxy or
// remote-service settings from the developer's environment.
export function isolatedTestEnvironment(source) {
  return Object.fromEntries(Object.entries(source).filter(([name, value]) =>
    value !== undefined && systemKeys.has(name.toUpperCase()) && name.toUpperCase() !== 'NODE_ENV'));
}

// ---------------------------------------------------------------------------
// Build and test isolation (N9).
//
// On 2026-10-08 a live fine-grained GitHub PAT (`GITHUB_MCP_TOKEN`) was written to disk in
// plaintext by the Next.js build: `apps/cockpit/.next/cache/turbopack/v16.3.4-299180d3/00000270.sst`.
// Reproduced 2026-10-10 with a synthetic canary through the unmodified build: 2 occurrences in
// apps/cockpit and 2 in apps/storefront, same `.sst` cache, 4.9 GB of cache scanned.
//
// `turbo.json` cannot fix this and was not used. Turbo 2.10.12 in strict env mode (no `env`
// declared) still passes through EVERY `GITHUB_*` variable, alongside `NEXT_*`, `NODE_OPTIONS`,
// `CI`, `TURBO_*` and `VERCEL_*`, while filtering `MCP_TOKEN`, the model API keys and
// `SUPABASE_SERVICE_ROLE_KEY`. The credential was `GITHUB_`-prefixed, so it survived that filter,
// reached `next build`, and Turbopack serialized it. Declaring it in `turbo.json` would add a
// declared variable to a pipeline that passes the whole prefix regardless.
//
// Therefore the scrub happens BEFORE Turbo is spawned: this function builds the environment that
// `scripts/build-env.mjs` hands to every build and test process. Turbo's passthrough cannot re-add
// a variable that is absent from its own parent environment.
//
// This is a fail-closed allowlist, not a denylist. A variable that nobody thought to forbid is
// dropped by default; adding a build input is a deliberate edit here, which is the property that
// stops the next unknown agent credential from being serialized into a build cache.
// ---------------------------------------------------------------------------

// Namespaces whose members are credentials or provider/agent control planes. Blocked as prefixes
// so a newly added variable in one of these namespaces cannot silently re-enter a build.
const buildForbiddenPrefixes = [
  'GITHUB_',        // agent-tooling PATs; see the GITHUB_TOKEN note below
  'MCP_',           // agent-tooling credentials
  'ANTHROPIC_',
  'OPENAI_',
  'DEEPSEEK_',
  'AZURE_',
  'GOOGLE_',
  'GCP_',
  'AWS_',
  'VERCEL_',
  'NETLIFY_',
  'CLOUDFLARE_',
  'SUPABASE_SERVICE_', // the service-role key is a full-access database credential
  'LITELLM_',       // proxy master and per-agent virtual keys (AGENTS.md rule 4)
  'STRIPE_',
  'SHOPIFY_',       // provider app credentials (AGENTS.md rule 5)
  'SLACK_',
  'TWILIO_',
  'SENDGRID_',
  'AGENT_JWT_',
  'NODE_AUTH_',
  'NPM_TOKEN',
];

// Individual names that are credentials or secret-bearing paths even though their prefix is
// otherwise allowed through for configuration.
const buildForbiddenNames = new Set([
  'HOTL_INTERNAL_TOKEN',
  'GUARDRAIL_DATABASE_URL',
  'KILL_SWITCH_OWNER_TOKEN', // the durable one-way emergency authority
  'KILL_SWITCH_READ_TOKEN',
  'KILL_SWITCH_DEMO_PASSWORD',
  'CONNECTOR_ENCRYPTION_KEY',
  // TURBO_* is allowed so Turbo's own configuration survives, but the remote-cache credential
  // inside that namespace does not: it authenticates against a remote cache and would be written
  // into the local `.turbo` cache alongside everything else.
  'TURBO_TOKEN',
  'TURBO_API',
  'TURBO_SSH_KEY',
]);

// Variables with no prefix that builds and tests legitimately need.
const buildAllowedNames = new Set([
  'CI',              // Turbo and Playwright both branch on it
  'NODE_OPTIONS',    // --max-old-space-size and friends for large builds
  'INIT_CWD',        // set by pnpm; package scripts read it
  'NEXT_TELEMETRY_DISABLED',
  'COREPACK_ENABLE_STRICT',
  'COREPACK_ENABLE_DOWNLOAD_PROMPT',
  'PLAYWRIGHT_CHROMIUM_EXECUTABLE',
]);

// Namespaces that are configuration, not credentials. Everything a build needs from the three
// HOTL configuration namespaces survives, minus the individual secrets named above.
const buildAllowedPrefixes = ['TURBO_', 'NEXT_PUBLIC_', 'HOTL_', 'GUARDRAIL_', 'KILL_SWITCH_'];

// pnpm injects a large set of `npm_config_*` variables into every `pnpm run`. They are plumbing
// the build depends on, so the namespace is allowed -- but a registry credential stored in
// `.npmrc` is serialized into the child environment as `npm_config_//<registry>/:_authToken`,
// which must not survive.
const npmConfigSecret = /auth|token|secret|password|credential/i;

function allowedForBuild(name) {
  const upper = name.toUpperCase();
  if (buildForbiddenPrefixes.some((prefix) => upper.startsWith(prefix))) return false;
  if (buildForbiddenNames.has(upper)) return false;
  if (upper.startsWith('NPM_CONFIG_')) return !npmConfigSecret.test(upper);
  if (upper.startsWith('COREPACK_')) return true;
  if (systemKeys.has(upper)) return true;
  if (buildAllowedNames.has(upper)) return true;
  return buildAllowedPrefixes.some((prefix) => upper.startsWith(prefix));
}

// Return the only environment a build or test process is allowed to start from.
//
// On `GITHUB_TOKEN`: it is blocked here along with the rest of the `GITHUB_` prefix, and that
// does not break CI. `actions/checkout` reads `${{ github.token }}` from the Actions expression
// context -- its `token` input defaults to exactly that (actions/checkout action.yml) -- and it is
// the first step in the job, before any process this module covers. GitHub Actions does not expose
// a `GITHUB_TOKEN` environment variable to `run:` steps unless a step explicitly maps the context
// into `env:`, which `.github/workflows/ci.yml` never does. Letting it through would reintroduce
// N9 with a different token: `next build` writes whatever it is given into `.next/cache` in
// plaintext.
export function buildEnvironmentFor(source) {
  return Object.fromEntries(Object.entries(source).filter(([name, value]) =>
    value !== undefined && allowedForBuild(name)));
}
