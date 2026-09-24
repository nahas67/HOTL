import { ConnectorError } from './errors.js';
import { connectorManifests } from './manifests.js';
import { createHttpClient, shopifyEndpoint } from './transport.js';
import { checkHealth, requireCapability, validateSecret } from './common.js';
import * as v from './validation.js';
import type { CanonicalInventory, CanonicalOrder, CanonicalOrderLine, CanonicalProduct, CanonicalVariant, CommerceConnector, ConnectorOptions, ShopifyConfig } from './types.js';

const pageInfo = 'pageInfo { hasNextPage endCursor }';
const productFields = 'id title handle status updatedAt';
const variantFields = 'id title sku price selectedOptions { name value } product { id }';
const inventoryFields = 'id inventoryQuantity product { id } inventoryItem { id tracked }';
const orderFields = 'id name displayFinancialStatus displayFulfillmentStatus createdAt updatedAt totalPriceSet { shopMoney { amount currencyCode } }';
const lineFields = 'id title quantity product { id } variant { id }';

function product(value: unknown): CanonicalProduct {
  const item = v.record(value);
  const status = v.string(item.status);
  if (!['ACTIVE', 'DRAFT', 'ARCHIVED', 'UNLISTED'].includes(status)) v.invalid();
  return { provider: 'shopify', externalId: v.nonempty(item.id), title: v.string(item.title), handle: v.string(item.handle),
    status: status === 'ACTIVE' ? 'active' : status === 'DRAFT' ? 'draft' : status === 'ARCHIVED' ? 'archived' : 'private', updatedAt: v.date(item.updatedAt), variants: 'separate' };
}
function variant(value: unknown, currency: unknown): CanonicalVariant {
  const item = v.record(value);
  return { provider: 'shopify', externalId: v.nonempty(item.id), productId: v.nonempty(v.record(item.product).id),
    title: v.string(item.title), sku: v.nullableString(item.sku), price: v.money(item.price, currency),
    options: v.array(item.selectedOptions).map((raw) => { const option = v.record(raw); return { name: v.string(option.name), value: v.string(option.value) }; }) };
}
function inventory(value: unknown): CanonicalInventory {
  const item = v.record(value);
  const stock = v.record(item.inventoryItem);
  const tracked = v.bool(stock.tracked);
  return { provider: 'shopify', externalId: v.nonempty(stock.id), productId: v.nonempty(v.record(item.product).id), variantId: v.nonempty(item.id),
    scope: 'all_locations', tracked, available: !tracked || item.inventoryQuantity == null ? null : v.integer(item.inventoryQuantity) };
}
function order(value: unknown): CanonicalOrder {
  const item = v.record(value);
  const total = v.record(v.record(item.totalPriceSet).shopMoney);
  return { provider: 'shopify', externalId: v.nonempty(item.id), number: v.string(item.name), status: v.nullableString(item.displayFinancialStatus) ?? 'UNKNOWN',
    fulfillmentStatus: v.nullableString(item.displayFulfillmentStatus), total: v.money(total.amount, total.currencyCode),
    createdAt: v.date(item.createdAt), updatedAt: v.date(item.updatedAt), customer: { externalId: null, redacted: true }, lines: 'separate' };
}
function line(value: unknown): CanonicalOrderLine {
  const item = v.record(value);
  const quantity = v.integer(item.quantity); if (quantity < 0) v.invalid();
  return { provider: 'shopify', externalId: v.nonempty(item.id), title: v.string(item.title), quantity,
    productId: item.product == null ? null : v.nonempty(v.record(item.product).id), variantId: item.variant == null ? null : v.nonempty(v.record(item.variant).id) };
}

