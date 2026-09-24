import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { createConnector, connectorManifests, ConnectorError, normalizeConnectorError, type CanonicalOrder, type CanonicalProduct, type CommerceConnector, type ConnectorConfig, type ConnectorProvider, type Page } from '@hotl/connector-sdk';
import type { Actor } from '@hotl/schemas';
import { GuardrailError, type GuardrailEngine, type Result } from './engine.js';
import type { EngineState } from './types.js';

const shopifyCredentials = z.object({ shop: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i), accessToken: z.string().min(10).max(4096) }).strict();
const wooCredentials = z.object({ baseUrl: z.string().url().max(1000), consumerKey: z.string().min(10).max(4096), consumerSecret: z.string().min(10).max(4096), currency: z.string().regex(/^[A-Z]{3}$/) }).strict();
const registerSchema = z.discriminatedUnion('provider', [
  z.object({ label: z.string().trim().min(2).max(80), provider: z.literal('shopify'), credentials: shopifyCredentials }).strict(),
  z.object({ label: z.string().trim().min(2).max(80), provider: z.literal('woocommerce'), credentials: wooCredentials }).strict(),
]);
const revisionSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();
const disconnectSchema = revisionSchema.extend({ reason: z.string().trim().min(3).max(1000) });
const reconnectSchema = revisionSchema.extend({ credentials: z.unknown() });
type Status = 'CONNECTED' | 'DEGRADED' | 'AUTH_REQUIRED' | 'RATE_LIMITED' | 'OUTAGE' | 'DISCONNECTED';
type SafeError = { code: string; message: string };
type Connection = {
  id: string; ownerId: string; label: string; provider: ConnectorProvider; host: string;
  status: Status; revision: number; capabilities: string[]; createdAt: string;
  lastSyncAt: string | null; lastError: SafeError | null; disabled: boolean;
  encryptedCredentials: string; products: CanonicalProduct[]; orders: CanonicalOrder[];
};
type SyncJob = { id: string; connectionId: string; ownerId: string; connectionRevision: number; status: 'pending' | 'completed' | 'failed'; createdAt: string; completedAt: string | null; productCount: number; orderCount: number; error?: SafeError };
type IntegrationState = { version: 1; connections: Connection[]; syncs: SyncJob[] };
type Options = { encryptionKey?: string; keyPath?: string; allowedWooCommerceHosts?: string[]; connectorFactory?: (config: ConnectorConfig) => CommerceConnector; maxPages?: number };

function data(state: EngineState): IntegrationState {
  state.extensions ??= {};
  const existing = state.extensions.integrations;
  if (existing === undefined) {
    const initial: IntegrationState = { version: 1, connections: [], syncs: [] };
    state.extensions.integrations = initial;
    return initial;
  }
  const stored = existing as IntegrationState;
  if (stored.version !== 1 || !Array.isArray(stored.connections) || !Array.isArray(stored.syncs)) throw new GuardrailError('INTEGRATION_STATE_INVALID', 'Integration storage is invalid; refusing to reset it.', 503);
  return stored;
}
function publicConnection(connection: Connection) {
  return { id: connection.id, label: connection.label, provider: connection.provider, host: connection.host, status: connection.status, revision: connection.revision, enabled: !connection.disabled, capabilities: connection.capabilities, createdAt: connection.createdAt, lastSyncAt: connection.lastSyncAt, lastError: connection.lastError, productCount: connection.products.length, orderCount: connection.orders.length, readOnly: true };
}
function owner(actor: Actor) { if (actor.type !== 'owner') throw new GuardrailError('OWNER_REQUIRED', 'Integration management requires the owner.', 403); }
function owned(state: IntegrationState, id: string, actor: Actor) {
  owner(actor);
  const connection = state.connections.find(item => item.id === id && item.ownerId === actor.id);
  if (!connection) throw new GuardrailError('INTEGRATION_NOT_FOUND', 'The integration was not found.', 404);
  return connection;
}
function revision(connection: Connection, expected: number) {
  if (connection.revision !== expected) throw new GuardrailError('INTEGRATION_CHANGED', 'This integration changed. Reload before retrying.', 409, { revision: connection.revision });
}
function errorStatus(error: SafeError): Status {
  if (['AUTHENTICATION_FAILED', 'AUTHORIZATION_FAILED'].includes(error.code)) return 'AUTH_REQUIRED';
  if (error.code === 'RATE_LIMITED') return 'RATE_LIMITED';
  if (['TIMEOUT', 'UPSTREAM_UNAVAILABLE'].includes(error.code)) return 'OUTAGE';
  return 'DEGRADED';
}

