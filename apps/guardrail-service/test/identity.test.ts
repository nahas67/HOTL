import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { createIdentity, type IdentityOptions } from '../src/identity.js';
import { createEngine } from '../src/engine.js';
import { createServer } from '../src/server.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const otherWorkspace = '22222222-2222-4222-8222-222222222222';
const secret = 'identity-test-signing-secret-more-than-32-characters';
const rotatedSecret = 'identity-test-rotated-secret-more-than-32-characters';
const base: IdentityOptions = { mode: 'live', workspaceId, agentJwtKeys: { current: secret } };
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
let ownerPrivateKey: CryptoKey;
let ownerKeyResolver: JWTVerifyGetKey;
beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  ownerPrivateKey = pair.privateKey;
  ownerKeyResolver = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'owner-key', alg: 'ES256' }] });
});
afterEach(() => vi.unstubAllEnvs());

type ClaimPatch = JWTPayload | ((issuedAt: number) => JWTPayload);
async function agentToken(patch: ClaimPatch = {}, key = secret, kid = 'current') {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: 'marketing_agent', role: 'agent', scope: 'hotl:spend hotl:context',
    iss: 'hotl-agents', aud: 'hotl-guardrails', iat: now, exp: now + 300,
    jti: 'token-1', workspace_id: workspaceId, authorization_version: 1, ...(typeof patch === 'function' ? patch(now) : patch),
  }).setProtectedHeader({ alg: 'HS256', kid }).sign(new TextEncoder().encode(key));
}
function ownerOptions(extra: Partial<IdentityOptions> = {}): IdentityOptions {
  return { ...base, supabaseUrl: 'https://identity-test.supabase.co', ownerUserIds: ['owner-a'], ownerKeyResolver, ...extra };
}
async function ownerToken(patch: ClaimPatch = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: 'owner-a', iss: 'https://identity-test.supabase.co/auth/v1', aud: 'authenticated',
    iat: now, exp: now + 3600, session_id: 'owner-session',
    app_metadata: { role: 'owner', workspace_id: workspaceId, authorization_version: 1 }, ...(typeof patch === 'function' ? patch(now) : patch),
  }).setProtectedHeader({ alg: 'ES256', kid: 'owner-key' }).sign(ownerPrivateKey);
}

