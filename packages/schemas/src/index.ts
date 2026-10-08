import { z } from "zod";
export { ZodError } from "zod";

export const hotlModeSchema = z.enum(["simulation", "live"]);

// Public amounts are USD decimals. Deterministic calculations always use minor units.
/** Per-transaction money domain: the validated maximum for any single requested amount. */
export const moneySchema = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0000001,
    "Use at most two decimal places",
  );
/**
 * Lifetime aggregate domain for monotonic ledger totals (workspace revenue, per-product
 * revenue). Deliberately far wider than the per-transaction ceiling: these totals grow
 * without bound over the life of a workspace, so bounding them by the domain of a single
 * request would make a legitimately long-lived ledger unusable. A breach here is a real
 * fault and is asserted explicitly instead of surfacing inside an arithmetic helper.
 */
export const aggregateMoneySchema = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000_000_000);
export const positiveMoneySchema = moneySchema.refine(
  (value) => value > 0,
  "Amount must be positive",
);
export const currencySchema = z.literal("USD");
export const actionContextShape = {
  expectedConstitutionVersion: z.number().int().positive().optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  expectedOrderRevision: z.number().int().nonnegative().optional(),
};
export const agentIdSchema = z.enum([
  "sourcing_agent",
  "marketing_agent",
  "order_agent",
  "support_agent",
  "master_orchestrator",
]);
export const spendCheckSchema = z
  .object({
    agentId: agentIdSchema.default("marketing_agent"),
    campaignId: z.string().min(1).max(120),
    requestedAmount: positiveMoneySchema,
    currency: currencySchema.default("USD"),
    runId: z.string().max(120).optional(),
    ...actionContextShape,
  })
  .strict();
export const spendCommitSchema = z
  .object({
    reservationId: z.string().min(1),
    providerReference: z.string().max(150).optional(),
    ...actionContextShape,
  })
  .strict();
export const marginCheckSchema = z
  .object({
    sku: z.string().min(1).max(100),
    sellingPrice: positiveMoneySchema,
    landedCost: moneySchema,
    estimatedCac: moneySchema,
    currency: currencySchema.default("USD"),
  })
  .strict();
export const refundSchema = z
  .object({
    orderId: z.string().min(1).max(120),
    amount: positiveMoneySchema,
    currency: currencySchema.default("USD"),
    reasonCode: z.string().min(1).max(500),
    requestedBy: agentIdSchema.default("support_agent"),
    runId: z.string().max(120).optional(),
    ...actionContextShape,
  })
  .strict();
export const resolveSchema = z
  .object({
    decision: z.enum(["approve", "reject", "modify"]),
    modifiedPayload: z.record(z.unknown()).nullable().optional(),
    note: z.string().max(2000).default(""),
    resolvedBy: z.string().max(120).optional(),
    reviewLegacy: z.boolean().optional(),
    ...actionContextShape,
  })
  .strict();
export const configSchema = z
  .object({
    dailyAdSpendCeiling: positiveMoneySchema,
    marginFloor: z
      .number()
      .min(0.4)
      .max(0.99)
      .refine(
        (v) => Math.abs(v * 10000 - Math.round(v * 10000)) < 0.0000001,
        "Use at most four decimal places",
      ),
    autoRefundThreshold: moneySchema.refine(value => value <= 25, 'Automatic refunds cannot exceed $25'),
    currency: currencySchema,
  })
  .strict();
export const configPatchSchema = configSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide a config field");
export const pauseSchema = z
  .object({ reason: z.string().max(1000).optional() })
  .strict();
export const listingSchema = z
  .object({
    productId: z.string().min(1),
    sellingPrice: positiveMoneySchema.optional(),
    runId: z.string().max(120).optional(),
    ...actionContextShape,
  })
  .strict();
export const campaignSchema = spendCheckSchema;
export const supplierOrderSchema = z
  .object({
    productId: z.string().min(1),
    quantity: z.number().int().min(1).max(100),
    orderId: z.string().min(1),
    runId: z.string().optional(),
    ...actionContextShape,
  })
  .strict();
export const checkoutSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1),
            quantity: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    customer: z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.string().email().max(254),
      })
      .strict(),
    destinationCountry: z.string().regex(/^[A-Z]{2}$/).optional(),
  })
  .strict();
export const commerceEventSchema = z
  .object({
    eventId: z.string().min(1).max(150),
    type: z.enum([
      "payment.confirmed",
      "payment.failed",
      "fulfillment.updated",
    ]),
    orderId: z.string().min(1),
    tracking: z.string().max(150).optional(),
  })
  .strict();
export const runEventSchema = z
  .object({
    runId: z.string().min(1).max(120),
    cycle: z.enum(["daily", "weekly", "monthly"]),
    status: z.enum(["running", "interrupted", "completed", "halted", "failed"]),
    agentId: agentIdSchema.optional(),
    summary: z.string().max(1000).optional(),
  })
  .strict();
/**
 * Pure minor-unit conversion. This MUST NOT validate: it also converts persisted lifetime
 * aggregates whose domain is deliberately wider than any single request's, so parsing here
 * turned a long-lived ledger into an unhandled exception mid-transaction. The two-decimal
 * guarantee is owned by the request schema that validates each incoming amount
 * (`moneySchema`/`positiveMoneySchema`); callers holding a lifetime total assert
 * `aggregateMoneySchema` explicitly at the point of accumulation.
 */
export const toMinor = (amount: number): number => Math.round(amount * 100);
export const fromMinor = (amount: number): number => amount / 100;
/**
 * Explicit lifetime-total assertion. Returns the value unchanged when it is in domain and
 * raises a named fault otherwise, so a ledger total can never silently drift out of range.
 */
export const assertAggregateMoney = (amount: number, label: string): number => {
  const parsed = aggregateMoneySchema.safeParse(amount);
  if (!parsed.success) throw new AggregateDomainError(label, amount);
  return parsed.data;
};
export class AggregateDomainError extends Error {
  constructor(label: string, amount: number) {
    super(`Ledger aggregate "${label}" is outside the lifetime money domain: ${amount}`);
    this.name = "AggregateDomainError";
  }
}
export type GuardrailConfig = z.infer<typeof configSchema>;
export type Actor = { type: "agent" | "owner" | "system"; id: string };
export type AuditEntry = {
  id: string;
  actorType: Actor["type"];
  actorId: string;
  eventType: string;
  payload: Record<string, unknown>;
  prevHash: string | null;
  hash: string;
  createdAt: string;
  summary: string;
};
export type Product = {
  revision?: number;
  countryOfOrigin?: string;
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  landedCost: number;
  estimatedCac: number;
  margin: number;
  inventory: number;
  status: "active" | "draft" | "held";
  image: string;
  color: string;
  orders: number;
  revenue: number;
  description: string;
};
export type CommerceOrder = {
  revision?: number;
  id: string;
  customer: { name: string; email: string };
  items: { productId: string; name: string; quantity: number; price: number }[];
  total: number;
  refunded: number;
  status: string;
  createdAt: string;
  tracking: string | null;
};
export type OwnerInterrupt = {
  id: string;
  runId: string;
  threadId: string;
  category: "spend" | "margin" | "refund_escrow" | "anomaly" | "other";
  title: string;
  summary: string;
  agentName: string;
  priority: "high" | "medium" | "low";
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "modified" | "expired";
  createdAt: string;
  expiresAt: string | null;
  requiredAction: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  execution?: Record<string, unknown>;
};
export * from './constitution';
