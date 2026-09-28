import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Actor } from '@hotl/schemas';
import { GuardrailError, type GuardrailEngine } from './engine.js';
import type { EngineState } from './types.js';

const shopSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\.myshopify\.com$|^[a-z0-9]\.myshopify\.com$/);
const scopeSchema = z.string().regex(/^(read|write)_[a-z_]+$/);
const installationSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().min(1), ownerId: z.string().min(1), shop: shopSchema,
  clientId: z.string().min(1), revision: z.number().int().positive(), scopes: z.array(scopeSchema),
  status: z.enum(['AUTHORIZING', 'INSTALLED', 'REFRESHING', 'AUTH_REQUIRED', 'DISCONNECTED']),
  createdAt: z.string().datetime(), installedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(), refreshExpiresAt: z.string().datetime().nullable(),
  encryptedTokens: z.string().nullable(),
  refreshUntil: z.string().datetime().nullable().optional(),
}).strict().superRefine((item, context) => {
  if (item.status === 'INSTALLED' && (!item.installedAt || !item.expiresAt || !item.refreshExpiresAt || !item.encryptedTokens))
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'An installed Shopify reference requires encrypted credentials and token dates.' });
  if (item.encryptedTokens) {
    const parts = item.encryptedTokens.split('.');
    const decoded = parts.map(part => Buffer.from(part, 'base64'));
    if (parts.length !== 3 || parts.some((part, index) => !part || decoded[index].toString('base64') !== part)
      || decoded[0]?.length !== 12 || decoded[1]?.length !== 16 || decoded[2]?.length === 0)
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['encryptedTokens'], message: 'Encrypted credential envelope is malformed.' });
  }
});
const pendingSchema = z.object({
  id: z.string().uuid(), installationId: z.string().uuid(), installationRevision: z.number().int().positive(),
  stateHash: z.string().regex(/^[a-f0-9]{64}$/), browserHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string().datetime(), status: z.enum(['pending', 'exchanging', 'completed', 'failed', 'superseded']),
}).strict();
const storedSchema = z.object({ version: z.literal(1), workspaceId: z.string().min(1), installations: z.array(installationSchema), pending: z.array(pendingSchema) }).strict();
type StoredInstallation = z.infer<typeof installationSchema>;
export type ShopifyOAuthState = z.infer<typeof storedSchema>;
export function validateShopifyOAuthState(value: unknown): boolean {
  const parsed = storedSchema.safeParse(value);
  if (!parsed.success) return false;
  const { installations, pending } = parsed.data;
  return installations.every(item => item.workspaceId === parsed.data.workspaceId)
    && new Set(installations.map(item => item.id)).size === installations.length
    && new Set(installations.map(item => item.shop)).size === installations.length
    && new Set(pending.map(item => item.id)).size === pending.length
    && pending.every(item => installations.some(installation => installation.id === item.installationId && installation.revision >= item.installationRevision));
}
export type ShopifyInstallation = Omit<StoredInstallation, 'encryptedTokens' | 'clientId'>;
const tokenSchema = z.object({
  access_token: z.string().min(10).max(4096), refresh_token: z.string().min(10).max(4096),
  scope: z.string().min(1).max(4096), expires_in: z.number().int().positive().max(31_536_000),
  refresh_token_expires_in: z.number().int().positive().max(31_536_000),
});
type TokenBundle = z.infer<typeof tokenSchema>;
export type ShopifyOAuthOptions = {
  workspaceId: string; clientId: string; clientSecret: string; redirectUri: string; encryptionKey: string;
  scopes?: string[]; fetch?: typeof globalThis.fetch; now?: () => Date;
};
const DEFAULT_SCOPES = ['read_products', 'write_products', 'read_inventory', 'read_locations'];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function fail(code: string, message: string, status = 409): never { throw new GuardrailError(code, message, status); }
function owner(actor: Actor) { if (actor.type !== 'owner') fail('OWNER_REQUIRED', 'Shopify installation management requires an owner.', 403); }
function data(state: EngineState, workspaceId?: string): ShopifyOAuthState {
  state.extensions ??= {};
  if (state.extensions.shopifyOAuth === undefined) {
    if (!workspaceId) fail('SHOPIFY_INSTALLATION_NOT_FOUND', 'Shopify installation was not found.', 404);
    const initial: ShopifyOAuthState = { version: 1, workspaceId, installations: [], pending: [] };
    state.extensions.shopifyOAuth = initial;
    return initial;
  }
  const parsed = storedSchema.safeParse(state.extensions.shopifyOAuth);
  if (!parsed.success || !validateShopifyOAuthState(state.extensions.shopifyOAuth)) fail('SHOPIFY_STATE_INVALID', 'Shopify installation storage is invalid; restore it before continuing.', 503);
  if (workspaceId && parsed.data.workspaceId !== workspaceId) fail('WORKSPACE_MISMATCH', 'Shopify storage belongs to a different workspace.', 403);
  // Validate without replacing the object: callers mutate this transaction's state.
  return state.extensions.shopifyOAuth as ShopifyOAuthState;
}
function metadata(item: StoredInstallation): ShopifyInstallation {
  const { encryptedTokens: _tokens, clientId: _clientId, ...safe } = item;
  return structuredClone(safe);
}
/** Route binding only; webhook content still requires HMAC and authoritative rereads. */
export function lookupShopifyInstallation(state: EngineState, id: string): ShopifyInstallation | null {
  if (state.extensions?.shopifyOAuth === undefined) return null;
  const stored = data(state);
  const item = stored.installations.find(value => value.id === id && value.workspaceId === stored.workspaceId);
  return item ? metadata(item) : null;
}
function owned(state: EngineState, id: string, actor: Actor): StoredInstallation {
  owner(actor);
  const stored = data(state);
  const item = stored.installations.find(value => value.id === id && value.ownerId === actor.id && value.workspaceId === stored.workspaceId);
  if (!item) fail('SHOPIFY_INSTALLATION_NOT_FOUND', 'Shopify installation was not found.', 404);
  return item;
}
/** Safe metadata lookup for a guardrail transaction; never call a nested snapshot here. */
export function assertShopifyInstallation(state: EngineState, id: string, actor: Actor, expectedRevision?: number): ShopifyInstallation {
  const item = owned(state, id, actor);
  if (expectedRevision !== undefined && item.revision !== expectedRevision) fail('SHOPIFY_INSTALLATION_CHANGED', 'Shopify credentials or installation changed. Replan before retrying.');
  if (item.status !== 'INSTALLED' || !item.encryptedTokens) fail('SHOPIFY_AUTH_REQUIRED', 'Shopify installation requires authorization.', 403);
  return metadata(item);
}

