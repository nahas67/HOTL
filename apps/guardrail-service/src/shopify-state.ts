import { z } from 'zod';
import type { Actor } from '@hotl/schemas';
import type { EngineState } from './types.js';

const uuid = z.string().uuid();
const instant = z.string().datetime();
const ownerId = z.string().trim().min(1).max(200);
export const variantId = z.string().regex(/^gid:\/\/shopify\/ProductVariant\/[1-9]\d*$/);
const productId = z.string().regex(/^gid:\/\/shopify\/Product\/[1-9]\d*$/);
export const decimal = z.string().regex(/^(0|[1-9]\d{0,6})\.\d{2}$/);
const currency = z.string().regex(/^[A-Z]{3}$/);

export const priceRequest = z.object({ installationId: uuid, variantId,
  expectedRevision: z.number().int().positive(), expectedConstitutionVersion: z.number().int().positive(),
  price: decimal, reason: z.string().trim().min(10).max(1000), compensationFor: uuid.optional() }).strict();
export type PriceRequest = z.infer<typeof priceRequest>;
export const priceCancellation = z.object({ reason: z.string().trim().min(10).max(1000) }).strict();
export const priceInvestigation = z.object({
  expectedStatus: z.enum(['DISPATCHING', 'UNKNOWN', 'DRIFT']),
  expectedReconciliationAt: instant.nullable(),
  expectedReconciliationRevision: z.number().int().positive().nullable(),
  nextStep: z.enum(['INVESTIGATE_PROVIDER_LOGS', 'CONTACT_SHOPIFY_SUPPORT', 'KEEP_RESOURCE_BLOCKED']),
  note: z.string().trim().min(20).max(2000),
  evidence: z.array(z.object({ source: z.enum(['SHOPIFY_ADMIN', 'SHOPIFY_SUPPORT', 'INTERNAL_AUDIT']),
    reference: z.string().trim().min(8).max(300).regex(/^[^\r\n<>]+$/) }).strict()).max(5),
}).strict();
export type PriceInvestigationInput = z.infer<typeof priceInvestigation>;

export const priceObservationSchema = z.object({ variantId, productId, price: decimal, currency,
  providerRevision: instant, requestId: z.string().max(200).nullable(), developmentStore: z.boolean().optional() }).strict();
export type PriceObservation = z.infer<typeof priceObservationSchema>;
export const economicsSchema = z.object({ landedCost: z.number().finite().min(0).max(1_000_000).multipleOf(0.01),
  estimatedCac: z.number().finite().min(0).max(1_000_000).multipleOf(0.01), category: z.string().trim().min(1).max(100),
  countryOfOrigin: z.string().regex(/^[A-Z]{2}$/).optional(), evidence: z.string().trim().min(10).max(1000), validUntil: instant }).strict();
export type Economics = z.infer<typeof economicsSchema>;
export const merchantVariantSchema = priceObservationSchema.extend({ installationId: uuid, ownerId, title: z.string().max(500),
  sku: z.string().max(200).nullable(), revision: z.number().int().positive(), observedAt: instant, economics: economicsSchema.optional() }).strict();
export type MerchantVariant = z.infer<typeof merchantVariantSchema>;

const priceReceiptSchema = z.object({ provider: z.literal('shopify'), environment: z.literal('staging'), operationId: uuid,
  workspaceId: z.string().trim().min(1).max(200), actorId: ownerId,
  authorization: z.object({ constitutionVersion: z.number().int().positive(), resourceRevision: z.number().int().positive(),
    installationRevision: z.number().int().positive() }).strict(), dispatchedAt: instant, completedAt: instant,
  requestId: z.string().max(200).nullable(), before: priceObservationSchema, requestedPrice: decimal,
  after: priceObservationSchema.optional(), outcome: z.enum(['CONFIRMED', 'UNKNOWN', 'REJECTED', 'DRIFT']), errorCode: z.string().regex(/^[A-Z0-9_]{1,100}$/).optional() }).strict();
export type PriceReceipt = z.infer<typeof priceReceiptSchema>;
const priceReconciliationSchema = z.object({ at: instant, revision: z.number().int().positive().optional(),
  observation: priceObservationSchema, matchesTarget: z.boolean() }).strict();
const priceInvestigationRecordSchema = priceInvestigation.extend({ id: uuid, at: instant, reviewerId: ownerId,
  reconciliation: priceReconciliationSchema.nullable(), verifiedProviderEvidence: z.literal(false) }).strict();
