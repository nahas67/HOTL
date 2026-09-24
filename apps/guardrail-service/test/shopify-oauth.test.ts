import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createEngine } from '../src/engine.js';
import { ShopifyOAuthService, type ShopifyInstallation, type ShopifyOAuthOptions } from '../src/shopify-oauth.js';

const owner = { type: 'owner' as const, id: 'oauth-owner' };
const otherOwner = { type: 'owner' as const, id: 'another-owner' };
const shop = 'fixture.myshopify.com';
const clientSecret = 'fixture-client-secret-not-a-real-credential';
const tokens = { access_token: 'fixture-access-token-secret', refresh_token: 'fixture-refresh-token-secret', scope: 'write_products,read_inventory,read_locations', expires_in: 3600, refresh_token_expires_in: 7_776_000 };
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    const path = resolve(directory);
    if (!path.startsWith(`${resolve(tmpdir())}${sep}`) || !path.includes('hotl-oauth-')) throw new Error('Unsafe fixture cleanup');
    await rm(path, { recursive: true, force: true });
  }
});

function signed(fields: Record<string, string>) {
  const canonical = Object.entries(fields).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('&');
  return new URLSearchParams({ ...fields, hmac: createHmac('sha256', clientSecret).update(canonical).digest('hex') }).toString();
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-oauth-')); directories.push(directory);
  const filePath = join(directory, 'ledger.json'), now = new Date('2026-09-18T12:00:00.000Z');
  const engine = await createEngine({ filePath, seed: false, now: () => now });
  const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(tokens), { status: 200 }));
  const options: ShopifyOAuthOptions = { workspaceId: 'workspace-a', clientId: 'fixture-client-id', clientSecret, redirectUri: 'https://hotl.example.org/api/shopify/oauth/callback', encryptionKey: Buffer.alloc(32, 4).toString('base64'), fetch, now: () => now };
  const service = new ShopifyOAuthService(engine, options);
  const start = async (key = 'start') => {
    const request = await service.start({ shop }, owner, key);
    const fields = { code: 'fixture-authorization-code', shop, state: new URL(request.authorizationUrl).searchParams.get('state')!, timestamp: String(now.getTime() / 1000), host: 'Zml4dHVyZS5teXNob3BpZnkuY29tL2FkbWlu' };
    return { ...request, fields, query: signed(fields) };
  };
  const install = async () => {
    const started = await start();
    const result = await service.callback(started.query, started.cookie.value);
    return { ...started, installation: result.installation as ShopifyInstallation };
  };
  return { engine, filePath, service, options, fetch, now, start, install };
}

