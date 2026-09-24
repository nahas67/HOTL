import { describe, expect, it, vi } from 'vitest';
import type { HttpTransport } from '@hotl/connector-sdk';
import { shopifyWebhookPort } from '../src/shopify-webhooks.js';

const shop = 'staging-shop.myshopify.com', uri = 'https://hooks.example.com/api/shopify/webhooks/00000000-0000-4000-8000-000000000001';
const subscription = { id: 'gid://shopify/WebhookSubscription/1', topic: 'PRODUCTS_UPDATE', uri, format: 'JSON' };
function fixture(responses: unknown[]) {
  const transport = vi.fn<HttpTransport>(async () => ({ status: 200, headers: { 'x-shopify-api-version': '2026-07', 'x-request-id': 'provider-request' }, body: JSON.stringify(responses.shift()) }));
  return { transport, port: shopifyWebhookPort(shop, 'guardrail-only-token', { transport }) };
}
describe('Shopify webhook provider contract', () => {
  it('lists one bounded topic and exact development-store identity', async () => {
    const f = fixture([{ data: { shop: { myshopifyDomain: shop, plan: { partnerDevelopment: true } }, webhookSubscriptions: { nodes: [subscription], pageInfo: { hasNextPage: false } } } }]);
    expect(await f.port.list('products/update')).toMatchObject({ developmentStore: true, subscriptions: [subscription] });
    const request = JSON.parse(f.transport.mock.calls[0][0].body!);
    expect(request.variables).toEqual({ topics: ['PRODUCTS_UPDATE'], after: null });
    expect(request.query).toContain('first: 100');
  });
  it('sends one create with exact URI and refuses pagination or mismatched result', async () => {
    const f = fixture([{ data: { webhookSubscriptionCreate: { webhookSubscription: subscription, userErrors: [] } } }]);
    expect(await f.port.create('products/update', uri)).toMatchObject({ subscription, requestId: 'provider-request', rejected: false });
    expect(f.transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(f.transport.mock.calls[0][0].body!).variables).toEqual({ topic: 'PRODUCTS_UPDATE', webhookSubscription: { uri, format: 'JSON' } });
    const overflow = fixture([{ data: { shop: { myshopifyDomain: shop, plan: { partnerDevelopment: true } }, webhookSubscriptions: { nodes: [], pageInfo: { hasNextPage: true } } } }]);
    await expect(overflow.port.list('products/update')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    const mismatch = fixture([{ data: { webhookSubscriptionCreate: { webhookSubscription: { ...subscription, uri: 'https://other.example.com' }, userErrors: [] } } }]);
    await expect(mismatch.port.create('products/update', uri)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('does not retry a provider response with errors', async () => {
    const f = fixture([{ data: { webhookSubscriptionCreate: { webhookSubscription: null, userErrors: [{ field: ['uri'], message: 'invalid' }] } } }]);
    expect(await f.port.create('products/update', uri)).toMatchObject({ rejected: true, subscription: null });
    expect(f.transport).toHaveBeenCalledTimes(1);
  });
});
