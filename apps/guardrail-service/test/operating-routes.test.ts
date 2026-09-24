import { describe, expect, it, afterEach, vi } from 'vitest';
import { createEngine } from '../src/engine.js';
import { createServer } from '../src/server.js';

const owner = { 'x-hotl-internal-token': 'operating-test', 'idempotency-key': 'owner-registration' };
afterEach(() => vi.unstubAllEnvs());
describe('operating API authorization', () => {
  it('allows only owners to access financial evidence and connection records', async () => {
    const app = await createServer({ engine: await createEngine({ seed: false }), internalToken: 'operating-test' });
    try {
      for (const url of ['/api/constitution','/api/operating-state','/api/integrations','/api/integration-catalog','/api/finance']) {
        expect((await app.inject({ url })).statusCode).toBe(401);
        expect((await app.inject({ url, headers: { ...owner, 'x-hotl-agent-id': 'marketing_agent' } })).statusCode).toBe(403);
        expect((await app.inject({ url, headers: owner })).statusCode).toBe(200);
      }
      expect((await app.inject({ url: '/api/finance?period=invalid', headers: owner })).statusCode).toBe(400);
    } finally { await app.close(); }
  });
  it('stores account credentials through the owner boundary and never returns them', async () => {
    vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    const engine = await createEngine({ seed: false }), app = await createServer({ engine, internalToken: 'operating-test' });
    const token = 'private-provider-test-credential';
    const payload = { provider: 'shopify', label: 'Merchant', credentials: { shop: 'merchant.myshopify.com', accessToken: token } };
    try {
      const url = '/api/guardrails/v1/integrations';
      expect((await app.inject({ method: 'POST', url, payload, headers: { ...owner, 'x-hotl-agent-id': 'sourcing_agent' } })).statusCode).toBe(403);
      const saved = await app.inject({ method: 'POST', url, payload, headers: owner });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({ decision: 'allow', connection: { status: 'DISCONNECTED', enabled: true } });
      expect(saved.body).not.toContain(token);
      expect(JSON.stringify((await engine.snapshot()).audit)).not.toContain(token);
      const listing = await app.inject({ url: '/api/integrations', headers: owner });
      expect(listing.body).not.toContain('encryptedCredentials');
      expect((await app.inject({ method: 'POST', url, payload: { ...payload, allowedHosts: ['127.0.0.1'] }, headers: { ...owner, 'idempotency-key': 'injected' } })).statusCode).toBe(400);
    } finally { await app.close(); }
  });
});