describe('durable Shopify OAuth and credential lifecycle', () => {
  it('installs with browser-bound state, expiring offline tokens, encrypted storage and safe metadata', async () => {
    const f = await fixture(), installed = await f.install();
    expect(installed.cookie.options).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/api/shopify/oauth/callback', maxAge: 600 });
    expect(installed.installation).toMatchObject({ status: 'INSTALLED', workspaceId: 'workspace-a', ownerId: owner.id, shop, revision: 2 });
    const [url, init] = f.fetch.mock.calls[0];
    expect(url).toBe(`https://${shop}/admin/oauth/access_token`);
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(String(init?.body)).toContain('expiring=1');
    const persisted = await readFile(f.filePath, 'utf8');
    for (const value of [tokens.access_token, tokens.refresh_token, clientSecret, installed.fields.code, installed.fields.state, installed.cookie.value]) expect(persisted).not.toContain(value);
    expect(JSON.stringify(await f.service.list(owner))).not.toMatch(/encryptedTokens|access_token|refresh_token|clientId/);
    expect(await f.service.accessToken(installed.installation.id, owner)).toMatchObject({ accessToken: tokens.access_token, shop, revision: 2 });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect((await f.engine.snapshot()).audit.some(event => event.eventType === 'integration.shopify.oauth.completed')).toBe(true);
  });

  it('replays initiation without minting new state and rejects mismatched idempotency payloads', async () => {
    const f = await fixture(), start = await f.start();
    expect(await f.service.start({ shop }, owner, 'start')).toEqual({ authorizationUrl: start.authorizationUrl, stateId: start.stateId, cookie: start.cookie });
    await expect(f.service.start({ shop: 'other.myshopify.com' }, owner, 'start')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it('rejects invalid HMAC, browser binding, duplicated parameters, stale timestamps and account substitution before exchange', async () => {
    const f = await fixture(), start = await f.start();
    const invalid = [start.query.replace(/hmac=[a-f0-9]+/, `hmac=${'0'.repeat(64)}`), `${start.query}&shop=${shop}`, signed({ ...start.fields, shop: 'other.myshopify.com' }), signed({ ...start.fields, timestamp: String(f.now.getTime() / 1000 - 301) }), signed({ ...start.fields, state: 'z'.repeat(43) })];
    for (const query of invalid) await expect(f.service.callback(query, start.cookie.value)).rejects.toMatchObject({ code: 'SHOPIFY_CALLBACK_INVALID' });
    await expect(f.service.callback(start.query, 'z'.repeat(43))).rejects.toMatchObject({ code: 'SHOPIFY_CALLBACK_INVALID' });
    expect(f.fetch).not.toHaveBeenCalled();
    expect((await f.service.list(owner)).installations[0].status).toBe('AUTHORIZING');
  });

  it('claims callbacks durably so concurrent delivery and restart cannot exchange the same code twice', async () => {
    const f = await fixture(), start = await f.start();
    let entered!: () => void, release!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    f.fetch.mockImplementationOnce(async () => { entered(); await held; return new Response(JSON.stringify(tokens)); });
    const first = f.service.callback(start.query, start.cookie.value); await enteredPromise;
    const restarted = new ShopifyOAuthService(await createEngine({ filePath: f.filePath, seed: false }), f.options);
    await expect(restarted.callback(start.query, start.cookie.value)).rejects.toMatchObject({ code: 'SHOPIFY_STATE_CONSUMED' });
    await expect(restarted.start({ shop }, owner, 'parallel-start')).rejects.toMatchObject({ code: 'SHOPIFY_EXCHANGE_PENDING' });
    release(); await first;
    await expect(restarted.callback(start.query, start.cookie.value)).rejects.toMatchObject({ code: 'SHOPIFY_STATE_CONSUMED' });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('binds installations to workspace and owner and keeps the saved installation after restart', async () => {
    const f = await fixture(), { installation } = await f.install();
    const restarted = new ShopifyOAuthService(await createEngine({ filePath: f.filePath, seed: false }), f.options);
    expect(await restarted.getInstallation(installation.id, owner)).toEqual(installation);
    await expect(restarted.accessToken(installation.id, otherOwner)).rejects.toMatchObject({ code: 'SHOPIFY_INSTALLATION_NOT_FOUND' });
    await expect(restarted.start({ shop }, otherOwner, 'foreign-owner')).rejects.toMatchObject({ code: 'SHOPIFY_ACCOUNT_OWNED' });
    expect((await restarted.list(otherOwner)).installations).toEqual([]);
    const foreign = new ShopifyOAuthService(f.engine, { ...f.options, workspaceId: 'workspace-b' });
    await expect(foreign.accessToken(installation.id, owner)).rejects.toMatchObject({ code: 'WORKSPACE_MISMATCH' });
    await expect(foreign.start({ shop }, owner, 'foreign-workspace')).rejects.toMatchObject({ code: 'WORKSPACE_MISMATCH' });
    await expect(restarted.start({ shop }, { type: 'agent', id: 'sourcing_agent' }, 'agent')).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
  });

  it('denies invalid shops and refuses a swapped key or app identity instead of resetting saved credentials', async () => {
    const f = await fixture(), { installation } = await f.install();
    for (const invalidShop of ['https://fixture.myshopify.com', 'fixture.myshopify.com.example.org', '127.0.0.1', 'fixture.myshopify.com:443']) await expect(f.service.start({ shop: invalidShop }, owner, invalidShop)).rejects.toThrow();
    const swapped = new ShopifyOAuthService(f.engine, { ...f.options, encryptionKey: Buffer.alloc(32, 5).toString('base64') });
    await expect(swapped.accessToken(installation.id, owner)).rejects.toMatchObject({ code: 'CREDENTIALS_UNREADABLE' });
    const otherApp = new ShopifyOAuthService(f.engine, { ...f.options, clientId: 'another-app' });
    await expect(otherApp.accessToken(installation.id, owner)).rejects.toMatchObject({ code: 'CREDENTIALS_UNREADABLE' });
    expect(await f.service.accessToken(installation.id, owner)).toMatchObject({ accessToken: tokens.access_token });
  });

  it('expired or superseded initiation cannot be completed or replayed', async () => {
    const f = await fixture(), old = await f.start();
    const next = await f.start('new-start');
    await expect(f.service.callback(old.query, old.cookie.value)).rejects.toMatchObject({ code: 'SHOPIFY_STATE_CONSUMED' });
    f.now.setTime(f.now.getTime() + 600_001);
    const refreshedTimestamp = signed({ ...next.fields, timestamp: String(Math.floor(f.now.getTime() / 1000)) });
    await expect(f.service.callback(refreshedTimestamp, next.cookie.value)).rejects.toMatchObject({ code: 'SHOPIFY_STATE_CONSUMED' });
    await expect(f.service.start({ shop }, owner, 'new-start')).rejects.toMatchObject({ code: 'SHOPIFY_STATE_EXPIRED' });
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['401', () => new Response('provider-secret', { status: 401 }), 'SHOPIFY_AUTH_REQUIRED'],
    ['429', () => new Response('provider-secret', { status: 429 }), 'SHOPIFY_TOKEN_UNAVAILABLE'],
    ['missing offline rotation', () => new Response(JSON.stringify({ access_token: tokens.access_token, scope: tokens.scope })), 'SHOPIFY_TOKEN_INVALID'],
    ['insufficient scopes', () => new Response(JSON.stringify({ ...tokens, scope: 'read_products' })), 'SHOPIFY_SCOPES_MISSING'],
    ['oversized response', () => new Response('x'.repeat(65_537)), 'SHOPIFY_TOKEN_INVALID'],
  ])('fails closed on %s with no token retry or secret in audit', async (_label, response, code) => {
    const f = await fixture(), started = await f.start(); f.fetch.mockImplementationOnce(async () => response());
    await expect(f.service.callback(started.query, started.cookie.value)).rejects.toMatchObject({ code });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect((await f.service.list(owner)).installations[0].status).toBe('AUTH_REQUIRED');
    await expect(f.service.callback(started.query, started.cookie.value)).rejects.toMatchObject({ code: 'SHOPIFY_STATE_CONSUMED' });
    expect(await readFile(f.filePath, 'utf8')).not.toContain('provider-secret');
  });

  it('rotates an expiring pair once and prevents simultaneous reauthorization or refresh', async () => {
    const f = await fixture(), { installation } = await f.install(); f.now.setTime(f.now.getTime() + 3_541_000);
    let entered!: () => void, release!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    f.fetch.mockImplementationOnce(async () => { entered(); await held; return new Response(JSON.stringify({ ...tokens, access_token: 'rotated-access-token', refresh_token: 'rotated-refresh-token' })); });
    const first = f.service.accessToken(installation.id, owner); await enteredPromise;
    const restarted = new ShopifyOAuthService(await createEngine({ filePath: f.filePath, seed: false }), f.options);
    await expect(restarted.accessToken(installation.id, owner)).rejects.toMatchObject({ code: 'SHOPIFY_AUTH_REQUIRED' });
    await expect(restarted.start({ shop }, owner, 'refresh-collision')).rejects.toMatchObject({ code: 'SHOPIFY_EXCHANGE_PENDING' });
    release(); expect(await first).toMatchObject({ accessToken: 'rotated-access-token', revision: 4 });
    expect(String(f.fetch.mock.calls[1][1]?.body)).toContain('grant_type=refresh_token');
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect(await restarted.accessToken(installation.id, owner)).toMatchObject({ accessToken: 'rotated-access-token' });
    expect(await readFile(f.filePath, 'utf8')).not.toContain('rotated-access-token');
  });

  it('ambiguous refresh requires a fresh authorization rather than replaying a rotated token', async () => {
    const f = await fixture(), { installation } = await f.install(); f.now.setTime(f.now.getTime() + 3_541_000);
    f.fetch.mockImplementationOnce(async () => { throw new Error('network error contains fixture-access-token-secret'); });
    await expect(f.service.accessToken(installation.id, owner)).rejects.toMatchObject({ code: 'SHOPIFY_TOKEN_UNAVAILABLE' });
    const restarted = new ShopifyOAuthService(await createEngine({ filePath: f.filePath, seed: false }), f.options);
    await expect(restarted.accessToken(installation.id, owner)).rejects.toMatchObject({ code: 'SHOPIFY_AUTH_REQUIRED' });
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect((await restarted.getInstallation(installation.id, owner)).status).toBe('AUTH_REQUIRED');
    const reauth = await restarted.start({ shop }, owner, 'reauthorize');
    expect(reauth.authorizationUrl).toContain(shop);
  });

  it('a crash after refresh claim preserves a blocked state across restart until fresh authorization', async () => {
    const f = await fixture(), { installation } = await f.install();
    await f.engine.extensionTransaction('integration.fixture.crashed-refresh', {}, owner, 'crash', state => {
      const saved = (state.extensions!.shopifyOAuth as { installations: Array<{ status: string; revision: number; refreshUntil: string }> }).installations[0];
      saved.status = 'REFRESHING'; saved.revision++; saved.refreshUntil = new Date(f.now.getTime() + 60_000).toISOString(); return {};
    });
    const restarted = new ShopifyOAuthService(await createEngine({ filePath: f.filePath, seed: false }), f.options);
    await expect(restarted.accessToken(installation.id, owner)).rejects.toMatchObject({ code: 'SHOPIFY_AUTH_REQUIRED' });
    await expect(restarted.start({ shop }, owner, 'too-early')).rejects.toMatchObject({ code: 'SHOPIFY_EXCHANGE_PENDING' });
    f.now.setTime(f.now.getTime() + 60_001);
    expect((await restarted.start({ shop }, owner, 'recover')).authorizationUrl).toContain(shop);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('expired refresh authorization fails without contacting Shopify', async () => {
    const f = await fixture(), { installation } = await f.install(); f.now.setTime(f.now.getTime() + tokens.refresh_token_expires_in * 1000 + 1);
    await expect(f.service.accessToken(installation.id, owner)).rejects.toMatchObject({ code: 'SHOPIFY_AUTH_REQUIRED' });
    expect((await f.service.getInstallation(installation.id, owner)).status).toBe('AUTH_REQUIRED');
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('authoritative 401 invalidation is revision-bound, audited and preserves merchant records', async () => {
    const f = await fixture(), { installation } = await f.install();
    await f.engine.extensionTransaction('integration.fixture.records', {}, owner, 'records', state => { state.extensions!.fixtureMerchantRecords = [{ id: 'preserved' }]; return {}; });
    await expect(f.service.invalidate(installation.id, otherOwner, 2, 'other')).rejects.toMatchObject({ code: 'SHOPIFY_INSTALLATION_NOT_FOUND' });
    await expect(f.service.invalidate(installation.id, owner, 1, 'stale')).rejects.toMatchObject({ code: 'SHOPIFY_INSTALLATION_CHANGED' });
    const result = await f.service.invalidate(installation.id, owner, 2, 'provider-401');
    expect(result).toMatchObject({ installation: { status: 'AUTH_REQUIRED', revision: 3 }, providerRevoked: false });
    expect(await f.service.invalidate(installation.id, owner, 2, 'provider-401')).toEqual(result);
    await expect(f.service.accessToken(installation.id, owner)).rejects.toMatchObject({ code: 'SHOPIFY_AUTH_REQUIRED' });
    const state = await f.engine.snapshot();
    expect(state.extensions!.fixtureMerchantRecords).toEqual([{ id: 'preserved' }]);
    expect(state.extensions!.shopifyOAuth).toMatchObject({ installations: [{ encryptedTokens: null }] });
    expect(state.audit.some(event => event.eventType === 'integration.shopify.oauth.invalidated')).toBe(true);
  });

  it('owner disconnect wins against an in-flight token exchange and can be replayed safely', async () => {
    const f = await fixture(), start = await f.start();
    let entered!: () => void, release!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    f.fetch.mockImplementationOnce(async () => { entered(); await held; return new Response(JSON.stringify(tokens)); });
    const callback = f.service.callback(start.query, start.cookie.value); await enteredPromise;
    const installation = (await f.service.list(owner)).installations[0];
    const disconnected = await f.service.disconnect(installation.id, owner, installation.revision, 'disconnect');
    release(); await expect(callback).rejects.toMatchObject({ code: 'SHOPIFY_INSTALLATION_CHANGED' });
    expect(await f.service.disconnect(installation.id, owner, installation.revision, 'disconnect')).toEqual(disconnected);
    expect(await f.service.getInstallation(installation.id, owner)).toMatchObject({ status: 'DISCONNECTED' });
    expect((await f.engine.snapshot()).extensions!.shopifyOAuth).toMatchObject({ installations: [{ encryptedTokens: null }] });
    await expect(f.service.accessToken(installation.id, owner)).rejects.toMatchObject({ code: 'SHOPIFY_AUTH_REQUIRED' });
  });
});
