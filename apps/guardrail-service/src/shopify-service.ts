import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createConnector, verifyWebhookSignature, normalizeConnectorError, type CommerceConnector, type Page } from '@hotl/connector-sdk';
import type { Actor } from '@hotl/schemas';
import { GuardrailError, type GuardrailEngine, type Result } from './engine.js';
import { assertShopifyInstallation, lookupShopifyInstallation, type ShopifyOAuthService } from './shopify-oauth.js';
import { shopifyPricePort, type ShopifyPricePort } from './shopify-provider.js';
import { managedWebhookTopic, shopifyWebhookPort, type ManagedWebhookTopic, type ShopifyWebhookPort } from './shopify-webhooks.js';
import { shopifyData, ownVariant, sameObservation, variantId, type MerchantVariant, type PriceOperation } from './shopify-state.js';

type Options = { webhookSecret: string; previousWebhookSecret?: string; previousWebhookSecretValidUntil?: string; webhookOrigin?: string; webhookPort?: (shop: string, token: string) => ShopifyWebhookPort;
  connector?: (shop: string, token: string) => CommerceConnector; port?: (shop: string, token: string) => ShopifyPricePort; now?: () => Date };
const economicsSchema = z.object({ installationId: z.string().uuid(), variantId, expectedRevision: z.number().int().positive(),
  landedCost: z.number().min(0).max(1_000_000).multipleOf(0.01), estimatedCac: z.number().min(0).max(1_000_000).multipleOf(0.01),
  category: z.string().trim().min(1).max(100), countryOfOrigin: z.string().regex(/^[A-Z]{2}$/).optional(),
  evidence: z.string().trim().min(10).max(1000), validUntil: z.string().datetime() }).strict();
function owner(actor: Actor) { if (actor.type !== 'owner') throw new GuardrailError('OWNER_REQUIRED', 'Shopify management requires an owner.', 403); }
function safeOperation(op: PriceOperation) { const { claim: _claim, ...safe } = op; return safe; }
function code(error: unknown) { return error instanceof GuardrailError ? error.code : normalizeConnectorError(error).code; }

