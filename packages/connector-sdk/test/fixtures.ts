import { vi } from 'vitest';
import type { HttpTransport, ShopifyConfig, TransportResponse, WooCommerceConfig } from '../src/index.js';

// Deliberately synthetic credentials and customer data. No provider account is contacted.
export const shopifyConfig: ShopifyConfig = {
  provider: 'shopify', shop: 'hotl-fixture.myshopify.com', accessToken: 'fixture-shopify-secret',
};
export const wooConfig: WooCommerceConfig = {
  provider: 'woocommerce', baseUrl: 'https://shop.hotl-fixture.com/store',
  allowedHosts: ['shop.hotl-fixture.com'], currency: 'USD',
  consumerKey: 'ck_fixture', consumerSecret: 'cs_fixture',
};
export const json = (data: unknown, status = 200, headers: Record<string, string> = {}): TransportResponse => ({ status, headers, body: JSON.stringify(data) });
export function fixtureTransport(...responses: TransportResponse[]) {
  const transport = vi.fn<HttpTransport>();
  responses.forEach((response) => transport.mockResolvedValueOnce(response));
  return transport;
}
export const connection = (nodes: unknown[], cursor: string | null = null) => ({ nodes, pageInfo: { hasNextPage: cursor !== null, endCursor: cursor } });
export const shopifyProduct = (id = 1) => ({ id: `gid://shopify/Product/${id}`, title: `Product ${id}`, handle: `product-${id}`, status: 'ACTIVE', updatedAt: '2026-09-01T12:00:00Z', metafields: { private: 'not returned' } });
export const shopifyVariant = (id = 11) => ({ id: `gid://shopify/ProductVariant/${id}`, title: 'Small', sku: 'SKU-11', price: '24.90', selectedOptions: [{ name: 'Size', value: 'Small' }], product: { id: 'gid://shopify/Product/1' } });
export const shopifyOrder = (id = 21) => ({ id: `gid://shopify/Order/${id}`, name: `#${id}`, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-02T12:00:00Z', totalPriceSet: { shopMoney: { amount: '49.80', currencyCode: 'USD' } }, customer: { email: 'private@fixture.com', phone: 'private-phone' }, note: 'private-note' });
export const wooProduct = (id = 1, type = 'simple') => ({ id, name: `Product ${id}`, slug: `product-${id}`, status: 'publish', type, date_modified_gmt: '2026-09-01T12:00:00', sku: 'SKU-1', price: '24.90', attributes: [{ name: 'Color', options: ['Green'] }], manage_stock: true, stock_quantity: 7, meta_data: [{ key: 'private', value: 'private-data' }] });
export const wooVariation = (id = 11, stock: boolean | 'parent' = true) => ({ id, sku: `SKU-${id}`, price: '24.90', attributes: [{ name: 'Color', option: 'Green' }], manage_stock: stock, stock_quantity: stock === 'parent' ? null : 5 });
export const wooOrder = (id = 21) => ({ id, number: String(id), status: 'processing', currency: 'EUR', total: '49.80', date_created_gmt: '2026-09-01T12:00:00', date_modified_gmt: '2026-09-02T12:00:00', billing: { email: 'private@fixture.com' }, customer_note: 'private-note' });
