import { describe, expect, it, vi } from 'vitest';
import { ConnectorError, connectorManifests, createConnector } from '../src/index.js';
import type { ConnectorCapability } from '../src/index.js';
import { connection, fixtureTransport, json, shopifyConfig, shopifyOrder, shopifyProduct, shopifyVariant, wooConfig, wooOrder, wooProduct, wooVariation } from './fixtures.js';

describe('Shopify read connector', () => {
  it('uses versioned authenticated queries and advances opaque product cursors without exposing metadata', async () => {
    const transport = fixtureTransport(json({ data: { products: connection([shopifyProduct()], 'page-two') } }), json({ data: { products: connection([shopifyProduct(2)]) } }));
    const connector = createConnector(shopifyConfig, { transport });
    const first = await connector.listProducts({ limit: 1 });
    const second = await connector.listProducts({ limit: 1, cursor: first.nextCursor });
    expect(second.items[0].externalId).toBe('gid://shopify/Product/2');
    expect(second.nextCursor).toBeNull();
    expect(first.items[0]).not.toHaveProperty('metafields');
    const sent = transport.mock.calls[1][0];
    expect(sent.url.href).toBe('https://hotl-fixture.myshopify.com/admin/api/2026-07/graphql.json');
    expect(sent.method).toBe('POST');
    expect(sent.headers['X-Shopify-Access-Token']).toBe(shopifyConfig.accessToken);
    expect(JSON.parse(sent.body!).variables).toEqual({ first: 1, after: 'page-two' });
    expect(JSON.parse(sent.body!).query).not.toMatch(/mutation|customer|metafields/);
  });

  it('pages variants separately, preserves decimal prices and reports untracked inventory as unknown', async () => {
    const stock = { ...shopifyVariant(), inventoryQuantity: 900, inventoryItem: { id: 'gid://shopify/InventoryItem/101', tracked: false } };
    const transport = fixtureTransport(json({ data: { shop: { currencyCode: 'USD' }, product: { variants: connection([shopifyVariant()], 'next-variant') } } }), json({ data: { productVariants: connection([stock]) } }));
    const connector = createConnector(shopifyConfig, { transport });
    expect(await connector.listVariants({ productId: 'gid://shopify/Product/1', limit: 1 })).toMatchObject({ items: [{ price: { amount: '24.90', currency: 'USD' }, options: [{ name: 'Size', value: 'Small' }] }], nextCursor: 'next-variant' });
    expect(await connector.listInventory()).toMatchObject({ items: [{ scope: 'all_locations', tracked: false, available: null }] });
  });

  it('redacts order customers and pages order lines without custom fields', async () => {
    const line = { id: 'gid://shopify/LineItem/31', title: 'Product', quantity: 2, product: null, variant: null, customAttributes: [{ key: 'email', value: 'private@fixture.com' }] };
    const transport = fixtureTransport(json({ data: { orders: connection([shopifyOrder()]) } }), json({ data: { order: { lineItems: connection([line], 'line-two') } } }), json({ data: { order: { lineItems: connection([{ ...line, id: 'gid://shopify/LineItem/32' }]) } } }));
    const connector = createConnector(shopifyConfig, { transport });
    const orders = await connector.listOrders();
    expect(orders.items[0].customer).toEqual({ externalId: null, redacted: true });
    expect(JSON.stringify(orders)).not.toMatch(/private@|private-note|private-phone/);
    const first = await connector.listOrderLines({ orderId: 'gid://shopify/Order/21', limit: 1 });
    const second = await connector.listOrderLines({ orderId: 'gid://shopify/Order/21', limit: 1, cursor: first.nextCursor });
    expect(second.nextCursor).toBeNull();
    expect(first.items[0]).toMatchObject({ quantity: 2, productId: null, variantId: null });
    expect(first.items[0]).not.toHaveProperty('customAttributes');
  });

  it.each([
    { data: { products: connection([{ ...shopifyProduct(), title: 99 }]) } },
    { data: { products: connection([shopifyProduct(), shopifyProduct(2)]) } },
    { data: { products: connection([], 'next') } },
    { data: { products: connection([shopifyProduct()], 'same') } },
  ])('rejects schema violations, oversized pages and stuck pagination', async (body) => {
    const connector = createConnector(shopifyConfig, { transport: fixtureTransport(json(body)) });
    await expect(connector.listProducts({ limit: 1, cursor: 'same' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects partial GraphQL errors and API fallback versions', async () => {
    const transport = fixtureTransport(json({ data: { products: connection([shopifyProduct()]) }, errors: [{ message: 'secret fixture-shopify-secret', extensions: { code: 'ACCESS_DENIED' } }] }), json({ data: { products: connection([]) } }, 200, { 'x-shopify-api-version': '2026-10' }));
    const connector = createConnector(shopifyConfig, { transport });
    await expect(connector.listProducts()).rejects.toMatchObject({ code: 'AUTHORIZATION_FAILED' });
    await expect(connector.listProducts()).rejects.toMatchObject({ code: 'API_VERSION_MISMATCH' });
  });

  it('does not retry GraphQL POST and reports only the health capability actually probed', async () => {
    const transport = fixtureTransport(json({ errors: [{ extensions: { code: 'THROTTLED' } }] }), json({ data: { products: connection([]) } }));
    const connector = createConnector(shopifyConfig, { transport });
    expect(await connector.health()).toMatchObject({ status: 'rate_limited', checkedCapabilities: [], error: { retryable: true } });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await connector.health()).toMatchObject({ status: 'connected', checkedCapabilities: ['catalog.read'] });
  });
});

describe('WooCommerce read connector', () => {
  it('pages the wc/v3 catalog with TLS Basic auth, never query-string credentials', async () => {
    const transport = fixtureTransport(json([wooProduct()], 200, { 'x-wp-totalpages': '2' }), json([wooProduct(2)], 200, { 'x-wp-totalpages': '2' }));
    const connector = createConnector(wooConfig, { transport });
    const first = await connector.listProducts({ limit: 1 });
    const second = await connector.listProducts({ limit: 1, cursor: first.nextCursor });
    expect(second).toMatchObject({ items: [{ externalId: '2' }], nextCursor: null });
    const sent = transport.mock.calls[1][0];
    expect(sent.url.pathname).toBe('/store/wp-json/wc/v3/products');
    expect(sent.url.searchParams.get('page')).toBe('2');
    expect(sent.headers.Authorization).toBe(`Basic ${Buffer.from('ck_fixture:cs_fixture').toString('base64')}`);
    expect(sent.url.href).not.toMatch(/ck_fixture|cs_fixture|consumer_key|consumer_secret/);
    expect(sent.method).toBe('GET');
    expect(first.items[0]).not.toHaveProperty('meta_data');
  });

  it('reads simple variants and separately pages variable product variants and inherited stock', async () => {
    const transport = fixtureTransport(json(wooProduct()), json(wooProduct(2, 'variable')), json([wooVariation()], 200, { 'x-wp-totalpages': '2' }), json(wooProduct(2, 'variable')), json([wooVariation(12, 'parent')], 200, { 'x-wp-totalpages': '2' }));
    const connector = createConnector(wooConfig, { transport });
    expect(await connector.listVariants({ productId: '1' })).toMatchObject({ items: [{ productId: '1', price: { amount: '24.90', currency: 'USD' } }], nextCursor: null });
    expect(await connector.listVariants({ productId: '2', limit: 1 })).toMatchObject({ items: [{ externalId: '11', productId: '2' }], nextCursor: '2' });
    expect(await connector.listInventory({ productId: '2', cursor: '2', limit: 1 })).toMatchObject({ items: [{ available: null, tracked: false, scope: 'variant' }], nextCursor: null });
    expect(transport.mock.calls[4][0].url.pathname).toBe('/store/wp-json/wc/v3/products/2/variations');
  });

  it('uses response order currency and returns bounded redacted line pages', async () => {
    const lines = [1, 2, 3].map((id) => ({ id, product_id: 0, variation_id: 0, quantity: 1, name: `Line ${id}`, meta_data: [{ value: 'private@fixture.com' }] }));
    const transport = fixtureTransport(json([wooOrder()], 200, { 'x-wp-totalpages': '1' }), json({ id: 21, line_items: lines }), json({ id: 21, line_items: lines }));
    const connector = createConnector(wooConfig, { transport });
    const orders = await connector.listOrders();
    expect(orders.items[0]).toMatchObject({ total: { amount: '49.80', currency: 'EUR' }, createdAt: '2026-09-01T12:00:00.000Z', customer: { redacted: true } });
    expect(JSON.stringify(orders)).not.toMatch(/private@|private-note/);
    const first = await connector.listOrderLines({ orderId: '21', limit: 2 });
    const second = await connector.listOrderLines({ orderId: '21', limit: 2, cursor: first.nextCursor });
    expect(first.items).toHaveLength(2);
    expect(second).toMatchObject({ items: [{ externalId: '3', productId: null, variantId: null }], nextCursor: null });
    expect(JSON.stringify(first)).not.toContain('private@');
  });

  it('retries read throttling within a fixed budget and honors bounded retry-after', async () => {
    const sleep = vi.fn(async () => undefined);
    const transport = fixtureTransport(json({ message: 'busy' }, 429, { 'retry-after': '1' }), json([wooProduct()], 200, { 'x-wp-totalpages': '1' }));
    const connector = createConnector(wooConfig, { transport, sleep });
    await connector.listProducts();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1000);
    const blocked = fixtureTransport(json({}, 429, { 'retry-after': '60' }));
    await expect(createConnector(wooConfig, { transport: blocked, sleep }).listOrders()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(blocked).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])('does not retry authentication or scope failures (%s), nor leak provider error text', async (status) => {
    const transport = fixtureTransport(json({ message: 'ck_fixture cs_fixture private@fixture.com' }, status));
    const result = await createConnector(wooConfig, { transport }).health();
    expect(result.status).toBe(status === 401 ? 'authentication_required' : 'permission_required');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/ck_fixture|cs_fixture|private@/);
  });

  it.each([
    json([wooProduct()]),
    json([wooProduct(), wooProduct(2)], 200, { 'x-wp-totalpages': '1' }),
    json([], 200, { 'x-wp-totalpages': '2' }),
    json([{ ...wooProduct(), id: '1' }], 200, { 'x-wp-totalpages': '1' }),
  ])('fails closed on unsupported schema or unbounded pagination responses', async (response) => {
    await expect(createConnector(wooConfig, { transport: fixtureTransport(response) }).listProducts({ limit: 1 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('connector capability and configuration boundaries', () => {
  it('has no write methods and rejects every write capability without network access', () => {
    const transport = fixtureTransport();
    for (const config of [wooConfig, shopifyConfig]) {
      const connector = createConnector(config, { transport });
      for (const capability of ['catalog.write', 'prices.write', 'inventory.write', 'orders.write', 'refunds.write', 'checkout.write'] as ConnectorCapability[]) {
        expect(() => connector.requireCapability(capability)).toThrowError(ConnectorError);
      }
      expect(Object.keys(connector)).not.toEqual(expect.arrayContaining(['refund', 'createOrder', 'updatePrice']));
      expect(Object.isFrozen(connector.manifest.capabilities)).toBe(true);
    }
    expect(connectorManifests.shopify.implementation).toBe('read_only');
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects arbitrary Shopify hosts, unapproved Woo hosts, insecure URLs, credentials in URLs and path traversal', async () => {
    const transport = fixtureTransport();
    for (const shop of ['localhost', '127.0.0.1', 'merchant.com', 'a.myshopify.com.evil.com', 'a.myshopify.com/other']) {
      expect(() => createConnector({ ...shopifyConfig, shop }, { transport })).toThrow();
    }
    for (const baseUrl of ['http://shop.hotl-fixture.com', 'https://evil.com', 'https://user:password@shop.hotl-fixture.com', 'https://shop.hotl-fixture.com:444', 'https://shop.hotl-fixture.com/?consumer_key=secret', 'https://127.0.0.1']) {
      expect(() => createConnector({ ...wooConfig, baseUrl }, { transport })).toThrow();
    }
    await expect(createConnector(wooConfig, { transport }).listVariants({ productId: '../orders' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(createConnector(shopifyConfig, { transport }).listProducts({ limit: 101 })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(transport).not.toHaveBeenCalled();
  });
});