/** Durable reconciliation worker and provider orchestration; never exported to runtime agents. */
export class ShopifyCommerceService {
  private active = false;
  constructor(private engine: GuardrailEngine, readonly oauth: ShopifyOAuthService, private options: Options) {
    const previous = options.previousWebhookSecret;
    const until = options.previousWebhookSecretValidUntil;
    if (previous !== undefined || until !== undefined) {
      const expires = until ? Date.parse(until) : NaN;
      if (!previous || previous === options.webhookSecret || !Number.isFinite(expires) || expires <= this.now().getTime() || expires > this.now().getTime() + 60 * 60 * 1000)
        throw new GuardrailError('SHOPIFY_WEBHOOK_ROTATION_INVALID', 'The previous webhook secret requires a distinct secret and an expiry within one hour.', 503);
    }
  }
  private now() { return this.options.now?.() ?? new Date(); }
  private port(shop: string, token: string) { return this.options.port?.(shop, token) ?? shopifyPricePort(shop, token); }
  private webhookPort(shop: string, token: string) { return this.options.webhookPort?.(shop, token) ?? shopifyWebhookPort(shop, token); }
  private webhookUri(installationId: string) {
    if (!this.options.webhookOrigin) throw new GuardrailError('SHOPIFY_WEBHOOK_ORIGIN_REQUIRED', 'Configure a public HTTPS webhook origin on the guardrail service.', 503);
    let origin: URL;
    try { origin = new URL(this.options.webhookOrigin); } catch { throw new GuardrailError('SHOPIFY_WEBHOOK_ORIGIN_INVALID', 'Webhook origin must be a public HTTPS origin.', 503); }
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || origin.hostname === 'localhost' || origin.hostname.endsWith('.localhost') || origin.hostname === '127.0.0.1') throw new GuardrailError('SHOPIFY_WEBHOOK_ORIGIN_INVALID', 'Webhook origin must be a public HTTPS origin.', 503);
    return `${origin.origin}/api/shopify/webhooks/${installationId}`;
  }
  async overview(actor: Actor) {
    owner(actor); const state = shopifyData(await this.engine.snapshot());
    return { configured: true, installations: (await this.oauth.list(actor)).installations, variants: state.variants.filter(v => v.ownerId === actor.id),
      jobs: state.jobs.filter(j => j.ownerId === actor.id).slice(-100), inbox: state.inbox.filter(e => e.ownerId === actor.id).slice(-100),
      operations: state.operations.filter(op => op.ownerId === actor.id).map(safeOperation).slice(-100),
      subscriptionAttempts: state.subscriptionAttempts!.filter(item => item.ownerId === actor.id).slice(-100),
      capabilities: { priceWrite: 'IMPLEMENTED_UNVERIFIED', autonomousPriceWrite: 'DISABLED', orders: 'REQUIRES_READ_ORDERS_SCOPE', fulfillmentWrites: 'UNSUPPORTED' } };
  }
  async queueSync(installationId: string, actor: Actor, key: string) {
    owner(actor);
    return this.engine.extensionTransaction('integration.shopify.sync.queued', { installationId }, actor, key, state => {
      assertShopifyInstallation(state, installationId, actor);
      const data = shopifyData(state);
      const existing = data.jobs.find(job => job.installationId === installationId && job.status === 'PENDING');
      if (existing) return { decision: 'allow', jobId: existing.id, status: existing.status };
      const id = randomUUID(); data.jobs.push({ id, installationId, ownerId: actor.id, status: 'PENDING', attempts: 0, createdAt: this.now().toISOString() });
      return { decision: 'allow', jobId: id, status: 'PENDING' };
    });
  }
  /** One explicit owner action per topic. A durable DISPATCHING claim prevents any blind resend after a lost response. */
  async ensureWebhook(installationId: string, rawTopic: unknown, actor: Actor, key: string) {
    owner(actor);
    const topic = managedWebhookTopic.parse(rawTopic), uri = this.webhookUri(installationId);
    const credentials = await this.oauth.accessToken(installationId, actor);
    const scope = topic.startsWith('products/') ? 'products' : 'inventory';
    const requireScope = (scopes: string[]) => {
      if (!scopes.includes(`read_${scope}`) && !scopes.includes(`write_${scope}`)) throw new GuardrailError('SHOPIFY_SCOPES_MISSING', `A ${scope} scope is required for this webhook topic.`, 403);
    };
    requireScope((await this.engine.assertShopifyWebhookWrite(await this.engine.snapshot(), installationId, actor, credentials.revision)).scopes);
    const provider = this.webhookPort(credentials.shop, credentials.accessToken);
    const before = await provider.list(topic);
    if (before.shop !== credentials.shop || !before.developmentStore) throw new GuardrailError('SHOPIFY_DEVELOPMENT_STORE_REQUIRED', 'Webhook registration is limited to an attested development store.', 403);
    const matches = before.subscriptions.filter(item => item.uri === uri);
    if (matches.length > 1) throw new GuardrailError('SHOPIFY_WEBHOOK_DUPLICATE', 'Multiple matching subscriptions require provider-side review.', 409);
    if (before.subscriptions.length > matches.length) throw new GuardrailError('SHOPIFY_WEBHOOK_CONFLICT', 'Another shop-scoped subscription exists for this topic. Review it in Shopify before registering another endpoint.', 409);
    if (matches.length === 1) return this.engine.extensionTransaction('integration.shopify.webhook.subscription-verified', { installationId, topic, uri, providerId: matches[0].id }, actor, key, state => {
      assertShopifyInstallation(state, installationId, actor, credentials.revision);
      return { decision: 'allow', status: 'OBSERVED', providerId: matches[0].id, providerWritePerformed: false };
    });
    const claimId = randomUUID();
    const claim = await this.engine.extensionTransaction('integration.shopify.webhook.subscription-claimed', { installationId, topic, uri, claimId }, actor, key, async state => {
      requireScope((await this.engine.assertShopifyWebhookWrite(state, installationId, actor, credentials.revision)).scopes);
      const attempts = shopifyData(state).subscriptionAttempts!;
      if (attempts.some(item => item.installationId === installationId && item.topic === topic && ['DISPATCHING', 'UNKNOWN'].includes(item.status))) return { decision: 'deny', reason: 'WEBHOOK_PROVISION_UNRESOLVED', providerWritePerformed: false };
      attempts.push({ id: claimId, installationId, ownerId: actor.id, installationRevision: credentials.revision, topic, uri, status: 'DISPATCHING', createdAt: this.now().toISOString() });
      return { decision: 'allow', claimId, status: 'DISPATCHING' };
    });
    if (claim.decision !== 'allow' || claim.claimId !== claimId) return claim;
    let status: 'CONFIRMED' | 'UNKNOWN' | 'REJECTED' = 'UNKNOWN', providerId: string | undefined, requestId: string | null = null, errorCode: string | undefined, dispatched = false;
    try {
      requireScope((await this.engine.assertShopifyWebhookWrite(await this.engine.snapshot(), installationId, actor, credentials.revision)).scopes);
      const fresh = await provider.list(topic);
      if (fresh.shop !== credentials.shop || !fresh.developmentStore) throw new GuardrailError('SHOPIFY_DEVELOPMENT_STORE_REQUIRED', 'Webhook registration requires a development store.', 403);
      if (fresh.subscriptions.length) { status = 'REJECTED'; errorCode = fresh.subscriptions.some(item => item.uri === uri) ? 'WEBHOOK_ALREADY_EXISTS' : 'WEBHOOK_CONFLICT'; }
      else {
        dispatched = true;
        const created = await provider.create(topic, uri);
        requestId = created.requestId;
        if (created.rejected) status = 'REJECTED';
        else {
          const after = await provider.list(topic);
          const matching = after.subscriptions.filter(item => item.uri === uri && item.id === created.subscription?.id);
          if (after.shop === credentials.shop && after.developmentStore && matching.length === 1 && after.subscriptions.length === 1) { status = 'CONFIRMED'; providerId = matching[0].id; }
          else errorCode = 'WEBHOOK_READBACK_MISMATCH';
        }
      }
    } catch (error) { errorCode = code(error); if (!dispatched) status = 'REJECTED'; }
    return this.engine.extensionTransaction('integration.shopify.webhook.subscription-result', { installationId, topic, claimId, status, providerId, requestId, errorCode }, actor, `shopify-webhook-result:${claimId}`, state => {
      const attempt = shopifyData(state).subscriptionAttempts!.find(item => item.id === claimId && item.ownerId === actor.id && item.status === 'DISPATCHING');
      if (!attempt) throw new GuardrailError('WEBHOOK_CLAIM_CHANGED', 'Webhook dispatch claim changed; inspect the durable ledger.', 409);
      attempt.status = status; attempt.completedAt = this.now().toISOString(); attempt.providerId = providerId; attempt.requestId = requestId; attempt.errorCode = errorCode;
      return { decision: status === 'CONFIRMED' ? 'allow' : 'deny', status, providerId, requestId, errorCode, providerWritePerformed: dispatched };
    });
  }
  async webhook(installationId: string, rawBody: Buffer, signature: string, deliveryId: string, topic: string) {
    const current = verifyWebhookSignature({ provider: 'shopify', rawBody, signature, secret: this.options.webhookSecret });
    const previous = this.options.previousWebhookSecret && Date.parse(this.options.previousWebhookSecretValidUntil ?? '') > this.now().getTime()
      ? verifyWebhookSignature({ provider: 'shopify', rawBody, signature, secret: this.options.previousWebhookSecret }) : false;
    if (!current && !previous) throw new GuardrailError('INVALID_WEBHOOK', 'Webhook signature is invalid.', 401);
    z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/).parse(deliveryId);
    z.enum(['products/create', 'products/update', 'products/delete', 'inventory_levels/update', 'orders/create', 'orders/updated', 'app/uninstalled']).parse(topic);
    let parsed: unknown; try { parsed = JSON.parse(rawBody.toString('utf8')); } catch { throw new GuardrailError('INVALID_WEBHOOK', 'Webhook body is invalid.'); }
    const payload = z.object({ id: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).optional(), inventory_item_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional() }).passthrough().parse(parsed);
    if (payload.id === undefined && payload.inventory_item_id === undefined) throw new GuardrailError('INVALID_WEBHOOK', 'A resource identifier is required.');
    const installation = lookupShopifyInstallation(await this.engine.snapshot(), installationId);
    if (!installation) throw new GuardrailError('SHOPIFY_INSTALLATION_NOT_FOUND', 'Installation not found.', 404);
    const actor: Actor = { type: 'owner', id: installation.ownerId };
    const digest = createHash('sha256').update(rawBody).digest('hex');
    return this.engine.extensionTransaction('integration.shopify.webhook.received', { installationId, digest, deliveryId, topic }, actor, `shopify-hook:${installationId}:${deliveryId}`, state => {
      assertShopifyInstallation(state, installationId, actor);
      const data = shopifyData(state);
      const duplicate = data.inbox.find(event => event.installationId === installationId && event.digest === digest);
      if (duplicate) return { accepted: true, duplicate: true, eventId: duplicate.id };
      if (data.inbox.filter(e => e.status === 'PENDING').length >= 1000) throw new GuardrailError('WEBHOOK_BACKLOG_FULL', 'Webhook intake is temporarily full; retry delivery.', 503);
      const id = randomUUID(); data.inbox.push({ id, installationId, ownerId: actor.id, digest, deliveryId, topic, receivedAt: this.now().toISOString(), status: 'PENDING', attempts: 0 });
      // Unsigned shop/topic/time headers and body content never modify canonical records.
      return { accepted: true, duplicate: false, eventId: id };
    });
  }
  async saveEconomics(raw: unknown, actor: Actor, key: string) {
    owner(actor); const input = economicsSchema.parse(raw);
    const remaining = Date.parse(input.validUntil) - this.now().getTime();
    if (remaining <= 0 || remaining > 30 * 86400000) throw new GuardrailError('EVIDENCE_EXPIRY_INVALID', 'Cost evidence must expire within 30 days.');
    return this.engine.extensionTransaction('integration.shopify.economics.updated', input, actor, key, state => {
      assertShopifyInstallation(state, input.installationId, actor);
      const variant = ownVariant(state, input, actor);
      if (!variant || variant.revision !== input.expectedRevision) throw new GuardrailError('RESOURCE_CHANGED', 'Refresh the merchant variant before editing.', 409);
      const { installationId: _id, variantId: _variantId, expectedRevision: _revision, ...economics } = input;
      variant.economics = economics; variant.revision++;
      return { decision: 'allow', revision: variant.revision };
    });
  }
  async execute(id: string, actor: Actor, key = `shopify-execute-request:${id}`) {
    owner(actor);
    const op = shopifyData(await this.engine.snapshot()).operations.find(item => item.id === id && item.ownerId === actor.id);
    if (!op) throw new GuardrailError('OPERATION_NOT_FOUND', 'The operation was not found.', 404);
    await this.engine.extensionTransaction('integration.shopify.price.execution-requested', { id }, actor, key, state => {
      if (!shopifyData(state).operations.some(item => item.id === id && item.ownerId === actor.id)) throw new GuardrailError('OPERATION_NOT_FOUND', 'The operation was not found.', 404);
      return { operationId: id, accepted: true };
    });
    if (op.status !== 'PENDING') return { operation: safeOperation(op), dispatchRepeated: false };
    const credentials = await this.oauth.accessToken(op.input.installationId, actor);
    const claim = await this.engine.claimShopifyPrice(id, actor);
    if (!claim.claimed) return { ...claim, dispatchRepeated: false };
    const result = await this.engine.dispatchShopifyPrice(id, String(claim.claim), actor, credentials.revision, this.port(credentials.shop, credentials.accessToken));
    if (result.reason === 'SHOPIFY_AUTH_REQUIRED' || (result.receipt as { errorCode?: string } | undefined)?.errorCode === 'AUTHENTICATION_FAILED') await this.invalidateCredentials(op.input.installationId, actor, credentials.revision);
    return result;
  }
  private async invalidateCredentials(id: string, actor: Actor, revision: number) {
    try { await this.oauth.invalidate(id, actor, revision, `shopify-auth-invalid:${id}:${revision}`); }
    catch (error) { if (!(error instanceof GuardrailError) || error.code !== 'SHOPIFY_INSTALLATION_CHANGED') throw error; }
  }
  async reconcile(id: string, actor: Actor, key: string) {
    owner(actor);
    const op = shopifyData(await this.engine.snapshot()).operations.find(item => item.id === id && item.ownerId === actor.id);
    if (!op) throw new GuardrailError('OPERATION_NOT_FOUND', 'The operation was not found.', 404);
    const credentials = await this.oauth.accessToken(op.input.installationId, actor);
    const observation = await this.port(credentials.shop, credentials.accessToken).read(op.input.variantId);
    return this.engine.extensionTransaction('integration.shopify.price.reconciled', { id }, actor, key, state => {
      assertShopifyInstallation(state, op.input.installationId, actor, credentials.revision);
      const current = shopifyData(state).operations.find(item => item.id === id && item.ownerId === actor.id)!;
      current.reconciliation = { at: this.now().toISOString(), revision: (current.reconciliation?.revision ?? (current.reconciliation ? 1 : 0)) + 1,
        observation, matchesTarget: observation.price === current.input.price && observation.productId === current.before.productId && observation.currency === current.before.currency };
      // Observing the target price does not prove which actor caused it. Unknown operations remain blocked.
      return { decision: 'allow', operation: safeOperation(current), providerWritePerformed: false };
    });
  }
  private async collect<T>(fetchPage: (cursor?: string) => Promise<Page<T>>, budget: { remaining: number }) {
    const items: T[] = [], cursors = new Set<string>(); let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      if (--budget.remaining < 0) throw new GuardrailError('SYNC_BUDGET_EXCEEDED', 'The bounded sync exceeded its request budget.', 422);
      const result = await fetchPage(cursor); items.push(...result.items);
      if (!result.nextCursor) return items;
      if (cursors.has(result.nextCursor)) throw new GuardrailError('SYNC_CURSOR_INVALID', 'Provider pagination did not advance.', 502);
      cursors.add(result.nextCursor); cursor = result.nextCursor;
    }
    throw new GuardrailError('SYNC_PAGE_LIMIT', 'Provider pagination exceeded the supported batch.', 422);
  }
  async workOnce(requester?: Actor): Promise<Result> {
    if (requester) owner(requester);
    if (this.active) return { busy: true }; this.active = true;
    try {
      const state = shopifyData(await this.engine.snapshot());
      const event = state.inbox.find(item => item.status === 'PENDING' && (!requester || item.ownerId === requester.id));
      if (event) {
        const actor: Actor = { type: 'owner', id: event.ownerId };
        try {
          await this.queueSync(event.installationId, actor, `shopify-event-sync:${event.id}`);
          await this.engine.extensionTransaction('integration.shopify.webhook.queued', { id: event.id }, actor, `shopify-event-queued:${event.id}`, draft => {
            const current = shopifyData(draft).inbox.find(item => item.id === event.id)!; current.status = 'COMPLETED'; current.attempts++;
            return { status: 'COMPLETED', meaning: 'Reconciliation queued; webhook body was not applied.' };
          });
        } catch (error) {
          await this.engine.extensionTransaction('integration.shopify.webhook.failed', { id: event.id, attempt: event.attempts }, actor, `shopify-event-failed:${event.id}:${event.attempts}`, draft => {
            const current = shopifyData(draft).inbox.find(item => item.id === event.id)!; current.attempts++; current.errorCode = code(error); if (current.attempts >= 3) current.status = 'DEAD_LETTER';
            return { status: current.status };
          });
        }
      }
      const jobs = shopifyData(await this.engine.snapshot()).jobs.filter(job => !requester || job.ownerId === requester.id);
      const pending = jobs.find(job => (job.status === 'PENDING' && (!job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= this.now().getTime()) || job.status === 'RUNNING' && Date.parse(job.leaseUntil ?? '') <= this.now().getTime()) && !jobs.some(other => other.id !== job.id && other.installationId === job.installationId && other.status === 'RUNNING' && Date.parse(other.leaseUntil ?? '') > this.now().getTime()));
      if (!pending) return { idle: true };
      return await this.runSync(pending.id, { type: 'owner', id: pending.ownerId });
    } finally { this.active = false; }
  }
  private async runSync(id: string, actor: Actor): Promise<Result> {
    const claim = randomUUID();
    const claimed = await this.engine.extensionTransaction('integration.shopify.sync.claimed', { id, claim }, actor, `shopify-sync-claim:${claim}`, state => {
      const job = shopifyData(state).jobs.find(item => item.id === id && item.ownerId === actor.id)!;
      if (job.status !== 'PENDING' && !(job.status === 'RUNNING' && Date.parse(job.leaseUntil ?? '') <= this.now().getTime())) return { claimed: false };
      if (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > this.now().getTime()) return { claimed: false };
      if (shopifyData(state).jobs.some(other => other.id !== id && other.installationId === job.installationId && other.status === 'RUNNING' && Date.parse(other.leaseUntil ?? '') > this.now().getTime())) return { claimed: false };
      if (job.attempts >= 3) { job.status = 'FAILED'; job.errorCode = 'SYNC_ATTEMPTS_EXHAUSTED'; return { claimed: false, status: 'FAILED' }; }
      job.status = 'RUNNING'; job.attempts++; job.claim = claim; job.leaseUntil = new Date(this.now().getTime() + 1800000).toISOString();
      return { claimed: true, installationId: job.installationId };
    });
    if (!claimed.claimed) return claimed;
    const installationId = String(claimed.installationId);
    let credentialRevision: number | undefined;
    try {
      const credentials = await this.oauth.accessToken(installationId, actor);
      credentialRevision = credentials.revision;
      const connector = this.options.connector?.(credentials.shop, credentials.accessToken) ?? createConnector({ provider: 'shopify', shop: credentials.shop, accessToken: credentials.accessToken });
      const budget = { remaining: 100 }, products = await this.collect(cursor => connector.listProducts({ cursor, limit: 100 }), budget);
      const variants: MerchantVariant[] = [];
      for (const product of products) {
        const found = await this.collect(cursor => connector.listVariants({ productId: product.externalId, cursor, limit: 100 }), budget);
        for (const item of found) {
          if (!item.price || !product.updatedAt) throw new GuardrailError('PROVIDER_STATE_INCOMPLETE', 'Variant price and provider revision are required.', 502);
          const amount = item.price.amount;
          const price = /^\d+$/.test(amount) ? `${amount}.00` : /^\d+\.\d$/.test(amount) ? `${amount}0` : amount;
          variants.push({ installationId, ownerId: actor.id, variantId: item.externalId, productId: item.productId, title: item.title, sku: item.sku, price, currency: item.price.currency,
            providerRevision: product.updatedAt, revision: 1, observedAt: this.now().toISOString(), requestId: null });
        }
      }
      const inventory = await this.collect(cursor => connector.listInventory({ cursor, limit: 100 }), budget);
      const orders = credentials.scopes.some(scope => ['read_orders', 'write_orders'].includes(scope)) ? await this.collect(cursor => connector.listOrders({ cursor, limit: 100 }), budget) : [];
      const locations = await this.port(credentials.shop, credentials.accessToken).locations();
      return await this.engine.extensionTransaction('integration.shopify.sync.completed', { id, claim }, actor, `shopify-sync-complete:${id}:${claim}`, state => {
        assertShopifyInstallation(state, installationId, actor, credentials.revision);
        const data = shopifyData(state), job = data.jobs.find(item => item.id === id)!;
        if (job.claim !== claim || job.status !== 'RUNNING') return { superseded: true };
        for (const variant of variants) {
          const prior = data.variants.find(item => item.installationId === installationId && item.variantId === variant.variantId);
          if (prior) { variant.economics = prior.economics; variant.revision = prior.revision + (sameObservation(prior, variant) ? 0 : 1); }
        }
        data.variants = [...data.variants.filter(item => item.installationId !== installationId), ...variants];
        data.snapshots = [...data.snapshots.filter(item => item.installationId !== installationId), { installationId, ownerId: actor.id, observedAt: this.now().toISOString(), products, inventory, orders, locations }];
        job.status = 'COMPLETED'; job.completedAt = this.now().toISOString(); delete job.claim; delete job.errorCode; delete job.nextAttemptAt;
        return { decision: 'allow', jobId: id, status: job.status, variants: variants.length, ordersImported: orders.length, orderScopeGranted: credentials.scopes.some(scope => ['read_orders', 'write_orders'].includes(scope)) };
      });
    } catch (error) {
      if (code(error) === 'AUTHENTICATION_FAILED' && credentialRevision !== undefined) await this.invalidateCredentials(installationId, actor, credentialRevision);
      return this.engine.extensionTransaction('integration.shopify.sync.failed', { id, claim }, actor, `shopify-sync-fail:${id}:${claim}`, state => {
        const job = shopifyData(state).jobs.find(item => item.id === id)!;
        if (job.claim !== claim || job.status !== 'RUNNING') return { superseded: true };
        job.errorCode = code(error);
        const retryable = ['RATE_LIMITED', 'TIMEOUT', 'UPSTREAM_UNAVAILABLE', 'STATE_BUSY'].includes(job.errorCode);
        job.status = retryable && job.attempts < 3 ? 'PENDING' : 'FAILED';
        if (job.status === 'PENDING') job.nextAttemptAt = new Date(this.now().getTime() + 5000 * 2 ** (job.attempts - 1)).toISOString();
        else job.completedAt = this.now().toISOString();
        delete job.claim;
        return { decision: 'deny', jobId: id, status: job.status, reason: job.errorCode };
      });
    }
  }
}
