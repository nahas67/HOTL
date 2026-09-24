import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createCommerceApp } from '../src/app.js';
import { verifyStripeSignature } from '../src/webhooks.js';

describe('commerce financial boundary', () => {
  it('rejects client-supplied prices and never reaches the payment boundary', async () => {
    const request = vi.fn(); const app = createCommerceApp({ guardrail: { request } });
    const response = await app.inject({ method: 'POST', url: '/store/checkout', headers: { 'idempotency-key': 'checkout-1234' }, payload: { customer: { name: 'A', email: 'a@example.com' }, items: [{ productId: 'p1', quantity: 1, price: 0.01 }] } });
    expect(response.statusCode).toBe(400); expect(request).not.toHaveBeenCalled(); await app.close();
  });
  it('passes validated checkout to the guardrail and propagates denial', async () => {
    const request = vi.fn().mockRejectedValue(Object.assign(new Error('System paused'), { statusCode: 423 }));
    const app = createCommerceApp({ guardrail: { request } });
    const response = await app.inject({ method: 'POST', url: '/store/checkout', headers: { 'idempotency-key': 'checkout-1234' }, payload: { customer: { name: 'A', email: 'a@example.com' }, items: [{ productId: 'p1', quantity: 1 }] } });
    expect(response.statusCode).toBe(423); expect(request).toHaveBeenCalledOnce(); await app.close();
  });
  it.each(['US', 'IN', undefined])('forwards the submitted country %s and checkout key without inferring a destination', async (destinationCountry) => {
    const payload = {
      customer: { name: 'Ada', email: 'ada@example.com' },
      items: [{ productId: 'p1', quantity: 1 }],
      ...(destinationCountry ? { destinationCountry } : {}),
    };
    const receipt = { order: { id: 'order-1' } };
    const request = vi.fn().mockResolvedValue(receipt);
    const app = createCommerceApp({ guardrail: { request } });
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await app.inject({ method: 'POST', url: '/store/checkout', headers: { 'idempotency-key': 'country-checkout-1234' }, payload });
        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({ ...receipt, mode: 'simulation' });
        expect(request).toHaveBeenLastCalledWith('/api/guardrails/v1/commerce/checkout', payload, 'country-checkout-1234');
      }
      expect(request).toHaveBeenCalledTimes(2);
    } finally { await app.close(); }
  });
  it.each(['', 'us', 'USA', 'U1', ' US', null])('rejects malformed destination country %s before the financial boundary', async (destinationCountry) => {
    const request = vi.fn();
    const app = createCommerceApp({ guardrail: { request } });
    try {
      const response = await app.inject({ method: 'POST', url: '/store/checkout', headers: { 'idempotency-key': 'country-checkout-1234' }, payload: { customer: { name: 'Ada', email: 'ada@example.com' }, items: [{ productId: 'p1', quantity: 1 }], destinationCountry } });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_REQUEST');
      expect(request).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it('preserves a country-policy denial from the guardrail', async () => {
    const details = { error: { code: 'COUNTRY_PROHIBITED', message: 'This destination is prohibited by the current constitution.' } };
    const request = vi.fn().mockRejectedValue(Object.assign(new Error(details.error.message), { statusCode: 403, details }));
    const app = createCommerceApp({ guardrail: { request } });
    try {
      const response = await app.inject({ method: 'POST', url: '/store/checkout', headers: { 'idempotency-key': 'country-checkout-1234' }, payload: { customer: { name: 'Ada', email: 'ada@example.com' }, items: [{ productId: 'p1', quantity: 1 }], destinationCountry: 'US' } });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual(details);
      expect(request).toHaveBeenCalledWith('/api/guardrails/v1/commerce/checkout', expect.objectContaining({ destinationCountry: 'US' }), 'country-checkout-1234');
    } finally { await app.close(); }
  });
  it('never exposes catalog costs or supplier information publicly', async () => {
    const app = createCommerceApp({ guardrail: { request: async () => ({ products: [{ id: 'p1', status: 'active', name: 'Cup', price: 20, landedCost: 3, supplier: 'private' }, { id: 'p2', status: 'draft' }] }) } });
    const response = await app.inject('/store/products');
    expect(response.json().products).toHaveLength(1); expect(response.body).not.toContain('landedCost'); expect(response.body).not.toContain('private'); await app.close();
  });
  it('verifies signed raw bytes and rejects stale or tampered webhook events', () => {
    const raw = '{"id":"evt_1"}', now = Date.now(), timestamp = Math.floor(now / 1000);
    const digest = createHmac('sha256', 'secret').update(`${timestamp}.${raw}`).digest('hex');
    expect(verifyStripeSignature(raw, `t=${timestamp},v1=${digest}`, 'secret', now)).toBe(true);
    expect(verifyStripeSignature(raw + ' ', `t=${timestamp},v1=${digest}`, 'secret', now)).toBe(false);
    expect(verifyStripeSignature(raw, `t=${timestamp},v1=${digest}`, 'secret', now + 301000)).toBe(false);
  });
  it('fails closed for live checkout until the payment bridge is configured', async () => {
    const app = createCommerceApp({ mode: 'live' });
    expect((await app.inject({ method: 'POST', url: '/store/checkout', payload: {} })).statusCode).toBe(503); await app.close();
  });
  it('audits an authenticated payment event before durable queue delivery', async () => {
    const sequence: string[] = [];
    const request = vi.fn(async () => { sequence.push('audit'); return { status: 'processed' }; });
    const publish = vi.fn(async () => { sequence.push('publish'); });
    const app = createCommerceApp({ guardrail: { request }, publisher: { publish }, webhookSecret: 'secret' });
    const raw = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { metadata: { order_id: 'ORD-1' } } } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = `t=${timestamp},v1=${createHmac('sha256', 'secret').update(`${timestamp}.${raw}`).digest('hex')}`;
    const response = await app.inject({ method: 'POST', url: '/webhooks/stripe', headers: { 'Content-Type': 'application/json', 'stripe-signature': signature }, payload: raw });
    expect(response.statusCode).toBe(200); expect(sequence).toEqual(['audit', 'publish']);
    expect(request).toHaveBeenCalledWith('/api/guardrails/v1/commerce/events', { eventId: 'evt_1', type: 'payment.confirmed', orderId: 'ORD-1' }, 'stripe-evt_1');
    await app.close();
  });
  it('does not acknowledge payment events when the durable queue fails', async () => {
    const app = createCommerceApp({ guardrail: { request: async () => ({ status: 'processed' }) }, publisher: { publish: async () => { throw new Error('Queue unavailable'); } }, webhookSecret: 'secret' });
    const raw = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { metadata: { order_id: 'ORD-1' } } } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = `t=${timestamp},v1=${createHmac('sha256', 'secret').update(`${timestamp}.${raw}`).digest('hex')}`;
    const response = await app.inject({ method: 'POST', url: '/webhooks/stripe', headers: { 'Content-Type': 'application/json', 'stripe-signature': signature }, payload: raw });
    expect(response.statusCode).toBe(503); await app.close();
  });
});