/** Secrets and all persistent connector mutations remain inside the guardrail process. */
export class IntegrationService {
  private keyPromise?: Promise<Buffer>;
  private active = new Map<string, Promise<Result>>();
  private factory: (config: ConnectorConfig) => CommerceConnector;
  private allowedHosts: string[];
  constructor(private engine: GuardrailEngine, private options: Options = {}) {
    this.factory = options.connectorFactory ?? createConnector;
    this.allowedHosts = options.allowedWooCommerceHosts ?? (process.env.CONNECTOR_ALLOWED_WOOCOMMERCE_HOSTS ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  }
  private async key(): Promise<Buffer> {
    if (!this.keyPromise) this.keyPromise = this.loadKey().catch(error => { this.keyPromise = undefined; throw error; });
    return this.keyPromise;
  }
  private async loadKey() {
    const configured = this.options.encryptionKey ?? process.env.CONNECTOR_ENCRYPTION_KEY;
    if (configured) {
      const key = Buffer.from(configured, 'base64');
      if (key.length !== 32 || key.toString('base64') !== configured) throw new GuardrailError('VAULT_KEY_INVALID', 'The connector encryption key must be 32 bytes encoded as base64.', 503);
      return key;
    }
    if (this.engine.mode !== 'simulation') throw new GuardrailError('VAULT_NOT_CONFIGURED', 'Configure the guardrail connector encryption key before connecting accounts.', 503);
    const keyPath = this.options.keyPath ?? process.env.CONNECTOR_KEY_PATH ?? resolve('.secrets/connectors.key');
    try {
      const key = await readFile(keyPath);
      if (key.length !== 32) throw new GuardrailError('VAULT_KEY_INVALID', 'The persisted connector key is invalid; restore it before continuing.', 503);
      return key;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (data(await this.engine.snapshot()).connections.length) throw new GuardrailError('VAULT_KEY_MISSING', 'The existing connector encryption key is missing. Restore it; stored credentials cannot be reset safely.', 503);
      await mkdir(dirname(keyPath), { recursive: true });
      try {
        const handle = await open(keyPath, 'wx', 0o600);
        const key = randomBytes(32);
        try { await handle.writeFile(key); await handle.sync(); } finally { await handle.close(); }
        return key;
      } catch (writeError) {
        if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
        const key = await readFile(keyPath);
        if (key.length !== 32) throw new GuardrailError('VAULT_KEY_INVALID', 'The connector key is not readable. Retry after initialization completes.', 503);
        return key;
      }
    }
  }
  private encrypt(config: ConnectorConfig, key: Buffer, ownerId: string, id: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`${ownerId}:${id}:${config.provider}`));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
    return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
  }
  private async decrypt(connection: Connection): Promise<ConnectorConfig> {
    try {
      const key = await this.key();
      const [iv, tag, ciphertext, extra] = connection.encryptedCredentials.split('.');
      if (!iv || !tag || !ciphertext || extra) throw new Error('Invalid envelope');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      decipher.setAAD(Buffer.from(`${connection.ownerId}:${connection.id}:${connection.provider}`));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      const stored = JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8')) as ConnectorConfig;
      // The current server allowlist always overrides the value present when credentials were saved.
      return stored.provider === 'woocommerce' ? { ...stored, allowedHosts: this.allowedHosts } : stored;
    } catch (error) {
      if (error instanceof GuardrailError) throw error;
      throw new GuardrailError('CREDENTIALS_UNREADABLE', 'Stored credentials failed authentication. Restore the key or reconnect this integration.', 503);
    }
  }
  private config(provider: ConnectorProvider, credentials: unknown): ConnectorConfig {
    return provider === 'shopify' ? { provider, ...shopifyCredentials.parse(credentials), apiVersion: '2026-07' } : { provider, ...wooCredentials.parse(credentials), allowedHosts: this.allowedHosts };
  }
  async list(actor: Actor) {
    owner(actor);
    const state = data(await this.engine.snapshot());
    return { connections: state.connections.filter(item => item.ownerId === actor.id).map(publicConnection), providers: Object.values(connectorManifests), setup: { vaultConfigured: this.engine.mode === 'simulation' || Boolean(this.options.encryptionKey ?? process.env.CONNECTOR_ENCRYPTION_KEY), allowedWooCommerceHosts: this.allowedHosts }, mode: this.engine.mode };
  }
  async catalog(actor: Actor, connectionId?: string) {
    owner(actor);
    const state = data(await this.engine.snapshot());
    if (connectionId) owned(state, connectionId, actor);
    const connections = state.connections.filter(item => item.ownerId === actor.id && (!connectionId || item.id === connectionId));
    return { products: connections.flatMap(connection => connection.products.map(product => ({ ...product, connectionId: connection.id }))), orders: connections.flatMap(connection => connection.orders.map(order => ({ ...order, connectionId: connection.id }))), mode: this.engine.mode };
  }
  async register(raw: unknown, actor: Actor, idempotencyKey: string) {
    owner(actor);
    const input = registerSchema.parse(raw), config = this.config(input.provider, input.credentials);
    const connector = this.factory(config); // Validates the approved destination before storing credentials.
    const key = await this.key();
    const host = config.provider === 'shopify' ? config.shop.toLowerCase() : new URL(config.baseUrl).hostname.toLowerCase();
    const credentialDigest = createHmac('sha256', key).update(JSON.stringify(config)).digest('hex');
    return this.engine.extensionTransaction('integration.connected', { provider: input.provider, label: input.label, host, credentialDigest }, actor, idempotencyKey, state => {
      const integrations = data(state);
      if (integrations.connections.some(item => item.ownerId === actor.id && item.provider === input.provider && item.host === host)) throw new GuardrailError('INTEGRATION_EXISTS', 'This account is already registered. Update its credentials to reconnect.', 409);
      const id = randomUUID();
      const connection: Connection = { id, ownerId: actor.id, label: input.label, provider: input.provider, host, status: 'DISCONNECTED', revision: 1, capabilities: [...connector.manifest.capabilities], createdAt: new Date().toISOString(), lastSyncAt: null, lastError: null, disabled: false, encryptedCredentials: this.encrypt(config, key, actor.id, id), products: [], orders: [] };
      integrations.connections.push(connection);
      return { decision: 'allow', connection: publicConnection(connection) };
    });
  }
  async credentials(id: string, raw: unknown, actor: Actor, idempotencyKey: string) {
    owner(actor);
    const input = reconnectSchema.parse(raw);
    const current = owned(data(await this.engine.snapshot()), id, actor);
    const config = this.config(current.provider, input.credentials), key = await this.key();
    this.factory(config);
    const host = config.provider === 'shopify' ? config.shop.toLowerCase() : new URL(config.baseUrl).hostname.toLowerCase();
    if (host !== current.host) throw new GuardrailError('ACCOUNT_IMMUTABLE', 'Reconnect the same account. Register a different account separately.', 409);
    const credentialDigest = createHmac('sha256', key).update(JSON.stringify(config)).digest('hex');
    return this.engine.extensionTransaction('integration.credentials.updated', { id, expectedRevision: input.expectedRevision, credentialDigest }, actor, idempotencyKey, state => {
      const connection = owned(data(state), id, actor); revision(connection, input.expectedRevision);
      connection.encryptedCredentials = this.encrypt(config, key, actor.id, id); connection.revision++;
      connection.disabled = false; connection.status = 'DISCONNECTED'; connection.lastError = null;
      return { decision: 'allow', connection: publicConnection(connection) };
    });
  }
  async disconnect(id: string, raw: unknown, actor: Actor, idempotencyKey: string) {
    const input = disconnectSchema.parse(raw);
    return this.engine.extensionTransaction('integration.disconnected', { id, ...input }, actor, idempotencyKey, state => {
      const connection = owned(data(state), id, actor); revision(connection, input.expectedRevision);
      connection.disabled = true; connection.status = 'DISCONNECTED'; connection.revision++;
      return { decision: 'allow', connection: publicConnection(connection), providerRevoked: false };
    });
  }
  async sync(id: string, raw: unknown, actor: Actor, idempotencyKey: string): Promise<Result> {
    owner(actor);
    const input = revisionSchema.parse(raw);
    const started = await this.engine.extensionTransaction('integration.sync.requested', { id, ...input }, actor, idempotencyKey, state => {
      const integrations = data(state), connection = owned(integrations, id, actor); revision(connection, input.expectedRevision);
      if (connection.disabled) throw new GuardrailError('INTEGRATION_DISCONNECTED', 'Reconnect before synchronizing this account.', 409);
      connection.revision++;
      const job: SyncJob = { id: randomUUID(), connectionId: id, ownerId: actor.id, connectionRevision: connection.revision, status: 'pending', createdAt: new Date().toISOString(), completedAt: null, productCount: 0, orderCount: 0 };
      integrations.syncs.push(job);
      return { decision: 'allow', syncId: job.id };
    });
    const syncId = String(started.syncId);
    const running = this.active.get(syncId); if (running) return running;
    const work = this.performSync(syncId, actor).finally(() => this.active.delete(syncId));
    this.active.set(syncId, work); return work;
  }
  private async collect<T>(fetchPage: (cursor?: string) => Promise<Page<T>>) {
    const items: T[] = [], cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < (this.options.maxPages ?? 20); page++) {
      const result = await fetchPage(cursor); items.push(...result.items);
      if (!result.nextCursor) return items;
      if (cursors.has(result.nextCursor)) throw new ConnectorError('INVALID_RESPONSE');
      cursors.add(result.nextCursor); cursor = result.nextCursor;
    }
    throw new GuardrailError('SYNC_PAGE_LIMIT', 'The account exceeds this sync batch limit. No partial snapshot was published.', 422);
  }
  private async performSync(syncId: string, actor: Actor): Promise<Result> {
    const initial = data(await this.engine.snapshot());
    const job = initial.syncs.find(item => item.id === syncId && item.ownerId === actor.id);
    if (!job) throw new GuardrailError('SYNC_NOT_FOUND', 'Sync was not found.', 404);
    const connection = owned(initial, job.connectionId, actor);
    if (job.status !== 'pending') return { decision: 'allow', connection: publicConnection(connection), sync: job };
    let products: CanonicalProduct[] = [], orders: CanonicalOrder[] = [], failure: SafeError | undefined;
    try {
      if (connection.disabled || connection.revision !== job.connectionRevision) throw new GuardrailError('INTEGRATION_CHANGED', 'Integration changed during synchronization. Start a new sync.', 409);
      const connector = this.factory(await this.decrypt(connection));
      products = await this.collect(cursor => connector.listProducts({ cursor, limit: 100 }));
      orders = await this.collect(cursor => connector.listOrders({ cursor, limit: 100 }));
    } catch (error) {
      const normalized = error instanceof GuardrailError ? error : normalizeConnectorError(error);
      failure = { code: normalized.code, message: normalized.message };
    }
    // Provider reads run outside the financial-state lock. The commit verifies the account revision again.
    return this.engine.extensionTransaction('integration.sync.completed', { syncId }, actor, `integration-sync:${syncId}:completed`, state => {
      const integrations = data(state), current = owned(integrations, job.connectionId, actor);
      const currentJob = integrations.syncs.find(item => item.id === syncId && item.ownerId === actor.id)!;
      if (currentJob.status !== 'pending') return { decision: 'allow', connection: publicConnection(current), sync: currentJob };
      if (current.revision !== job.connectionRevision || current.disabled) failure = { code: 'INTEGRATION_CHANGED', message: 'Integration changed while sync ran; saved business data was preserved.' };
      currentJob.completedAt = new Date().toISOString();
      if (failure) {
        currentJob.status = 'failed'; currentJob.error = failure;
        if (!current.disabled && current.revision === job.connectionRevision) { current.status = errorStatus(failure); current.lastError = failure; }
      } else {
        current.products = products; current.orders = orders; current.lastSyncAt = currentJob.completedAt;
        current.status = 'CONNECTED'; current.lastError = null;
        currentJob.status = 'completed'; currentJob.productCount = products.length; currentJob.orderCount = orders.length;
      }
      return { decision: 'allow', connection: publicConnection(current), sync: structuredClone(currentJob) };
    });
  }
}
