import { describe, expect, it, vi } from 'vitest';
import type { HttpTransport } from '@hotl/connector-sdk';
import { shopifyPricePort } from '../src/shopify-provider.js';

const shop = 'fixture.myshopify.com', accessToken = 'fixture-provider-secret';
const variantId = 'gid://shopify/ProductVariant/101', productId = 'gid://shopify/Product/10';
const shopData = { currencyCode: 'USD', myshopifyDomain: shop, plan: { partnerDevelopment: true } };
const variant = { id: variantId, price: '19.5', product: { id: productId, updatedAt: '2026-09-18T12:00:00.000Z' } };
const readData = { shop: shopData, productVariant: variant };
const writeData = { productVariantsBulkUpdate: { productVariants: [{ id: variantId, price: '20.00' }], userErrors: [] } };
function fixture(data: unknown, status = 200, version: string | undefined = '2026-07') {
  const headers: Record<string, string> = { 'x-request-id': 'provider-request-fixture' };
  if (version) headers['x-shopify-api-version'] = version;
  const transport = vi.fn<HttpTransport>(async () => ({ status, headers, body: JSON.stringify(data) }));
  return { transport, port: shopifyPricePort(shop, accessToken, { transport }) };
}

describe('Shopify guarded price provider contract', () => {
  it('reads exact store identity, currency, development status and resource revision from the versioned API', async () => {
    const f = fixture({ data: readData });
    expect(await f.port.read(variantId)).toEqual({ variantId, productId, price: '19.50', currency: 'USD', providerRevision: variant.product.updatedAt, requestId: 'provider-request-fixture', developmentStore: true });
    const request = f.transport.mock.calls[0][0];
    expect(request.url.href).toBe(`https://${shop}/admin/api/2026-07/graphql.json`);
    expect(request.method).toBe('POST'); expect(request.headers['X-Shopify-Access-Token']).toBe(accessToken);
    const body = JSON.parse(request.body!);
    expect(body.variables).toEqual({ id: variantId });
    expect(body.query).toContain('shop { currencyCode myshopifyDomain plan { partnerDevelopment } }');
  });

  it.each([
    ['absent shop', { productVariant: variant }],
    ['wrong shop', { ...readData, shop: { ...shopData, myshopifyDomain: 'another.myshopify.com' } }],
    ['missing development proof', { ...readData, shop: { currencyCode: 'USD', myshopifyDomain: shop } }],
    ['wrong variant', { ...readData, productVariant: { ...variant, id: 'gid://shopify/ProductVariant/102' } }],
    ['bad product GID', { ...readData, productVariant: { ...variant, product: { ...variant.product, id: '10' } } }],
    ['invalid price', { ...readData, productVariant: { ...variant, price: '1e2' } }],
    ['invalid revision', { ...readData, productVariant: { ...variant, product: { ...variant.product, updatedAt: 'unknown' } } }],
  ])('rejects %s rather than inferring valid evidence', async (_name, data) => {
    const f = fixture({ data }); await expect(f.port.read(variantId)).rejects.toThrow(); expect(f.transport).toHaveBeenCalledTimes(1);
  });

  it('preserves a non-development store result for guardrails to deny', async () => {
    const f = fixture({ data: { ...readData, shop: { ...shopData, plan: { partnerDevelopment: false } } } });
    expect(await f.port.read(variantId)).toMatchObject({ developmentStore: false });
  });

  it('writes one exact variant, disables partial updates and returns only the provider request identifier', async () => {
    const f = fixture({ data: writeData });
    expect(await f.port.write(productId, variantId, '20.00')).toEqual({ requestId: 'provider-request-fixture' });
    const body = JSON.parse(f.transport.mock.calls[0][0].body!);
    expect(body.variables).toEqual({ productId, variants: [{ id: variantId, price: '20.00' }] });
    expect(body.query).toContain('allowPartialUpdates: false');
    expect(f.transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['partial success', { productVariants: writeData.productVariantsBulkUpdate.productVariants, userErrors: [{ code: 'INVALID', field: ['variants', '0', 'price'] }] }],
    ['no variants', { productVariants: [], userErrors: [] }],
    ['extra variant', { productVariants: [{ id: variantId, price: '20.00' }, { id: 'gid://shopify/ProductVariant/102', price: '20.00' }], userErrors: [] }],
    ['different price', { productVariants: [{ id: variantId, price: '21.00' }], userErrors: [] }],
    ['non-decimal price', { productVariants: [{ id: variantId, price: '2e1' }], userErrors: [] }],
    ['different variant', { productVariants: [{ id: 'gid://shopify/ProductVariant/102', price: '20.00' }], userErrors: [] }],
    ['malformed payload', { productVariants: null }],
  ])('rejects %s without replaying the mutation', async (_name, result) => {
    const f = fixture({ data: { productVariantsBulkUpdate: result } });
    await expect(f.port.write(productId, variantId, '20.00')).rejects.toThrow(); expect(f.transport).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 429, 500, 503])('does not retry POST on HTTP %s or expose provider error bodies', async status => {
    const f = fixture({ error: accessToken }, status);
    let failure: unknown;
    try { await f.port.write(productId, variantId, '20.00'); } catch (error) { failure = error; }
    expect(failure).toBeDefined(); expect(String(failure)).not.toContain(accessToken); expect(f.transport).toHaveBeenCalledTimes(1);
  });

  it.each(['2026-04', undefined])('rejects the returned API version %s before accepting a provider result', async version => {
    const f = fixture({ data: writeData }, 200, version === undefined ? '' : version);
    await expect(f.port.write(productId, variantId, '20.00')).rejects.toMatchObject({ code: 'API_VERSION_MISMATCH' }); expect(f.transport).toHaveBeenCalledTimes(1);
  });

  it('rejects GraphQL throttling even when HTTP status is successful', async () => {
    const f = fixture({ data: writeData, errors: [{ message: accessToken, extensions: { code: 'THROTTLED' } }] });
    await expect(f.port.write(productId, variantId, '20.00')).rejects.toMatchObject({ code: 'RATE_LIMITED' }); expect(f.transport).toHaveBeenCalledTimes(1);
  });

  it('does not send malformed variant IDs or amounts to Shopify', async () => {
    const f = fixture({ data: writeData });
    await expect(f.port.write(productId, '101', '20.00')).rejects.toThrow();
    await expect(f.port.write('10', variantId, '20.00')).rejects.toThrow();
    await expect(f.port.write(productId, variantId, '2e1')).rejects.toThrow();
    expect(f.transport).not.toHaveBeenCalled();
  });

  it('refuses incomplete location pagination', async () => {
    const f = fixture({ data: { locations: { nodes: [{ id: 'gid://shopify/Location/1', name: 'Warehouse', isActive: true }], pageInfo: { hasNextPage: true } } } });
    await expect(f.port.locations()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); expect(f.transport).toHaveBeenCalledTimes(1);
  });
});
