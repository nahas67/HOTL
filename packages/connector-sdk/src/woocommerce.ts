import { ConnectorError } from './errors.js';
import { connectorManifests } from './manifests.js';
import { createHttpClient, wooBaseUrl } from './transport.js';
import { checkHealth, requireCapability, validateSecret } from './common.js';
import * as v from './validation.js';
import type { CanonicalInventory, CanonicalOrder, CanonicalOrderLine, CanonicalProduct, CanonicalVariant, CommerceConnector, ConnectorOptions, Page, PageRequest, WooCommerceConfig } from './types.js';

const productFields = 'id,name,slug,status,type,date_modified_gmt,sku,price,attributes,manage_stock,stock_quantity';
const variationFields = 'id,sku,price,attributes,manage_stock,stock_quantity';
const orderFields = 'id,number,status,currency,total,date_created_gmt,date_modified_gmt';
function product(value: unknown): CanonicalProduct {
  const item = v.record(value);
  const status = v.string(item.status);
  return { provider: 'woocommerce', externalId: v.id(item.id), title: v.string(item.name), handle: v.string(item.slug),
    status: status === 'publish' ? 'active' : status === 'draft' ? 'draft' : status === 'private' ? 'private' : status === 'pending' ? 'pending' : 'unknown',
    updatedAt: item.date_modified_gmt == null ? null : v.date(item.date_modified_gmt), variants: 'separate' };
}
function variant(value: unknown, productId: string, currency: string, simple = false): CanonicalVariant {
  const item = v.record(value);
  const attributes = v.array(item.attributes).map((raw) => {
    const attr = v.record(raw);
    return { name: v.string(attr.name), value: simple ? v.array(attr.options).map(v.string).join(', ') : v.string(attr.option) };
  });
  return { provider: 'woocommerce', externalId: v.id(item.id), productId, title: simple ? v.string(item.name) : attributes.map((attr) => attr.value).join(' / '),
    sku: v.nullableString(item.sku) || null, price: item.price === '' ? null : v.money(item.price, currency), options: attributes };
}
function inventory(value: unknown, productId?: string): CanonicalInventory {
  const item = v.record(value);
  const externalId = v.id(item.id);
  // Woo variations may inherit stock management from their parent. Report it as unknown here.
  const tracked = item.manage_stock === 'parent' ? false : v.bool(item.manage_stock);
  return { provider: 'woocommerce', externalId, productId: productId ?? externalId,
    variantId: productId ? externalId : null, scope: productId ? 'variant' : 'product', tracked,
    available: !tracked || item.stock_quantity == null ? null : v.integer(item.stock_quantity) };
}
function order(value: unknown): CanonicalOrder {
  const item = v.record(value);
  return { provider: 'woocommerce', externalId: v.id(item.id), number: v.string(item.number), status: v.string(item.status), fulfillmentStatus: null,
    total: v.money(item.total, item.currency), createdAt: v.date(item.date_created_gmt), updatedAt: v.date(item.date_modified_gmt), customer: { externalId: null, redacted: true }, lines: 'separate' };
}
function line(value: unknown): CanonicalOrderLine {
  const item = v.record(value);
  const quantity = v.integer(item.quantity); if (quantity < 0) v.invalid();
  const productId = v.id(item.product_id); const variationId = v.id(item.variation_id);
  return { provider: 'woocommerce', externalId: v.id(item.id), productId: productId === '0' ? null : productId,
    variantId: variationId === '0' ? null : variationId, quantity, title: v.string(item.name) };
}
function pageNumber(cursor: string | null): number {
  if (cursor === null) return 1;
  if (!/^[1-9][0-9]{0,6}$/.test(cursor)) throw new ConnectorError('INVALID_REQUEST');
  return Number(cursor);
}

export function createWooCommerceConnector(config: WooCommerceConfig, options: ConnectorOptions = {}): CommerceConnector {
  const base = wooBaseUrl(config.baseUrl, config.allowedHosts);
  const key = validateSecret(config.consumerKey); const secret = validateSecret(config.consumerSecret);
  if (key.includes(':')) throw new ConnectorError('INVALID_CONFIGURATION');
  let currency: string;
  try { currency = v.currency(config.currency); } catch { throw new ConnectorError('INVALID_CONFIGURATION'); }
  const authorization = `Basic ${Buffer.from(`${key}:${secret}`, 'utf8').toString('base64')}`;
  const http = createHttpClient(options);
  const manifest = connectorManifests.woocommerce;
  const get = async (path: string, query: Record<string, string> = {}) => {
    const url = new URL(path, base);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    return http({ url, method: 'GET', headers: { Authorization: authorization, Accept: 'application/json' } });
  };
  const list = async <T>(path: string, fields: string, map: (value: unknown) => T, request?: PageRequest): Promise<Page<T>> => {
    const page = v.pagination(request); const current = pageNumber(page.cursor);
    const response = await get(path, { _fields: fields, per_page: String(page.limit), page: String(current) });
    const rawTotal = response.headers['x-wp-totalpages'];
    if (!rawTotal || !/^\d{1,7}$/.test(rawTotal)) v.invalid();
    const total = Number(rawTotal);
    const items = v.array(response.data).map(map);
    if (items.length > page.limit || (current < total && items.length === 0)) v.invalid();
    return { items, nextCursor: current < total ? String(current + 1) : null };
  };
  const connector: CommerceConnector = {
    manifest,
    health: () => checkHealth(manifest, () => connector.listProducts({ limit: 1 })),
    requireCapability: (capability) => requireCapability(manifest, capability),
    listProducts: (request) => list('products', productFields, product, request),
    async listVariants(request) {
      const productId = v.wooId(request.productId); const page = v.pagination(request);
      const current = pageNumber(page.cursor);
      const response = await get(`products/${productId}`, { _fields: productFields });
      const item = v.record(response.data);
      if (v.id(item.id) !== productId) v.invalid();
      if (v.string(item.type) === 'variable') return list(`products/${productId}/variations`, variationFields, (value) => variant(value, productId, currency), request);
      return { items: current === 1 ? [variant(item, productId, currency, true)] : [], nextCursor: null };
    },
    async listInventory(request = {}) {
      if (!request.productId) return list('products', productFields, (value) => inventory(value), request);
      const productId = v.wooId(request.productId); const page = v.pagination(request);
      const current = pageNumber(page.cursor);
      const response = await get(`products/${productId}`, { _fields: productFields });
      const item = v.record(response.data);
      if (v.id(item.id) !== productId) v.invalid();
      if (v.string(item.type) === 'variable') return list(`products/${productId}/variations`, variationFields, (value) => inventory(value, productId), request);
      return { items: current === 1 ? [inventory(item)] : [], nextCursor: null };
    },
    listOrders: (request) => list('orders', orderFields, order, request),
    async listOrderLines(request) {
      const orderId = v.wooId(request.orderId); const page = v.pagination(request);
      const current = pageNumber(page.cursor);
      const response = await get(`orders/${orderId}`, { _fields: 'id,line_items' });
      const item = v.record(response.data);
      if (v.id(item.id) !== orderId) v.invalid();
      const all = v.array(item.line_items).map(line);
      const offset = (current - 1) * page.limit;
      return { items: all.slice(offset, offset + page.limit), nextCursor: offset + page.limit < all.length ? String(current + 1) : null };
    },
  };
  return Object.freeze(connector);
}