export type PriceInvestigation = z.infer<typeof priceInvestigationRecordSchema>;
const priceOperationSchema = z.object({ id: uuid, ownerId, installationRevision: z.number().int().positive(), input: priceRequest,
  before: merchantVariantSchema, createdAt: instant,
  status: z.enum(['PENDING', 'DISPATCHING', 'DENIED', 'CONFIRMED', 'UNKNOWN', 'REJECTED', 'DRIFT', 'CANCELLED']),
  cancellation: z.object({ reason: z.string().trim().min(10).max(1000), at: instant, actorId: ownerId }).strict().optional(),
  claim: uuid.optional(), reason: z.string().max(1000).optional(), receipt: priceReceiptSchema.optional(),
  reconciliation: priceReconciliationSchema.optional(), investigations: z.array(priceInvestigationRecordSchema).max(100).optional() }).strict()
  .superRefine((operation, context) => {
    if (operation.before.installationId !== operation.input.installationId || operation.before.variantId !== operation.input.variantId || operation.before.ownerId !== operation.ownerId)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Operation resource ownership does not match its request.' });
    if (operation.status === 'DISPATCHING' && !operation.claim) context.addIssue({ code: z.ZodIssueCode.custom, path: ['claim'], message: 'Dispatching operation requires its durable claim.' });
    if (operation.status !== 'DISPATCHING' && operation.claim) context.addIssue({ code: z.ZodIssueCode.custom, path: ['claim'], message: 'Only a dispatching operation may retain a claim.' });
    if (operation.status === 'DENIED' && !operation.reason) context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Denied operation requires a reason.' });
    if (operation.status === 'CANCELLED' && (!operation.cancellation || operation.cancellation.actorId !== operation.ownerId))
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['cancellation'], message: 'Cancelled operation requires its owner cancellation record.' });
    if (operation.status !== 'CANCELLED' && operation.cancellation) context.addIssue({ code: z.ZodIssueCode.custom, path: ['cancellation'], message: 'Only a cancelled operation may retain a cancellation record.' });
    const receiptStatuses = ['CONFIRMED', 'UNKNOWN', 'REJECTED', 'DRIFT'];
    if (receiptStatuses.includes(operation.status) && !operation.receipt)
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt'], message: 'Provider-result status requires a receipt.' });
    if (operation.receipt) {
      const receipt = operation.receipt;
      if (receipt.operationId !== operation.id || receipt.actorId !== operation.ownerId || receipt.requestedPrice !== operation.input.price
        || receipt.before.variantId !== operation.input.variantId || receipt.before.productId !== operation.before.productId)
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt'], message: 'Receipt does not match its operation.' });
      if (operation.status !== receipt.outcome)
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt', 'outcome'], message: 'Receipt outcome does not match operation status.' });
      if (receipt.outcome === 'CONFIRMED' && (!receipt.after || receipt.after.variantId !== operation.input.variantId
        || receipt.after.productId !== operation.before.productId || receipt.after.currency !== receipt.before.currency
        || receipt.after.price !== operation.input.price))
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt', 'after'], message: 'A confirmed receipt requires matching provider read-back.' });
      if (receipt.outcome !== 'CONFIRMED' && receipt.after && receipt.after.variantId !== operation.input.variantId)
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt', 'after'], message: 'Receipt read-back identifies another variant.' });
    }
  });
export type PriceOperation = z.infer<typeof priceOperationSchema>;

