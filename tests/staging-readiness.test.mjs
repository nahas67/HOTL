import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStagingReadiness } from '../scripts/staging-readiness.mjs';

const good = () => ({
  HOTL_MODE: 'live', GUARDRAIL_WORKSPACE_ID: '11111111-1111-4111-8111-111111111111',
  GUARDRAIL_DATABASE_URL: 'postgresql://scoped@db.example.com/hotl', GUARDRAIL_AUTHORIZATION_VERSION: '1',
  SUPABASE_URL: 'https://auth.example.com', OWNER_USER_IDS: 'owner-1',
  AGENT_JWT_KEYS: JSON.stringify({ key1: 'x'.repeat(32) }), HOTL_PUBLIC_ORIGIN: 'https://owner.example.com',
  SHOPIFY_REDIRECT_URI: 'https://owner.example.com/api/shopify/oauth/callback',
  SHOPIFY_WEBHOOK_ORIGIN: 'https://hooks.example.com', SHOPIFY_CLIENT_ID: 'fixture-app', SHOPIFY_CLIENT_SECRET: 'fixture-secret',
  SHOPIFY_STAGING_SHOPS: 'pilot.myshopify.com', SHOPIFY_SCOPES: 'read_products,write_products,read_inventory,read_locations',
  CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  KILL_SWITCH_URL: 'https://emergency.example.com', KILL_SWITCH_READ_TOKEN: 'fixture-independent-reader',
});

test('only a complete isolated HTTPS and scoped configuration passes static review', () => {
  assert.deepEqual(checkStagingReadiness(good()), { readyForOperatorReview: true, failures: [] });
});

test('default simulation, local callback, initialization switch and absent controls block staging', () => {
  const input = good();
  Object.assign(input, { HOTL_MODE: 'simulation', HOTL_PUBLIC_ORIGIN: 'http://localhost:3000',
    SHOPIFY_REDIRECT_URI: 'http://localhost:3000/api/shopify/oauth/callback',
    GUARDRAIL_INITIALIZE_EMPTY_DATABASE: 'true', KILL_SWITCH_READ_TOKEN: 'hotl-demo-kill-read-token' });
  const result = checkStagingReadiness(input);
  assert.equal(result.readyForOperatorReview, false);
  assert.deepEqual(new Set(result.failures.map(item => item.field)), new Set([
    'HOTL_MODE', 'GUARDRAIL_INITIALIZE_EMPTY_DATABASE', 'HOTL_PUBLIC_ORIGIN', 'SHOPIFY_REDIRECT_URI', 'KILL_SWITCH_READ_TOKEN',
  ]));
});

test('reports field names without echoing credential values', () => {
  const input = good();
  input.SHOPIFY_CLIENT_SECRET = '';
  input.AGENT_JWT_KEYS = '{invalid';
  input.CONNECTOR_ENCRYPTION_KEY = 'not-a-key';
  const output = JSON.stringify(checkStagingReadiness(input));
  assert.match(output, /SHOPIFY_CLIENT_SECRET/);
  assert.doesNotMatch(output, /not-a-key|fixture-independent-reader|postgresql:\/\//);
});

test('rejects IP-literal and local webhook origins even when they use HTTPS', () => {
  const input = good();
  input.SHOPIFY_WEBHOOK_ORIGIN = 'https://192.168.1.10';
  assert.equal(checkStagingReadiness(input).readyForOperatorReview, false);
  assert.ok(checkStagingReadiness(input).failures.some(item => item.field === 'SHOPIFY_WEBHOOK_ORIGIN'));
});
