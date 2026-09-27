// Static configuration preflight for an isolated Shopify development-store pilot.
// Passing this check is never evidence that TLS, identity, storage or a provider works.
import { pathToFileURL } from 'node:url';
import { isIP } from 'node:net';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const shop = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const localHost = hostname => hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || isIP(hostname.replace(/^\[|\]$/g, '')) !== 0;
const publicHttps = value => {
  try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && !localHost(parsed.hostname) ? parsed : null; }
  catch { return null; }
};
const present = value => typeof value === 'string' && value.trim().length > 0;

export function checkStagingReadiness(env) {
  const failures = [];
  const requireField = (name, valid, reason) => { if (!valid) failures.push({ field: name, reason }); };
  requireField('HOTL_MODE', env.HOTL_MODE === 'live', 'Must be live; the local simulation is not an external proof environment.');
  requireField('GUARDRAIL_WORKSPACE_ID', uuid.test(env.GUARDRAIL_WORKSPACE_ID ?? ''), 'A dedicated canonical workspace UUID is required.');
  let database;
  try { database = new URL(env.GUARDRAIL_DATABASE_URL); } catch { /* reported below */ }
  requireField('GUARDRAIL_DATABASE_URL', database && ['postgres:', 'postgresql:'].includes(database.protocol) && present(database.hostname) && present(database.username), 'A dedicated guardrail PostgreSQL login is required.');
  requireField('GUARDRAIL_INITIALIZE_EMPTY_DATABASE', env.GUARDRAIL_INITIALIZE_EMPTY_DATABASE !== 'true', 'Remove first-initialization permission after provisioning.');
  requireField('GUARDRAIL_INITIALIZE_EMPTY_FILE', env.GUARDRAIL_INITIALIZE_EMPTY_FILE !== 'true', 'File initialization cannot substitute for the staging database.');
  requireField('SUPABASE_URL', !!publicHttps(env.SUPABASE_URL), 'Owner issuer must be a trusted HTTPS origin.');
  requireField('OWNER_USER_IDS', present(env.OWNER_USER_IDS) || present(env.SUPABASE_OWNER_IDS), 'An explicit owner allowlist is required.');
  requireField('GUARDRAIL_AUTHORIZATION_VERSION', /^[1-9]\d*$/.test(env.GUARDRAIL_AUTHORIZATION_VERSION ?? ''), 'A positive authorization version is required.');
  let agentKeys;
  try { agentKeys = JSON.parse(env.AGENT_JWT_KEYS); } catch { /* reported below */ }
  requireField('AGENT_JWT_KEYS', agentKeys && typeof agentKeys === 'object' && !Array.isArray(agentKeys) && Object.keys(agentKeys).length > 0 && Object.values(agentKeys).every(value => typeof value === 'string' && value.length >= 32), 'A scoped signing-key ring is required.');
  const cockpit = publicHttps(env.HOTL_PUBLIC_ORIGIN);
  requireField('HOTL_PUBLIC_ORIGIN', cockpit && cockpit.pathname === '/', 'A trusted HTTPS owner origin is required.');
  const callback = publicHttps(env.SHOPIFY_REDIRECT_URI);
  requireField('SHOPIFY_REDIRECT_URI', callback && cockpit && callback.origin === cockpit.origin && callback.pathname === '/api/shopify/oauth/callback', 'The exact owner HTTPS callback must match the cockpit origin.');
  const webhook = publicHttps(env.SHOPIFY_WEBHOOK_ORIGIN);
  requireField('SHOPIFY_WEBHOOK_ORIGIN', webhook && webhook.pathname === '/', 'A public HTTPS guardrail webhook origin is required.');
  requireField('SHOPIFY_CLIENT_ID', present(env.SHOPIFY_CLIENT_ID), 'A development app ID is required.');
  requireField('SHOPIFY_CLIENT_SECRET', present(env.SHOPIFY_CLIENT_SECRET), 'A development app secret is required in the guardrail environment.');
  requireField('SHOPIFY_STAGING_SHOPS', (env.SHOPIFY_STAGING_SHOPS ?? '').split(',').filter(Boolean).length === 1 && shop.test((env.SHOPIFY_STAGING_SHOPS ?? '').trim()), 'Exactly one explicitly allowlisted myshopify.com development store is required.');
  const scopes = new Set((env.SHOPIFY_SCOPES ?? '').split(',').map(value => value.trim()));
  requireField('SHOPIFY_SCOPES', ['read_products', 'write_products', 'read_inventory', 'read_locations'].every(value => scopes.has(value)), 'Required pilot read and product-write scopes are missing.');
  const encryption = env.CONNECTOR_ENCRYPTION_KEY ?? '';
  const decoded = Buffer.from(encryption, 'base64');
  requireField('CONNECTOR_ENCRYPTION_KEY', decoded.length === 32 && decoded.toString('base64') === encryption, 'A 32-byte base64 connector key is required.');
  requireField('KILL_SWITCH_URL', !!publicHttps(env.KILL_SWITCH_URL), 'The independent emergency reader must have a trusted HTTPS endpoint.');
  requireField('KILL_SWITCH_READ_TOKEN', present(env.KILL_SWITCH_READ_TOKEN) && env.KILL_SWITCH_READ_TOKEN !== 'hotl-demo-kill-read-token', 'A non-demo emergency read credential is required.');
  return { readyForOperatorReview: failures.length === 0, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkStagingReadiness(process.env);
  for (const failure of result.failures) process.stdout.write(`${failure.field}: ${failure.reason}\n`);
  process.stdout.write(result.readyForOperatorReview
    ? 'Static staging configuration preflight passed. External deployment and provider evidence remain unverified.\n'
    : 'Static staging configuration preflight blocked. No provider operation was attempted.\n');
  process.exitCode = result.readyForOperatorReview ? 0 : 1;
}
