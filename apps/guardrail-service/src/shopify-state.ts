import { z } from 'zod';
import type { Actor } from '@hotl/schemas';
import type { EngineState } from './types.js';

export const variantId = z.string().regex(/^gid:\/\/shopify\/ProductVariant\/[1-9]\d*$/);
export const decimal = z.string().regex(/^(0|[1-9]\d{0,6})\.\d{2}$/);
export const priceRequest = z.object({ installationId: z.string().uuid(), variantId,
  expectedRevision: z.number().int().positive(), expectedConstitutionVersion: z.number().int().positive(),
  price: decimal, reason: z.string().trim().min(10).max(1000), compensationFor: z.string().uuid().optional() }).strict();
export type PriceRequest = z.infer<typeof priceRequest>;
export const priceCancellation = z.object({ reason: z.string().trim().min(10).max(1000) }).strict();
export const priceInvestigation = z.object({
  expectedStatus: z.enum(['DISPATCHING', 'UNKNOWN', 'DRIFT']),
  expectedReconciliationAt: z.string().datetime().nullable(),
  expectedReconciliationRevision: z.number().int().positive().nullable(),
  nextStep: z.enum(['INVESTIGATE_PROVIDER_LOGS', 'CONTACT_SHOPIFY_SUPPORT', 'KEEP_RESOURCE_BLOCKED']),
  note: z.string().trim().min(20).max(2000),
  evidence: z.array(z.object({ source: z.enum(['SHOPIFY_ADMIN', 'SHOPIFY_SUPPORT', 'INTERNAL_AUDIT']),
    reference: z.string().trim().min(8).max(300).regex(/^[^\r\n<>]+$/) }).strict()).max(5),
}).strict();
export type PriceInvestigationInput = z.infer<typeof priceInvestigation>;
export type PriceInvestigation = PriceInvestigationInput & { id: string; at: string; reviewerId: string;
  reconciliation: PriceOperation['reconciliation'] | null; verifiedProviderEvidence: false };
export type PriceObservation = { variantId: string; productId: string; price: string; currency: string; providerRevision: string; requestId: string | null; developmentStore?: boolean };
export type Economics = { landedCost: number; estimatedCac: number; category: string; countryOfOrigin?: string; evidence: string; validUntil: string };
export type MerchantVariant = PriceObservation & { installationId: string; ownerId: string; title: string; sku: string | null; revision: number; observedAt: string; economics?: Economics };
export type PriceOperation = { id: string; ownerId: string; installationRevision: number; input: PriceRequest; before: MerchantVariant; createdAt: string;
  status: 'PENDING' | 'DISPATCHING' | 'DENIED' | 'CONFIRMED' | 'UNKNOWN' | 'REJECTED' | 'DRIFT' | 'CANCELLED';
  cancellation?: { reason: string; at: string; actorId: string };
  claim?: string; reason?: string; receipt?: PriceReceipt; reconciliation?: { at: string; revision?: number; observation: PriceObservation; matchesTarget: boolean };
  investigations?: PriceInvestigation[] };
export type PriceReceipt = { provider: 'shopify'; environment: 'staging'; operationId: string; workspaceId: string; actorId: string;
  authorization: { constitutionVersion: number; resourceRevision: number; installationRevision: number }; dispatchedAt: string; completedAt: string;
  requestId: string | null; before: PriceObservation; requestedPrice: string; after?: PriceObservation; outcome: 'CONFIRMED' | 'UNKNOWN' | 'REJECTED' | 'DRIFT'; errorCode?: string };
export type SyncJob = { id: string; installationId: string; ownerId: string; status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  attempts: number; createdAt: string; leaseUntil?: string; nextAttemptAt?: string; claim?: string; errorCode?: string; completedAt?: string };
export type InboxEvent = { id: string; installationId: string; ownerId: string; digest: string; deliveryId: string; topic: string;
  receivedAt: string; status: 'PENDING' | 'COMPLETED' | 'DEAD_LETTER'; attempts: number; errorCode?: string };
export type WebhookSubscriptionAttempt = { id: string; installationId: string; ownerId: string; installationRevision: number;
  topic: string; uri: string; status: 'DISPATCHING' | 'CONFIRMED' | 'UNKNOWN' | 'REJECTED'; createdAt: string;
  completedAt?: string; providerId?: string; requestId?: string | null; errorCode?: string };
const webhookSubscriptionAttempt = z.object({ id: z.string().uuid(), installationId: z.string().uuid(), ownerId: z.string().min(1),
  installationRevision: z.number().int().positive(), topic: z.string().min(1), uri: z.string().url(),
  status: z.enum(['DISPATCHING', 'CONFIRMED', 'UNKNOWN', 'REJECTED']), createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(), providerId: z.string().optional(), requestId: z.string().nullable().optional(), errorCode: z.string().optional() }).strict();
export type ShopifyCommerceState = { version: 1; variants: MerchantVariant[]; snapshots: { installationId: string; ownerId: string; observedAt: string; products: unknown[]; inventory: unknown[]; orders: unknown[]; locations: unknown[] }[];
  jobs: SyncJob[]; inbox: InboxEvent[]; operations: PriceOperation[]; subscriptionAttempts?: WebhookSubscriptionAttempt[] };

export function shopifyData(state: EngineState): ShopifyCommerceState {
  state.extensions ??= {};
  if (state.extensions.shopifyCommerce === undefined) state.extensions.shopifyCommerce = { version: 1, variants: [], snapshots: [], jobs: [], inbox: [], operations: [] };
  const data = state.extensions.shopifyCommerce as ShopifyCommerceState;
  if (data.version !== 1 || !['variants', 'snapshots', 'jobs', 'inbox', 'operations'].every(key => Array.isArray(data[key as keyof ShopifyCommerceState])) || (data.subscriptionAttempts !== undefined && !Array.isArray(data.subscriptionAttempts))) throw new Error('SHOPIFY_STATE_INVALID');
  data.subscriptionAttempts ??= [];
  if (!z.array(webhookSubscriptionAttempt).safeParse(data.subscriptionAttempts).success) throw new Error('SHOPIFY_STATE_INVALID');
  return data;
}
export function ownVariant(state: EngineState, input: Pick<PriceRequest, 'installationId' | 'variantId'>, actor: Actor) {
  return shopifyData(state).variants.find(item => item.installationId === input.installationId && item.variantId === input.variantId && item.ownerId === actor.id);
}
export function sameObservation(a: PriceObservation, b: PriceObservation) {
  return a.variantId === b.variantId && a.productId === b.productId && a.price === b.price && a.currency === b.currency && a.providerRevision === b.providerRevision;
}
