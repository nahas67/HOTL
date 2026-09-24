export type ConnectorProvider = 'shopify' | 'woocommerce';
export type ConnectorCapability =
  | 'catalog.read' | 'variants.read' | 'inventory.read' | 'orders.read'
  | 'webhooks.verify' | 'catalog.write' | 'prices.write' | 'inventory.write'
  | 'orders.write' | 'refunds.write' | 'checkout.write';

export interface CapabilityManifest {
  readonly provider: ConnectorProvider;
  readonly name: string;
  readonly apiVersion: string;
  readonly implementation: 'read_only';
  readonly capabilities: readonly ConnectorCapability[];
  readonly requiredPermissions: Readonly<Record<string, readonly string[]>>;
  readonly limitations: readonly string[];
}

export interface Money { amount: string; currency: string }
export interface CanonicalProduct {
  provider: ConnectorProvider;
  externalId: string;
  title: string;
  handle: string;
  status: 'active' | 'draft' | 'archived' | 'private' | 'pending' | 'unknown';
  updatedAt: string | null;
  /** Variants have their own paginated endpoint; this object never implies completeness. */
  variants: 'separate';
}
export interface CanonicalVariant {
  provider: ConnectorProvider;
  externalId: string;
  productId: string;
  title: string;
  sku: string | null;
  price: Money | null;
  options: Array<{ name: string; value: string }>;
}
export interface CanonicalInventory {
  provider: ConnectorProvider;
  externalId: string;
  productId: string;
  variantId: string | null;
  scope: 'all_locations' | 'product' | 'variant';
  /** Null means unknown/untracked, never zero. May be negative for backorders. */
  available: number | null;
  tracked: boolean;
}
export interface RedactedCustomer { externalId: string | null; redacted: true }
export interface CanonicalOrder {
  provider: ConnectorProvider;
  externalId: string;
  number: string;
  status: string;
  fulfillmentStatus: string | null;
  total: Money;
  createdAt: string;
  updatedAt: string;
  customer: RedactedCustomer;
  /** Read line items through listOrderLines, including all pagination. */
  lines: 'separate';
}
export interface CanonicalOrderLine {
  provider: ConnectorProvider;
  externalId: string;
  productId: string | null;
  variantId: string | null;
  quantity: number;
  /** Product title only; no order notes, customer details, or custom metadata. */
  title: string;
}
export interface PageRequest { cursor?: string | null; limit?: number }
export interface Page<T> { items: T[]; nextCursor: string | null }
export interface ConnectorHealth {
  provider: ConnectorProvider;
  status: 'connected' | 'authentication_required' | 'permission_required' | 'rate_limited' | 'unavailable';
  checkedAt: string;
  /** A successful health probe proves only the listed capabilities at this time. */
  checkedCapabilities: ConnectorCapability[];
  error: { code: string; message: string; retryable: boolean } | null;
}
export interface ShopifyConfig {
  provider: 'shopify';
  shop: string;
  accessToken: string;
  apiVersion?: '2026-07';
}
export interface WooCommerceConfig {
  provider: 'woocommerce';
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  /** Merchant-configured product currency; orders use their own response currency. */
  currency: string;
  /** Exact hostnames from trusted server configuration, never user-submitted approval. */
  allowedHosts: readonly string[];
}
export type ConnectorConfig = ShopifyConfig | WooCommerceConfig;

export interface TransportRequest {
  url: URL;
  method: 'GET' | 'POST';
  headers: Readonly<Record<string, string>>;
  body?: string;
  signal: AbortSignal;
}
export interface TransportResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
}
/** Trusted server-side transport. Custom implementations must preserve SSRF/TLS/redirect protections. */
export type HttpTransport = (request: TransportRequest) => Promise<TransportResponse>;
export interface ConnectorOptions {
  transport?: HttpTransport;
  timeoutMs?: number;
  maxGetRetries?: number;
  /** Injectable only for deterministic retry tests. */
  sleep?: (milliseconds: number) => Promise<void>;
}
export interface CommerceConnector {
  readonly manifest: CapabilityManifest;
  health(): Promise<ConnectorHealth>;
  listProducts(page?: PageRequest): Promise<Page<CanonicalProduct>>;
  listVariants(request: PageRequest & { productId: string }): Promise<Page<CanonicalVariant>>;
  listInventory(page?: PageRequest & { productId?: string }): Promise<Page<CanonicalInventory>>;
  listOrders(page?: PageRequest): Promise<Page<CanonicalOrder>>;
  listOrderLines(request: PageRequest & { orderId: string }): Promise<Page<CanonicalOrderLine>>;
  requireCapability(capability: ConnectorCapability): void;
}