export function createShopifyConnector(config: ShopifyConfig, options: ConnectorOptions = {}): CommerceConnector {
  if (config.apiVersion !== undefined && config.apiVersion !== '2026-07') throw new ConnectorError('INVALID_CONFIGURATION');
  const endpoint = shopifyEndpoint(config.shop);
  const token = validateSecret(config.accessToken);
  const http = createHttpClient(options);
  const manifest = connectorManifests.shopify;
  const query = async (document: string, variables: Record<string, unknown>) => {
    const response = await http({ url: endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify({ query: document, variables }) });
    if (response.headers['x-shopify-api-version'] && response.headers['x-shopify-api-version'] !== manifest.apiVersion) throw new ConnectorError('API_VERSION_MISMATCH');
    const body = v.record(response.data);
    if (body.errors !== undefined) {
      const errors = v.array(body.errors);
      if (errors.length) {
        const codes = errors.map((raw) => { const error = v.record(raw); return error.extensions == null ? null : v.record(error.extensions).code; });
        if (codes.includes('THROTTLED')) throw new ConnectorError('RATE_LIMITED');
        if (codes.includes('ACCESS_DENIED')) throw new ConnectorError('AUTHORIZATION_FAILED');
        throw new ConnectorError('UPSTREAM_REJECTED');
      }
    }
    return v.record(body.data);
  };
  const connector: CommerceConnector = {
    manifest,
    health: () => checkHealth(manifest, () => connector.listProducts({ limit: 1 })),
    requireCapability: (capability) => requireCapability(manifest, capability),
    async listProducts(request) {
      const page = v.pagination(request);
      const data = await query(`query Products($first: Int!, $after: String) { products(first: $first, after: $after) { nodes { ${productFields} } ${pageInfo} } }`, { first: page.limit, after: page.cursor });
      return v.graphPage(data.products, product, page.cursor, page.limit);
    },
    async listVariants(request) {
      const page = v.pagination(request);
      const data = await query(`query Variants($id: ID!, $first: Int!, $after: String) { shop { currencyCode } product(id: $id) { variants(first: $first, after: $after) { nodes { ${variantFields} } ${pageInfo} } } }`, { id: v.shopifyId(request.productId, 'Product'), first: page.limit, after: page.cursor });
      if (data.product === null) throw new ConnectorError('RESOURCE_NOT_FOUND');
      const currency = v.currency(v.record(data.shop).currencyCode);
      return v.graphPage(v.record(data.product).variants, (value) => variant(value, currency), page.cursor, page.limit);
    },
    async listInventory(request = {}) {
      const page = v.pagination(request);
      if (request.productId) {
        const data = await query(`query ProductInventory($id: ID!, $first: Int!, $after: String) { product(id: $id) { variants(first: $first, after: $after) { nodes { ${inventoryFields} } ${pageInfo} } } }`, { id: v.shopifyId(request.productId, 'Product'), first: page.limit, after: page.cursor });
        if (data.product === null) throw new ConnectorError('RESOURCE_NOT_FOUND');
        return v.graphPage(v.record(data.product).variants, inventory, page.cursor, page.limit);
      }
      const data = await query(`query Inventory($first: Int!, $after: String) { productVariants(first: $first, after: $after) { nodes { ${inventoryFields} } ${pageInfo} } }`, { first: page.limit, after: page.cursor });
      return v.graphPage(data.productVariants, inventory, page.cursor, page.limit);
    },
    async listOrders(request) {
      const page = v.pagination(request);
      const data = await query(`query Orders($first: Int!, $after: String) { orders(first: $first, after: $after) { nodes { ${orderFields} } ${pageInfo} } }`, { first: page.limit, after: page.cursor });
      return v.graphPage(data.orders, order, page.cursor, page.limit);
    },
    async listOrderLines(request) {
      const page = v.pagination(request);
      const data = await query(`query OrderLines($id: ID!, $first: Int!, $after: String) { order(id: $id) { lineItems(first: $first, after: $after) { nodes { ${lineFields} } ${pageInfo} } } }`, { id: v.shopifyId(request.orderId, 'Order'), first: page.limit, after: page.cursor });
      if (data.order === null) throw new ConnectorError('RESOURCE_NOT_FOUND');
      return v.graphPage(v.record(data.order).lineItems, line, page.cursor, page.limit);
    },
  };
  return Object.freeze(connector);
}
