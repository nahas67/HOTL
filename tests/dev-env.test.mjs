import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environmentFor, isolatedTestEnvironment } from '../scripts/dev-env.mjs';

test('local services receive only the credentials their role needs', () => {
  const source = { Path: 'runtime-path', HOTL_MODE: 'simulation', HOTL_INTERNAL_TOKEN: 'gateway', CONNECTOR_ENCRYPTION_KEY: 'vault', GUARDRAIL_DATABASE_URL: 'ledger', SHOPIFY_CLIENT_SECRET: 'app-secret', SHOPIFY_STAGING_SHOPS: 'unsafe-in-local-launcher', AGENT_JWT_KEYS: 'signing-keys', STRIPE_SECRET_KEY: 'provider-write', STRIPE_WEBHOOK_SECRET: 'signature-only', LITELLM_MASTER_KEY: 'proxy-admin', LITELLM_ORCHESTRATOR_KEY: 'scoped-ceo', KILL_SWITCH_OWNER_TOKEN: 'emergency', UNRELATED_API_SECRET: 'unrelated' };
  for (const role of ['guardrails','cockpit','storefront','commerce','orchestrator','kill-switch']) {
    const env = environmentFor(role, source);
    assert.equal(env.Path, 'runtime-path');
    assert.equal(env.STRIPE_SECRET_KEY, undefined);
    assert.equal(env.LITELLM_MASTER_KEY, undefined);
    assert.equal(env.UNRELATED_API_SECRET, undefined);
    assert.equal(env.CONNECTOR_ENCRYPTION_KEY, role === 'guardrails' ? 'vault' : undefined);
    assert.equal(env.GUARDRAIL_DATABASE_URL, role === 'guardrails' ? 'ledger' : undefined);
    assert.equal(env.SHOPIFY_CLIENT_SECRET, role === 'guardrails' ? 'app-secret' : undefined);
    assert.equal(env.AGENT_JWT_KEYS, role === 'guardrails' ? 'signing-keys' : undefined);
    assert.equal(env.SHOPIFY_STAGING_SHOPS, undefined);
    assert.equal(env.STRIPE_WEBHOOK_SECRET, role === 'commerce' ? 'signature-only' : undefined);
    assert.equal(env.LITELLM_ORCHESTRATOR_KEY, role === 'orchestrator' ? 'scoped-ceo' : undefined);
    assert.equal(env.KILL_SWITCH_OWNER_TOKEN, ['cockpit','kill-switch'].includes(role) ? 'emergency' : undefined);
  }
  assert.throws(() => environmentFor('unknown-role', source));
});

test('browser drills cannot inherit external services or code-loading options', () => {
  const isolated = isolatedTestEnvironment({ Path: 'runtime', HOTL_MODE: 'live', NODE_OPTIONS: '--import=secrets.mjs', GUARDRAIL_DATABASE_URL: 'production', DATABASE_URL: 'production', REDIS_URL: 'remote', LITELLM_BASE_URL: 'paid', KILL_SWITCH_URL: 'real', NODE_ENV: 'production' });
  assert.deepEqual(isolated, { Path: 'runtime' });
});
