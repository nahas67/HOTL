import { z } from 'zod';

const id = z.string().uuid();
const variantId = z.string().regex(/^gid:\/\/shopify\/ProductVariant\/[1-9]\d*$/);
export const shopifyInstallSchema = z.object({ shop: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/) }).strict();
export const shopifyPriceSchema = z.object({ installationId: id, variantId,
  expectedRevision: z.number().int().positive(), expectedConstitutionVersion: z.number().int().positive(),
  price: z.string().regex(/^(0|[1-9]\d{0,6})\.\d{2}$/), reason: z.string().trim().min(10).max(1000), compensationFor: id.optional() }).strict();
export const shopifyEconomicsSchema = z.object({ installationId: id, variantId, expectedRevision: z.number().int().positive(),
  landedCost: z.number().min(0).max(1_000_000).multipleOf(0.01), estimatedCac: z.number().min(0).max(1_000_000).multipleOf(0.01),
  category: z.string().trim().min(1).max(100), countryOfOrigin: z.string().regex(/^[A-Z]{2}$/).optional(),
  evidence: z.string().trim().min(10).max(1000), validUntil: z.string().datetime() }).strict();
export const shopifyInvestigationSchema = z.object({ expectedStatus: z.enum(['DISPATCHING', 'UNKNOWN', 'DRIFT']),
  expectedReconciliationAt: z.string().datetime().nullable(),
  expectedReconciliationRevision: z.number().int().positive().nullable(),
  nextStep: z.enum(['INVESTIGATE_PROVIDER_LOGS', 'CONTACT_SHOPIFY_SUPPORT', 'KEEP_RESOURCE_BLOCKED']),
  note: z.string().trim().min(20).max(2000),
  evidence: z.array(z.object({ source: z.enum(['SHOPIFY_ADMIN', 'SHOPIFY_SUPPORT', 'INTERNAL_AUDIT']),
    reference: z.string().trim().min(8).max(300).regex(/^[^\r\n<>]+$/) }).strict()).max(5) }).strict();
const empty = z.object({}).strict();

/** Explicit route allowlist; no arbitrary guardrail/provider passthrough. */
export function shopifyMutationSchema(path: string[]): z.ZodTypeAny | null {
  const route = path.join('/');
  if (route === 'shopify/install') return shopifyInstallSchema;
  if (route === 'shopify/economics') return shopifyEconomicsSchema;
  if (route === 'shopify/prices/propose') return shopifyPriceSchema;
  if (route === 'shopify/worker') return empty;
  if (path.length === 5 && path[0] === 'shopify' && path[1] === 'installations' && id.safeParse(path[2]).success && path[3] === 'subscriptions' && path[4] === 'ensure')
    return z.object({ topic: z.enum(['products/create', 'products/update', 'products/delete', 'inventory_levels/update']) }).strict();
  if (path.length === 4 && path[0] === 'shopify' && id.safeParse(path[2]).success) {
    if (path[1] === 'installations' && path[3] === 'sync') return empty;
    if (path[1] === 'installations' && path[3] === 'disconnect') return z.object({ expectedRevision: z.number().int().positive() }).strict();
    if (path[1] === 'prices' && ['execute', 'reconcile'].includes(path[3])) return empty;
    if (path[1] === 'prices' && path[3] === 'cancel') return z.object({ reason: z.string().trim().min(10).max(1000) }).strict();
    if (path[1] === 'prices' && path[3] === 'investigations') return shopifyInvestigationSchema;
  }
  return null;
}

/** Forward only the tightly scoped server-issued nonce, never an arbitrary upstream cookie. */
export function shopifyCookie(value: string | null): string | null {
  return value && /^hotl_shopify_oauth=[A-Za-z0-9_-]*; Path=\/api\/shopify\/oauth\/callback; Max-Age=\d{1,5}; HttpOnly; Secure; SameSite=Lax$/.test(value) ? value : null;
}

export async function forwardShopifyCallback(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  const failure = (status: number) => Response.json({ error: { code: 'SHOPIFY_CALLBACK_FAILED', message: 'Shopify authorization could not be completed. Return to Integrations and start a new installation.' } }, { status, headers });
  const queryIndex = request.url.indexOf('?');
  const query = queryIndex < 0 ? '' : request.url.slice(queryIndex + 1);
  const cookies = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith('hotl_shopify_oauth='));
  if (!query || query.length > 10000 || cookies.length !== 1 || !/^hotl_shopify_oauth=[A-Za-z0-9_-]{20,200}$/.test(cookies[0])) return failure(400);
  try {
    // Preserve the signed raw query. The guardrail verifies HMAC, state, browser
    // nonce, expiry and installation ownership. No owner bearer token is forwarded.
    const response = await fetch(`${(process.env.GUARDRAIL_SERVICE_URL ?? 'http://127.0.0.1:4100').replace(/\/$/, '')}/api/shopify/oauth/callback?${query}`, {
      headers: { Cookie: cookies[0] }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    const result: unknown = await response.json();
    if (!response.ok || !result || typeof result !== 'object' || !('decision' in result) || result.decision !== 'allow') return failure(response.status >= 400 && response.status < 500 ? response.status : 502);
    const cookie = shopifyCookie(response.headers.get('set-cookie'));
    if (!cookie) return failure(502);
    return new Response(null, { status: 303, headers: { ...headers, Location: '/integrations?shopify=connected', 'Set-Cookie': cookie } });
  } catch { return failure(503); }
}