/** This class must exist only in the credential-owning guardrail process. */
export class ShopifyOAuthService {
  private readonly key: Buffer;
  private readonly scopes: string[];
  private readonly redirect: URL;
  constructor(private readonly engine: GuardrailEngine, private readonly options: ShopifyOAuthOptions) {
    this.key = Buffer.from(options.encryptionKey, 'base64');
    if (this.key.length !== 32 || this.key.toString('base64') !== options.encryptionKey) fail('VAULT_KEY_INVALID', 'Configure a 32-byte base64 connector vault key.', 503);
    if (!options.workspaceId || !options.clientId || options.clientSecret.length < 16) fail('SHOPIFY_CONFIG_INVALID', 'Shopify workspace and app credentials must be configured.', 503);
    this.redirect = new URL(options.redirectUri);
    if (this.redirect.protocol !== 'https:' || this.redirect.username || this.redirect.password || this.redirect.search || this.redirect.hash) fail('SHOPIFY_CONFIG_INVALID', 'Configure one exact HTTPS Shopify callback URL without query parameters.', 503);
    this.scopes = [...new Set(z.array(scopeSchema).min(1).max(20).parse(options.scopes ?? DEFAULT_SCOPES))].sort();
  }
  private now() { return this.options.now?.() ?? new Date(); }
  private nonce(id: string, kind: string) { return createHmac('sha256', this.key).update(`${this.options.workspaceId}:${this.options.clientId}:${kind}:${id}`).digest('base64url'); }
  private aad(item: StoredInstallation) { return Buffer.from(`${item.workspaceId}:${item.ownerId}:${item.id}:${item.shop}:${item.clientId}`); }
  private encrypt(tokens: TokenBundle, item: StoredInstallation) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(this.aad(item));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map(value => value.toString('base64')).join('.');
  }
  private decrypt(item: StoredInstallation): TokenBundle {
    try {
      if (item.clientId !== this.options.clientId) fail('SHOPIFY_APP_CHANGED', 'The installation belongs to another app; reauthorize.', 403);
      const pieces = item.encryptedTokens?.split('.') ?? [];
      if (pieces.length !== 3) throw new Error('Invalid token envelope');
      const [iv, tag, ciphertext] = pieces.map(value => Buffer.from(value, 'base64'));
      if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !ciphertext) throw new Error('Invalid token envelope');
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(this.aad(item)); decipher.setAuthTag(tag);
      return tokenSchema.parse(JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')));
    } catch { fail('CREDENTIALS_UNREADABLE', 'Shopify credentials could not be authenticated. Restore the vault key or reauthorize.', 503); }
  }
  private applyTokens(item: StoredInstallation, tokens: TokenBundle) {
    const scopes = tokens.scope.split(',').map(scope => scope.trim()).filter(Boolean);
    if (!scopes.every(scope => scopeSchema.safeParse(scope).success) || this.scopes.some(scope => !scopes.includes(scope) && !(scope.startsWith('read_') && scopes.includes(`write_${scope.slice(5)}`)))) fail('SHOPIFY_SCOPES_MISSING', 'Shopify did not grant all required scopes.', 403);
    item.scopes = [...new Set(scopes)].sort();
    item.encryptedTokens = this.encrypt(tokens, item);
    item.expiresAt = new Date(this.now().getTime() + tokens.expires_in * 1000).toISOString();
    item.refreshExpiresAt = new Date(this.now().getTime() + tokens.refresh_token_expires_in * 1000).toISOString();
    item.status = 'INSTALLED'; item.refreshUntil = null; item.revision++;
  }
  private async exchange(shop: string, fields: Record<string, string>): Promise<TokenBundle> {
    let response: Response;
    try {
      response = await (this.options.fetch ?? globalThis.fetch)(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ client_id: this.options.clientId, client_secret: this.options.clientSecret, ...fields }),
      });
    } catch { fail('SHOPIFY_TOKEN_UNAVAILABLE', 'Shopify token service could not be reached. Credentials were not exposed.', 503); }
    if (response.status === 401) fail('SHOPIFY_AUTH_REQUIRED', 'Shopify authorization has expired or been revoked.', 403);
    if (!response.ok) fail(response.status >= 500 || response.status === 429 ? 'SHOPIFY_TOKEN_UNAVAILABLE' : 'SHOPIFY_TOKEN_REJECTED', 'Shopify token request was not accepted.', 503);
    // Bound the decoded response, including when Content-Length is missing or compressed.
    const reader = response.body?.getReader();
    if (!reader) fail('SHOPIFY_TOKEN_INVALID', 'Shopify returned an invalid token response.', 502);
    let length = 0; const chunks: Uint8Array[] = [];
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 65_536) { await reader.cancel(); fail('SHOPIFY_TOKEN_INVALID', 'Shopify token response exceeded its limit.', 502); } chunks.push(value); }
      const parsed = tokenSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (!parsed.success) fail('SHOPIFY_TOKEN_INVALID', 'Shopify did not return an expiring offline token pair.', 502);
      return parsed.data;
    } catch (error) { if (error instanceof GuardrailError) throw error; fail('SHOPIFY_TOKEN_INVALID', 'Shopify returned an invalid token response.', 502); }
    finally { reader.releaseLock(); }
  }
  async start(raw: unknown, actor: Actor, idempotencyKey: string) {
    owner(actor);
    const { shop } = z.object({ shop: shopSchema }).strict().parse(raw);
    const result = await this.engine.extensionTransaction('integration.shopify.oauth.started', { shop, workspaceId: this.options.workspaceId, clientId: this.options.clientId, scopes: this.scopes }, actor, idempotencyKey, state => {
      const stored = data(state, this.options.workspaceId);
      let item = stored.installations.find(value => value.shop === shop);
      if (item && item.ownerId !== actor.id) fail('SHOPIFY_ACCOUNT_OWNED', 'The store is already bound to another owner.', 403);
      if (item?.status === 'REFRESHING' && item.refreshUntil && Date.parse(item.refreshUntil) > this.now().getTime()) fail('SHOPIFY_EXCHANGE_PENDING', 'A token refresh is pending. Retry authorization after its expiry.');
      if (item && stored.pending.some(value => value.installationId === item!.id && value.status === 'exchanging' && Date.parse(value.expiresAt) > this.now().getTime())) fail('SHOPIFY_EXCHANGE_PENDING', 'An authorization exchange is already pending. Retry after its expiry.');
      if (!item) {
        item = { id: randomUUID(), workspaceId: this.options.workspaceId, ownerId: actor.id, shop, clientId: this.options.clientId, revision: 1, scopes: [], status: 'AUTHORIZING', createdAt: this.now().toISOString(), installedAt: null, expiresAt: null, refreshExpiresAt: null, encryptedTokens: null };
        stored.installations.push(item);
      } else { item.revision++; item.status = 'AUTHORIZING'; item.clientId = this.options.clientId; }
      for (const pending of stored.pending) if (pending.installationId === item.id && ['pending', 'exchanging'].includes(pending.status)) pending.status = 'superseded';
      const id = randomUUID();
      stored.pending.push({ id, installationId: item.id, installationRevision: item.revision, stateHash: hash(this.nonce(id, 'state')), browserHash: hash(this.nonce(id, 'browser')), expiresAt: new Date(this.now().getTime() + 600_000).toISOString(), status: 'pending' });
      return { decision: 'allow', stateId: id };
    });
    const stateId = String(result.stateId), nonce = this.nonce(stateId, 'state');
    const current = data(await this.engine.snapshot(), this.options.workspaceId).pending.find(item => item.id === stateId);
    if (!current || current.status !== 'pending' || Date.parse(current.expiresAt) <= this.now().getTime()) fail('SHOPIFY_STATE_EXPIRED', 'Start a new Shopify installation request.');
    const authorization = new URL(`https://${shop}/admin/oauth/authorize`);
    authorization.search = new URLSearchParams({ client_id: this.options.clientId, scope: this.scopes.join(','), redirect_uri: this.redirect.href, state: nonce }).toString();
    return { authorizationUrl: authorization.href, stateId, cookie: { name: 'hotl_shopify_oauth', value: this.nonce(stateId, 'browser'), options: { httpOnly: true, secure: true, sameSite: 'lax' as const, path: this.redirect.pathname, maxAge: 600 } } };
  }
  async callback(rawQuery: string, browserNonce: string) {
    if (rawQuery.length > 16_384 || !/^[A-Za-z0-9_-]{43}$/.test(browserNonce)) fail('SHOPIFY_CALLBACK_INVALID', 'Shopify callback verification failed.', 403);
    const params = new URLSearchParams(rawQuery.replace(/^\?/, '')), entries = [...params.entries()];
    if (new Set(entries.map(([key]) => key)).size !== entries.length) fail('SHOPIFY_CALLBACK_INVALID', 'Duplicate OAuth parameters are not accepted.', 403);
    const hmac = params.get('hmac') ?? '', code = params.get('code') ?? '', nonce = params.get('state') ?? '', shop = params.get('shop') ?? '', timestamp = params.get('timestamp') ?? '';
    if (!/^[a-f0-9]{64}$/.test(hmac) || !code || code.length > 4096 || !/^[A-Za-z0-9_-]{43}$/.test(nonce) || !shopSchema.safeParse(shop).success || !/^\d{10}$/.test(timestamp) || Math.abs(Number(timestamp) * 1000 - this.now().getTime()) > 300_000) fail('SHOPIFY_CALLBACK_INVALID', 'Shopify callback verification failed.', 403);
    const canonical = entries.filter(([key]) => key !== 'hmac').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('&');
    const expected = createHmac('sha256', this.options.clientSecret).update(canonical).digest();
    if (!timingSafeEqual(expected, Buffer.from(hmac, 'hex'))) fail('SHOPIFY_CALLBACK_INVALID', 'Shopify callback verification failed.', 403);
    const snapshot = await this.engine.snapshot(), saved = data(snapshot, this.options.workspaceId).pending.find(value => value.stateHash === hash(nonce));
    if (!saved || saved.browserHash !== hash(browserNonce)) fail('SHOPIFY_CALLBACK_INVALID', 'Shopify callback state or browser binding is invalid.', 403);
    const installation = data(snapshot).installations.find(value => value.id === saved.installationId);
    if (!installation || installation.shop !== shop || installation.clientId !== this.options.clientId) fail('SHOPIFY_CALLBACK_INVALID', 'Shopify callback account binding is invalid.', 403);
    const actor: Actor = { type: 'owner', id: installation.ownerId };
    await this.engine.extensionTransaction('integration.shopify.oauth.claimed', { stateId: saved.id, installationId: installation.id }, actor, `shopify-claim:${randomUUID()}`, state => {
      const pending = data(state, this.options.workspaceId).pending.find(value => value.id === saved.id)!;
      const current = owned(state, installation.id, actor);
      if (pending.status !== 'pending' || Date.parse(pending.expiresAt) <= this.now().getTime() || current.revision !== pending.installationRevision || current.status !== 'AUTHORIZING') fail('SHOPIFY_STATE_CONSUMED', 'This Shopify callback has expired or was already consumed.', 403);
      pending.status = 'exchanging';
      return { decision: 'allow', installationId: current.id };
    });
    try {
      const tokens = await this.exchange(shop, { code, expiring: '1' });
      return await this.engine.extensionTransaction('integration.shopify.oauth.completed', { stateId: saved.id, installationId: installation.id }, actor, `shopify-complete:${saved.id}`, state => {
        const pending = data(state, this.options.workspaceId).pending.find(value => value.id === saved.id)!;
        const current = owned(state, installation.id, actor);
        if (pending.status !== 'exchanging' || current.revision !== pending.installationRevision || current.status !== 'AUTHORIZING') fail('SHOPIFY_INSTALLATION_CHANGED', 'Installation changed during token exchange. Reauthorize.');
        this.applyTokens(current, tokens); current.installedAt = this.now().toISOString(); pending.status = 'completed';
        return { decision: 'allow', installation: metadata(current) };
      });
    } catch (error) {
      await this.engine.extensionTransaction('integration.shopify.oauth.failed', { stateId: saved.id, installationId: installation.id }, actor, `shopify-failed:${saved.id}`, state => {
        const pending = data(state, this.options.workspaceId).pending.find(value => value.id === saved.id)!;
        const current = owned(state, installation.id, actor);
        if (pending.status === 'exchanging') pending.status = 'failed';
        if (current.revision === pending.installationRevision) { current.status = 'AUTH_REQUIRED'; current.revision++; }
        return { decision: 'deny', reason: 'SHOPIFY_REAUTHORIZATION_REQUIRED' };
      });
      throw error;
    }
  }
  async list(actor: Actor) { owner(actor); return { installations: data(await this.engine.snapshot(), this.options.workspaceId).installations.filter(item => item.ownerId === actor.id).map(metadata) }; }
  async getInstallation(id: string, actor: Actor) { const state = await this.engine.snapshot(); data(state, this.options.workspaceId); return metadata(owned(state, id, actor)); }
  /** No HTTP route may return this value. Never call from an engine transaction. */
  async accessToken(id: string, actor: Actor) {
    let state = await this.engine.snapshot(); data(state, this.options.workspaceId);
    let item = owned(state, id, actor); assertShopifyInstallation(state, id, actor);
    if (!item.expiresAt || Date.parse(item.expiresAt) <= this.now().getTime() + 60_000) {
      const oldTokens = this.decrypt(item), initialRevision = item.revision, claimId = randomUUID();
      const claim = await this.engine.extensionTransaction('integration.shopify.oauth.refresh-claimed', { installationId: id, expectedRevision: initialRevision }, actor, `shopify-refresh-claim:${claimId}`, currentState => {
        data(currentState, this.options.workspaceId);
        const current = owned(currentState, id, actor); assertShopifyInstallation(currentState, id, actor, initialRevision);
        if (!current.refreshExpiresAt || Date.parse(current.refreshExpiresAt) <= this.now().getTime()) { current.status = 'AUTH_REQUIRED'; current.revision++; return { decision: 'deny', reason: 'SHOPIFY_AUTH_REQUIRED' }; }
        current.status = 'REFRESHING'; current.refreshUntil = new Date(this.now().getTime() + 60_000).toISOString(); current.revision++;
        return { decision: 'allow', revision: current.revision };
      });
      if (claim.decision !== 'allow') fail('SHOPIFY_AUTH_REQUIRED', 'Shopify authorization must be renewed.', 403);
      try {
        const tokens = await this.exchange(item.shop, { grant_type: 'refresh_token', refresh_token: oldTokens.refresh_token });
        await this.engine.extensionTransaction('integration.shopify.oauth.refreshed', { installationId: id, claimId }, actor, `shopify-refresh-complete:${claimId}`, currentState => {
          data(currentState, this.options.workspaceId); const current = owned(currentState, id, actor);
          if (current.status !== 'REFRESHING' || current.revision !== claim.revision) fail('SHOPIFY_INSTALLATION_CHANGED', 'Shopify installation changed during refresh. Reauthorize.');
          this.applyTokens(current, tokens);
          return { decision: 'allow', installation: metadata(current) };
        });
      } catch (error) {
        await this.engine.extensionTransaction('integration.shopify.oauth.refresh-failed', { installationId: id, claimId }, actor, `shopify-refresh-failed:${claimId}`, currentState => {
          data(currentState, this.options.workspaceId); const current = owned(currentState, id, actor);
          if (current.status === 'REFRESHING' && current.revision === claim.revision) { current.status = 'AUTH_REQUIRED'; current.refreshUntil = null; current.revision++; }
          return { decision: 'deny', reason: 'SHOPIFY_REAUTHORIZATION_REQUIRED' };
        });
        throw error;
      }
      state = await this.engine.snapshot(); item = owned(state, id, actor); assertShopifyInstallation(state, id, actor);
    }
    return { shop: item.shop, accessToken: this.decrypt(item).access_token, revision: item.revision, scopes: [...item.scopes] };
  }
  /** Internal only: call after an authenticated provider request returns 401, never from webhook headers alone. */
  async invalidate(id: string, actor: Actor, expectedRevision: number, idempotencyKey: string) {
    owner(actor);
    return this.engine.extensionTransaction('integration.shopify.oauth.invalidated', { installationId: id, expectedRevision, evidence: 'provider_401' }, actor, idempotencyKey, state => {
      data(state, this.options.workspaceId); const current = owned(state, id, actor);
      if (current.revision !== expectedRevision) fail('SHOPIFY_INSTALLATION_CHANGED', 'Shopify credentials changed after the failed request. Reload before invalidating.');
      if (current.status !== 'INSTALLED') fail('SHOPIFY_AUTH_REQUIRED', 'Shopify installation already requires authorization.', 403);
      current.status = 'AUTH_REQUIRED'; current.encryptedTokens = null; current.expiresAt = null; current.refreshExpiresAt = null; current.refreshUntil = null; current.revision++;
      return { decision: 'allow', installation: metadata(current), providerRevoked: false };
    });
  }
  /** Owner disconnect, or verified authoritative uninstall handling; raw webhook headers are insufficient. */
  async disconnect(id: string, actor: Actor, expectedRevision: number, idempotencyKey: string) {
    owner(actor);
    return this.engine.extensionTransaction('integration.shopify.disconnected', { installationId: id, expectedRevision }, actor, idempotencyKey, state => {
      data(state, this.options.workspaceId); const current = owned(state, id, actor);
      if (current.revision !== expectedRevision) fail('SHOPIFY_INSTALLATION_CHANGED', 'Shopify installation changed. Reload before disconnecting.');
      current.status = 'DISCONNECTED'; current.encryptedTokens = null; current.expiresAt = null; current.refreshExpiresAt = null; current.refreshUntil = null; current.revision++;
      for (const pending of data(state).pending) if (pending.installationId === id && ['pending', 'exchanging'].includes(pending.status)) pending.status = 'superseded';
      return { decision: 'allow', installation: metadata(current), providerRevoked: false };
    });
  }
}