const syncJobSchema = z.object({ id: uuid, installationId: uuid, ownerId, status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']),
  attempts: z.number().int().min(0).max(3), createdAt: instant, leaseUntil: instant.optional(), nextAttemptAt: instant.optional(),
  claim: uuid.optional(), errorCode: z.string().regex(/^[A-Z0-9_]{1,100}$/).optional(), completedAt: instant.optional() }).strict()
  .superRefine((job, context) => {
    if (job.status === 'RUNNING' && (!job.claim || !job.leaseUntil)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Running sync job requires claim and lease.' });
    if (job.status !== 'RUNNING' && job.claim) context.addIssue({ code: z.ZodIssueCode.custom, path: ['claim'], message: 'Only a running sync job may retain a claim.' });
    if (job.status === 'COMPLETED' && !job.completedAt) context.addIssue({ code: z.ZodIssueCode.custom, path: ['completedAt'], message: 'Completed sync job requires a completion time.' });
  });
export type SyncJob = z.infer<typeof syncJobSchema>;

export const webhookTopicSchema = z.enum(['products/create', 'products/update', 'products/delete', 'inventory_levels/update', 'orders/create', 'orders/updated', 'app/uninstalled']);
const inboxStatus = z.enum(['PENDING', 'RECONCILIATION_QUEUED', 'RECONCILING', 'RETRY_PENDING', 'RECONCILED', 'FAILED', 'DEAD_LETTER']);
const inboxEventSchema = z.object({ id: uuid, installationId: uuid, ownerId, digest: z.string().regex(/^[a-f0-9]{64}$/),
  deliveryId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), topic: webhookTopicSchema, receivedAt: instant, status: inboxStatus,
  attempts: z.number().int().min(0).max(100), syncJobId: uuid.optional(), queuedAt: instant.optional(), reconciliationStartedAt: instant.optional(),
  reconciledAt: instant.optional(), nextAttemptAt: instant.optional(), errorCode: z.string().regex(/^[A-Z0-9_]{1,100}$/).optional() }).strict()
  .superRefine((event, context) => {
    if (['RECONCILIATION_QUEUED', 'RECONCILING', 'RETRY_PENDING', 'RECONCILED'].includes(event.status) && (!event.syncJobId || !event.queuedAt))
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Queued webhook event requires a linked job and queue time.' });
    if (event.status === 'RECONCILING' && !event.reconciliationStartedAt)
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reconciliationStartedAt'], message: 'Reconciling event requires a start time.' });
    if (event.status === 'RECONCILED' && !event.reconciledAt)
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reconciledAt'], message: 'Reconciled event requires authoritative completion time.' });
    if (event.status === 'RETRY_PENDING' && !event.nextAttemptAt)
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['nextAttemptAt'], message: 'Retryable event requires a retry time.' });
  });
export type InboxEvent = z.infer<typeof inboxEventSchema>;
const legacyInboxEventSchema = z.object({ id: uuid, installationId: uuid, ownerId, digest: z.string().regex(/^[a-f0-9]{64}$/),
  deliveryId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), topic: webhookTopicSchema, receivedAt: instant,
  status: z.enum(['PENDING', 'COMPLETED', 'DEAD_LETTER']), attempts: z.number().int().min(0).max(100), errorCode: z.string().optional() }).strict();

const webhookSubscriptionAttemptSchema = z.object({ id: uuid, installationId: uuid, ownerId,
  installationRevision: z.number().int().positive(), topic: z.enum(['products/create', 'products/update', 'products/delete', 'inventory_levels/update']),
  uri: z.string().url(), status: z.enum(['DISPATCHING', 'CONFIRMED', 'UNKNOWN', 'REJECTED']), createdAt: instant,
  completedAt: instant.optional(), providerId: z.string().regex(/^gid:\/\/shopify\/WebhookSubscription\/[1-9]\d*$/).optional(),
  requestId: z.string().max(200).nullable().optional(), errorCode: z.string().regex(/^[A-Z0-9_]{1,100}$/).optional() }).strict();
export type WebhookSubscriptionAttempt = z.infer<typeof webhookSubscriptionAttemptSchema>;

const snapshotSchema = z.object({ installationId: uuid, ownerId, observedAt: instant,
  products: z.array(z.object({ provider: z.literal('shopify'), externalId: productId, title: z.string().max(500), handle: z.string().max(500),
    status: z.enum(['active', 'draft', 'archived', 'private', 'pending', 'unknown']), updatedAt: instant.nullable(), variants: z.literal('separate') }).strict()).max(100_000),
  inventory: z.array(z.object({ provider: z.literal('shopify'), externalId: z.string().min(1).max(200), productId,
    variantId: variantId.nullable(), scope: z.enum(['all_locations', 'product', 'variant']), available: z.number().int().finite().min(-1_000_000_000).max(1_000_000_000).nullable(), tracked: z.boolean() }).strict()).max(500_000),
  orders: z.array(z.object({ provider: z.literal('shopify'), externalId: z.string().min(1).max(200), number: z.string().max(200), status: z.string().min(1).max(100),
    fulfillmentStatus: z.string().max(100).nullable(), total: z.object({ amount: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/), currency }),
    createdAt: instant, updatedAt: instant, customer: z.object({ externalId: z.string().max(200).nullable(), redacted: z.literal(true) }).strict(), lines: z.literal('separate') }).strict()).max(100_000),
  locations: z.array(z.object({ id: z.string().min(1).max(200), name: z.string().max(500), isActive: z.boolean() }).strict()).max(10_000) }).strict();
