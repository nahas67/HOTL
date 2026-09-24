import { z } from 'zod';

export const resolveSchema = z.object({
  decision: z.enum(['approve', 'reject', 'modify']),
  note: z.string().trim().min(3, 'Add a decision note (at least 3 characters).').max(2000),
  modifiedPayload: z.record(z.unknown()).nullable().optional(),
  reviewLegacy: z.boolean().optional(),
  expectedConstitutionVersion: z.number().int().positive().optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  expectedOrderRevision: z.number().int().nonnegative().optional(),
}).strict().refine(value => value.decision !== 'modify' || value.modifiedPayload != null, { message: 'Modified details are required.' });

const shopifyCredentials = z.object({ shop: z.string().min(1).max(255), accessToken: z.string().min(1).max(4000) }).strict();
const wooCredentials = z.object({ baseUrl: z.string().url().max(2000), consumerKey: z.string().min(1).max(1000), consumerSecret: z.string().min(1).max(4000), currency: z.string().regex(/^[A-Z]{3}$/) }).strict();
export const integrationCreateSchema = z.discriminatedUnion('provider', [
  z.object({ label: z.string().trim().min(1).max(100), provider: z.literal('shopify'), credentials: shopifyCredentials }).strict(),
  z.object({ label: z.string().trim().min(1).max(100), provider: z.literal('woocommerce'), credentials: wooCredentials }).strict(),
]);
export const integrationRevisionSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();
export const integrationDisconnectSchema = integrationRevisionSchema.extend({ reason: z.string().trim().min(3).max(1000) }).strict();
export const integrationCredentialsSchema = integrationRevisionSchema.extend({ credentials: z.union([shopifyCredentials, wooCredentials]) }).strict();

export const configSchema = z.object({
  dailyAdSpendCeiling: z.number().positive().max(1000000),
  marginFloor: z.number().min(0.4).max(0.99),
  autoRefundThreshold: z.number().min(0).max(25),
  currency: z.literal('USD'),
}).strict();

export function isLocalRequest(request: Request) {
  const url = new URL(request.url);
  const host = new URL(`${url.protocol}//${request.headers.get('host') ?? url.host}`).hostname;
  return ['localhost', '127.0.0.1', '[::1]'].includes(host);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  // Next may normalize request.url to localhost even when the browser used
  // 127.0.0.1. Host is the target authority; never trust X-Forwarded-Host here.
  const expected = process.env.HOTL_PUBLIC_ORIGIN ?? `${url.protocol}//${request.headers.get('host') ?? url.host}`;
  if (origin && origin !== expected) throw new Error('Cross-origin requests are not permitted.');
  if (request.method !== 'GET' && request.headers.get('x-hotl-cockpit') !== '1') throw new Error('Missing cockpit request header.');
}

export function simulationEnabled(request: Request) {
  return (process.env.HOTL_MODE ?? 'simulation') === 'simulation' && isLocalRequest(request);
}

export function ownerHeaders(request: Request): HeadersInit {
  const bearer = request.headers.get('authorization');
  if (bearer?.startsWith('Bearer ') && bearer.length > 10) return { Authorization: bearer };
  if (simulationEnabled(request)) return { 'x-hotl-internal-token': process.env.HOTL_INTERNAL_TOKEN ?? 'hotl-local-development-token' };
  throw new Error('Sign in with your owner account to continue.');
}

export async function upstream(base: string, path: string, headers: HeadersInit, method = 'GET', body?: unknown) {
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method,
    headers: { ...headers, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch {
    return { ok: false, status: response.ok ? 502 : response.status, data: { error: { code: 'INVALID_UPSTREAM_RESPONSE', message: response.ok ? 'The service returned an invalid response.' : 'The service is unavailable.' } } };
  }
  // A deterministic denial is a failed operation even when the transport uses
  // HTTP 200. In particular, it must never trigger a graph resume.
  if (data && typeof data === 'object' && 'decision' in data && data.decision === 'deny') {
    const denial = data as { reason?: string; error?: { message?: string } };
    const conflictMessage = denial.reason === 'CONSTITUTION_CHANGED'
      ? 'The Constitution changed after this form or proposal was prepared. Review the latest policy version before retrying.'
      : denial.reason === 'RESOURCE_CHANGED'
        ? 'This record changed after this form or proposal was prepared. Review its latest revision before retrying.'
        : undefined;
    return { ok: false, status: response.ok ? 409 : response.status, data: { error: {
      code: denial.reason ?? 'GUARDRAIL_DENIED', message: conflictMessage ?? denial.error?.message ?? `Guardrail denied this request: ${(denial.reason ?? 'a required boundary was not met').replaceAll('_', ' ').toLowerCase()}.`, details: data,
    } } };
  }
  return { ok: response.ok, status: response.status, data, setCookie: response.headers.get('set-cookie') };
}
