import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Actor } from '@hotl/schemas';
import { GuardrailError, type GuardrailEngine } from './engine.js';
import { ShopifyOAuthService } from './shopify-oauth.js';
import { ShopifyCommerceService } from './shopify-service.js';

type Access = { owner(request: FastifyRequest): Promise<Actor>; key(request: FastifyRequest): string; workspaceId: string; mode: 'simulation'|'live'; service?: ShopifyCommerceService };
const empty = (request: FastifyRequest) => z.object({}).strict().parse(request.body ?? {});
const id = (request: FastifyRequest) => z.object({ id: z.string().uuid() }).parse(request.params).id;
const header = (request: FastifyRequest, name: string) => typeof request.headers[name] === 'string' ? request.headers[name] as string : '';
const reconciliationMode = () => {
  const configured = process.env.SHOPIFY_RECONCILIATION_MODE;
  if (configured === 'DURABLE_BACKGROUND' || configured === 'OWNER_MANUAL' || configured === 'DISABLED') return configured;
  return process.env.SHOPIFY_WORKER_ENABLED === 'true' ? 'DURABLE_BACKGROUND' : 'OWNER_MANUAL';
};

export function registerShopifyRoutes(app: FastifyInstance, engine: GuardrailEngine, access: Access) {
  const requestKey = (request: FastifyRequest) => {
    const value = access.key(request);
    if (!value || value.length > 200) throw new GuardrailError('IDEMPOTENCY_KEY_REQUIRED', 'A nonempty Idempotency-Key of at most 200 characters is required.');
    return value;
  };
  const service = access.service ?? (process.env.SHOPIFY_CLIENT_ID ? new ShopifyCommerceService(engine, new ShopifyOAuthService(engine, {
    workspaceId: access.workspaceId, clientId: process.env.SHOPIFY_CLIENT_ID, clientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? '',
    redirectUri: process.env.SHOPIFY_REDIRECT_URI ?? '', encryptionKey: process.env.CONNECTOR_ENCRYPTION_KEY ?? '',
    scopes: process.env.SHOPIFY_SCOPES?.split(',').map(scope => scope.trim()).filter(Boolean),
  }), { webhookSecret: process.env.SHOPIFY_CLIENT_SECRET ?? '', previousWebhookSecret: process.env.SHOPIFY_PREVIOUS_CLIENT_SECRET,
    previousWebhookSecretRevokedAt: process.env.SHOPIFY_PREVIOUS_CLIENT_SECRET_REVOKED_AT,
    previousWebhookSecretValidUntil: process.env.SHOPIFY_PREVIOUS_CLIENT_SECRET_VALID_UNTIL,
    webhookOrigin: process.env.SHOPIFY_WEBHOOK_ORIGIN }) : undefined);
  const required = () => { if (!service) throw new GuardrailError('SHOPIFY_NOT_CONFIGURED', 'Shopify app credentials and HTTPS callback must be configured in the guardrail service.', 503); return service; };
  app.get('/api/shopify/webhooks/health', async (_request, reply) => {
    const mode = reconciliationMode();
    if (access.mode !== 'live' || !service || mode === 'DISABLED') return reply.status(503).send({ status: 'not_ready', ingressReady: false, workerReady: false, reconciliationReady: false });
    return { status: 'ready', ingressReady: true, workerReady: mode === 'DURABLE_BACKGROUND',
      reconciliationReady: true, reconciliationMode: mode };
  });
  app.get('/api/shopify', async request => {
    const actor = await access.owner(request);
    return service ? service.overview(actor) : { configured: false, installations: [], variants: [], jobs: [], inbox: [], operations: [], capabilities: { priceWrite: 'IMPLEMENTED_UNVERIFIED', autonomousPriceWrite: 'DISABLED' } };
  });
  const base = '/api/guardrails/v1/shopify';
  app.post(`${base}/install`, async (request, reply) => {
    const actor = await access.owner(request), result = await required().oauth.start(request.body, actor, access.key(request));
    const cookie = result.cookie;
    reply.header('Set-Cookie', `${cookie.name}=${cookie.value}; Path=${cookie.options.path}; Max-Age=${cookie.options.maxAge}; HttpOnly; Secure; SameSite=Lax`);
    reply.header('Cache-Control', 'no-store');
    return { authorizationUrl: result.authorizationUrl, stateId: result.stateId };
  });
  app.get('/api/shopify/oauth/callback', async (request, reply) => {
    const cookies = header(request, 'cookie').split(';').map(part => part.trim());
    const nonces = cookies.filter(part => part.startsWith('hotl_shopify_oauth='));
    if (nonces.length !== 1) throw new GuardrailError('SHOPIFY_CALLBACK_INVALID', 'The installation browser cookie is missing or ambiguous.', 403);
    const result = await required().oauth.callback(request.raw.url?.split('?').slice(1).join('?') ?? '', nonces[0].slice('hotl_shopify_oauth='.length));
    const installation = result.installation as { id: string; ownerId: string };
    const job = await required().queueSync(installation.id, { type: 'owner', id: installation.ownerId }, `shopify-initial-sync:${installation.id}:${String((result.installation as { revision: number }).revision)}`);
    reply.header('Cache-Control', 'no-store');
    reply.header('Set-Cookie', 'hotl_shopify_oauth=; Path=/api/shopify/oauth/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
    return { decision: 'allow', installationId: installation.id, sync: job };
  });
  app.post(`${base}/installations/:id/sync`, async request => { const actor = await access.owner(request); empty(request); return required().queueSync(id(request), actor, access.key(request)); });
  app.post(`${base}/installations/:id/subscriptions/ensure`, async request => {
    const actor = await access.owner(request), body = z.object({ topic: z.string() }).strict().parse(request.body);
    return required().ensureWebhook(id(request), body.topic, actor, requestKey(request));
  });
  app.post(`${base}/installations/:id/disconnect`, async request => {
    const actor = await access.owner(request), body = z.object({ expectedRevision: z.number().int().positive() }).strict().parse(request.body);
    return required().oauth.disconnect(id(request), actor, body.expectedRevision, access.key(request));
  });
  app.post(`${base}/economics`, async request => required().saveEconomics(request.body, await access.owner(request), access.key(request)));
  app.post(`${base}/prices/propose`, async request => engine.prepareShopifyPrice(request.body, await access.owner(request), access.key(request)));
  app.post(`${base}/prices/:id/cancel`, async request => { const actor = await access.owner(request); return engine.cancelShopifyPrice(id(request), request.body, actor, requestKey(request)); });
  app.post(`${base}/prices/:id/investigations`, async request => { const actor = await access.owner(request); return engine.recordShopifyPriceInvestigation(id(request), request.body, actor, requestKey(request)); });
  app.post(`${base}/prices/:id/execute`, async request => {
    const actor = await access.owner(request); empty(request);
    const result = await required().execute(id(request), actor, requestKey(request));
    // An UNKNOWN outcome means the provider write may or may not have landed. Reporting it as
    // HTTP 200 would let any transport-level client treat a financial operation as completed.
    // It is not a denial either, so it is surfaced as 502 rather than 4xx.
    if ((result as { decision?: string }).decision === 'unknown') throw new GuardrailError('PROVIDER_OUTCOME_UNKNOWN', 'The provider response was lost. The outcome is not known and must not be retried blindly.', 502);
    return result;
  });
  app.post(`${base}/prices/:id/reconcile`, async request => { const actor = await access.owner(request); empty(request); return required().reconcile(id(request), actor, access.key(request)); });
  app.post(`${base}/worker`, async request => {
    const actor = await access.owner(request); empty(request); requestKey(request);
    if (reconciliationMode() === 'DISABLED') throw new GuardrailError('SHOPIFY_WORKER_DISABLED', 'Shopify reconciliation is explicitly disabled.', 503);
    return required().workOnce(actor);
  });
  app.register(async hooks => {
    hooks.removeContentTypeParser('application/json');
    hooks.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 2 * 1024 * 1024 }, (_request, body, done) => done(null, body));
    hooks.post('/api/shopify/webhooks/:id', { bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
      const result = await required().webhook(id(request), request.body as Buffer, header(request, 'x-shopify-hmac-sha256'), header(request, 'x-shopify-webhook-id'), header(request, 'x-shopify-topic'));
      return reply.status(202).send(result);
    });
  });
  if (service && reconciliationMode() === 'DURABLE_BACKGROUND') {
    let running: Promise<unknown> | undefined;
    const timer = setInterval(() => {
      if (!running) running = service.workOnce().catch(() => app.log.error({ code: 'SHOPIFY_WORKER_FAILED' }, 'Shopify worker pass failed; durable work retained.')).finally(() => { running = undefined; });
    }, 5000); timer.unref();
    app.addHook('onClose', async () => { clearInterval(timer); await running; });
  }
}