export const shopifySnapshotSchema = snapshotSchema;

const commerceStateSchema = z.object({ version: z.literal(1), variants: z.array(merchantVariantSchema).max(500_000), snapshots: z.array(snapshotSchema).max(1000),
  jobs: z.array(syncJobSchema).max(100_000), inbox: z.array(inboxEventSchema).max(100_000), operations: z.array(priceOperationSchema).max(100_000),
  subscriptionAttempts: z.array(webhookSubscriptionAttemptSchema).max(100_000).optional() }).strict();
const legacyCommerceStateSchema = z.object({ version: z.literal(1), variants: z.array(merchantVariantSchema).max(500_000), snapshots: z.array(snapshotSchema).max(1000),
  jobs: z.array(syncJobSchema).max(100_000), inbox: z.array(legacyInboxEventSchema).max(100_000), operations: z.array(priceOperationSchema).max(100_000),
  subscriptionAttempts: z.array(webhookSubscriptionAttemptSchema).max(100_000).optional() }).strict();
export type ShopifyCommerceState = z.infer<typeof commerceStateSchema>;

/** Called for every durable load and before every durable commit; it never repairs or overwrites bad records. */
export function validateShopifyCommerceState(value: unknown): boolean {
  const current = commerceStateSchema.safeParse(value);
  const legacy = current.success ? null : legacyCommerceStateSchema.safeParse(value);
  if (!current.success && !legacy?.success) return false;
  const data = current.success ? current.data : legacy!.data as ShopifyCommerceState;
  const unique = <T>(items: T[], key: (item: T) => string) => new Set(items.map(key)).size === items.length;
  if (!unique(data.variants, item => `${item.installationId}:${item.variantId}`)
    || !unique(data.jobs, item => item.id)
    || !unique(data.operations, item => item.id)
    || !unique(data.inbox, item => item.id)
    || !unique(data.inbox, item => `${item.installationId}:${item.deliveryId}`)
    || !unique(data.inbox, item => `${item.installationId}:${item.digest}`)
    || !unique(data.subscriptionAttempts ?? [], item => item.id)) return false;
  const jobs = new Map(data.jobs.map(job => [job.id, job]));
  return data.inbox.every(event => {
    if (!event.syncJobId) return true;
    const job = jobs.get(event.syncJobId);
    if (!job || job.installationId !== event.installationId || job.ownerId !== event.ownerId) return false;
    return event.status !== 'RECONCILED' || job.status === 'COMPLETED';
  });
}

/** Explicit v1 inbox migration: historical COMPLETED meant only “a sync was queued.” Requeue it instead of claiming reconciliation. */
function migrateLegacyInbox(data: ShopifyCommerceState) {
  for (const event of data.inbox as unknown as Array<Record<string, unknown>>) {
    if (event.status === 'COMPLETED') {
      event.status = 'PENDING';
      delete event.syncJobId; delete event.queuedAt; delete event.reconciliationStartedAt; delete event.reconciledAt;
    }
  }
}

export function shopifyData(state: EngineState): ShopifyCommerceState {
  state.extensions ??= {};
  if (state.extensions.shopifyCommerce === undefined) state.extensions.shopifyCommerce = { version: 1, variants: [], snapshots: [], jobs: [], inbox: [], operations: [] };
  const raw = state.extensions.shopifyCommerce;
  if (!validateShopifyCommerceState(raw)) throw new Error('SHOPIFY_STATE_INVALID');
  const data = raw as ShopifyCommerceState;
  migrateLegacyInbox(data);
  data.subscriptionAttempts ??= [];
  return data;
}
export function ownVariant(state: EngineState, input: Pick<PriceRequest, 'installationId' | 'variantId'>, actor: Actor) {
  return shopifyData(state).variants.find(item => item.installationId === input.installationId && item.variantId === input.variantId && item.ownerId === actor.id);
}
export function sameObservation(a: PriceObservation, b: PriceObservation) {
  return a.variantId === b.variantId && a.productId === b.productId && a.price === b.price && a.currency === b.currency && a.providerRevision === b.providerRevision;
}