describe('server-owned production identity', () => {
  it('fails closed for absent, noncanonical or invalid trusted workspace configuration', () => {
    vi.stubEnv('GUARDRAIL_WORKSPACE_ID', '');
    for (const id of [undefined, '', 'client-chosen', workspaceId.toUpperCase().replace('11111111', 'AAAAAAAA')]) {
      expect(() => createIdentity({ ...base, workspaceId: id })).toThrowError('Identity configuration');
    }
  });
  it('fails startup when configured auth and database workspace bindings disagree', async () => {
    vi.stubEnv('GUARDRAIL_DATABASE_URL', 'postgresql://unreachable.invalid/test');
    vi.stubEnv('GUARDRAIL_WORKSPACE_ID', otherWorkspace);
    await expect(createServer({ ...base })).rejects.toMatchObject({ code: 'WORKSPACE_MISMATCH' });
  });
  it.each([undefined, otherWorkspace, '', ['anything']])('rejects missing or foreign signed agent workspace %j', async claim => {
    const identity = createIdentity(base);
    await expect(identity.authenticate({ ...bearer(await agentToken({ workspace_id: claim })), 'x-hotl-workspace-id': workspaceId })).rejects.toMatchObject({ code: 'WORKSPACE_REQUIRED' });
  });
  it('accepts only the server workspace and never promotes spoofed identity headers', async () => {
    const result = await createIdentity(base).authenticate({ ...bearer(await agentToken()), 'x-hotl-agent-id': 'simulation-owner', 'x-workspace-id': otherWorkspace });
    expect(result).toMatchObject({ workspaceId, actor: { type: 'agent', id: 'marketing_agent' }, authorizationVersion: 1 });
    expect([...result.scopes]).toEqual(['spend', 'context']);
  });
  it.each([
    ['expired', { exp: 1 }], ['future', { iat: Math.floor(Date.now() / 1000) + 60 }],
    ['missing expiry', { exp: undefined }], ['missing issued time', { iat: undefined }],
    ['excess lifetime', (issuedAt: number) => ({ exp: issuedAt + 901 })],
    ['wrong issuer', { iss: 'untrusted-issuer' }], ['wrong audience', { aud: 'hotl-browser' }],
    ['stale authorization', { authorization_version: 0 }], ['missing authorization', { authorization_version: undefined }],
    ['missing token ID', { jti: undefined }], ['owner role', { role: 'owner' }],
    ['unknown agent', { sub: 'other-agent' }], ['malformed scope', { scope: ['hotl:spend'] }],
  ] as [string, ClaimPatch][])('denies %s agent credentials', async (_name, patch) => {
    await expect(createIdentity(base).authenticate(bearer(await agentToken(patch)))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('rejects tampering, malformed tokens, algorithm confusion and local gateway tokens in live mode', async () => {
    const identity = createIdentity(base);
    const token = await agentToken();
    for (const value of ['not-a-token', `${token.slice(0, -16)}XXXXXXXXXXXXXXXX`, `eyJhbGciOiJub25lIn0.e30.`]) {
      await expect(identity.authenticate(bearer(value))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
    await expect(identity.authenticate({ 'x-hotl-internal-token': 'hotl-local-development-token' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('intersects token scopes with department rights and configured reductions', async () => {
    const token = await agentToken({ scope: 'hotl:* hotl:owner hotl:refund hotl:spend hotl:context' });
    const identity = createIdentity({ ...base, agentScopeLimits: { marketing_agent: ['context'] } });
    expect([...(await identity.authenticate(bearer(token))).scopes]).toEqual(['context']);
    expect(() => createIdentity({ ...base, agentScopeLimits: { marketing_agent: ['owner'] } })).toThrowError('Identity configuration');
  });
  it('revokes a token or authorization epoch and rejects credentials issued before the trusted cutoff', async () => {
    const token = await agentToken();
    for (const config of [{ revokedTokenIds: ['token-1'] }, { authorizationVersion: 2 }, { tokensValidAfter: Math.floor(Date.now() / 1000) }]) {
      await expect(createIdentity({ ...base, ...config }).authenticate(bearer(token))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
  });
  it('supports bounded key overlap and rejects removed or unknown signing keys', async () => {
    const old = await agentToken(), next = await agentToken({}, rotatedSecret, 'next');
    const overlap = createIdentity({ ...base, agentJwtKeys: { current: secret, next: rotatedSecret } });
    expect((await overlap.authenticate(bearer(old))).actor.type).toBe('agent');
    expect((await overlap.authenticate(bearer(next))).actor.type).toBe('agent');
    const rotated = createIdentity({ ...base, agentJwtKeys: { next: rotatedSecret } });
    await expect(rotated.authenticate(bearer(old))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect((await rotated.authenticate(bearer(next))).actor.type).toBe('agent');
    await expect(overlap.authenticate(bearer(await agentToken({}, secret, 'unknown')))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('validates owner signature, allowlist, session and trusted application metadata', async () => {
    const identity = createIdentity(ownerOptions());
    expect(await identity.authenticate(bearer(await ownerToken()))).toMatchObject({ actor: { type: 'owner', id: 'owner-a' }, workspaceId });
    for (const patch of [{ sub: 'owner-b' }, { app_metadata: { role: 'viewer', workspace_id: workspaceId, authorization_version: 1 } }, { app_metadata: {}, user_metadata: { role: 'owner', workspace_id: workspaceId, authorization_version: 1 } }]) {
      await expect(identity.authenticate(bearer(await ownerToken(patch)))).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    }
    for (const claim of [undefined, otherWorkspace]) {
      await expect(identity.authenticate(bearer(await ownerToken({ app_metadata: { role: 'owner', workspace_id: claim, authorization_version: 1 } })))).rejects.toMatchObject({ code: 'WORKSPACE_REQUIRED' });
    }
  });
  it.each([
    { exp: undefined }, { iat: undefined }, { exp: 1 }, (issuedAt: number) => ({ exp: issuedAt + 3601 }),
    { session_id: undefined }, { aud: 'service_role' }, { iss: 'https://different.supabase.co/auth/v1' },
    { app_metadata: { role: 'owner', workspace_id: workspaceId, authorization_version: 0 } },
  ] as ClaimPatch[])('denies stale or invalid owner session %j', async patch => {
    await expect(createIdentity(ownerOptions()).authenticate(bearer(await ownerToken(patch)))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('honors explicit owner session revocation and rejects signing algorithm role confusion', async () => {
    await expect(createIdentity(ownerOptions({ revokedSessionIds: ['owner-session'] })).authenticate(bearer(await ownerToken()))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const fakeOwner = await agentToken({ role: 'owner', sub: 'owner-a', app_metadata: { role: 'owner', workspace_id: workspaceId, authorization_version: 1 } });
    await expect(createIdentity(ownerOptions()).authenticate(bearer(fakeOwner))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('enforces HTTP owner and scope boundaries without recording credentials in audit or responses', async () => {
    const engine = await createEngine({ mode: 'live' });
    const app = await createServer({ ...ownerOptions({ agentScopeLimits: { marketing_agent: ['context'] } }), engine });
    const token = await agentToken({ scope: 'hotl:owner hotl:spend hotl:context' });
    const requests = [
      { method: 'GET' as const, url: '/api/overview' },
      { method: 'POST' as const, url: '/api/guardrails/v1/pause/engage', payload: {} },
      { method: 'POST' as const, url: '/api/guardrails/v1/spend/check', payload: { campaignId: 'bound', requestedAmount: 1 } },
    ];
    try {
      for (const request of requests) {
        const response = await app.inject({ ...request, headers: { ...bearer(token), 'idempotency-key': 'restricted' } });
        expect(response.statusCode).toBe(403);
        expect(response.body).not.toContain(token);
      }
      const cross = await app.inject({ url: `/api/products?workspaceId=${workspaceId}`, headers: bearer(await agentToken({ workspace_id: otherWorkspace })) });
      expect(cross.statusCode).toBe(403);
      const owner = await ownerToken();
      const response = await app.inject({ method: 'POST', url: '/api/guardrails/v1/pause/engage', headers: { ...bearer(owner), 'idempotency-key': 'owner-pause' }, payload: { reason: 'Identity verification' } });
      expect(response.statusCode).toBe(200);
      const audit = JSON.stringify((await engine.snapshot()).audit);
      expect(audit).toContain('owner-a');
      for (const credential of [token, owner, secret, rotatedSecret]) expect(audit + response.body).not.toContain(credential);
    } finally { await app.close(); }
  });
  it('rejects malformed rotation and privilege configuration without echoing secrets', () => {
    for (const config of [{ agentJwtKeys: { invalid: 'too-short' } }, { authorizationVersion: NaN }, { tokensValidAfter: -1 }, { supabaseUrl: 'http://identity.example' }]) {
      expect(() => createIdentity({ ...base, ...config })).toThrowError('Identity configuration is missing or invalid.');
    }
    vi.stubEnv('AGENT_JWT_KEYS', '{sensitive malformed material');
    expect(() => createIdentity({ ...base, agentJwtKeys: undefined })).toThrowError('Identity configuration is missing or invalid.');
  });
});
