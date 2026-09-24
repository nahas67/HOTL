import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertWebhookSignature, verifyWebhookSignature } from '../src/index.js';

describe.each(['shopify', 'woocommerce'] as const)('%s webhook raw-body authenticity', (provider) => {
  const secret = 'fixture-webhook-secret';
  const rawBody = Buffer.from('{"id":123,"name":"Fixture café"}\n', 'utf8');
  const signature = createHmac('sha256', secret).update(rawBody).digest('base64');

  it('verifies the exact bytes and returns a digest for durable caller deduplication', () => {
    expect(verifyWebhookSignature({ provider, secret, rawBody, signature })).toBe(true);
    expect(assertWebhookSignature({ provider, secret, rawBody, signature })).toEqual({ bodySha256: createHash('sha256').update(rawBody).digest('hex') });
  });

  it('rejects forged signatures, changed whitespace, wrong connection secrets and missing headers', () => {
    expect(verifyWebhookSignature({ provider, secret, rawBody, signature: `${signature.slice(0, 1) === 'A' ? 'B' : 'A'}${signature.slice(1)}` })).toBe(false);
    expect(verifyWebhookSignature({ provider, secret, rawBody: Buffer.from(JSON.stringify(JSON.parse(rawBody.toString()))), signature })).toBe(false);
    expect(verifyWebhookSignature({ provider, secret: 'other-connection-secret', rawBody, signature })).toBe(false);
    expect(verifyWebhookSignature({ provider, secret, rawBody, signature: null })).toBe(false);
    expect(() => assertWebhookSignature({ provider, secret, rawBody, signature: 'malformed' })).toThrow('The webhook signature is invalid.');
  });

  it('rejects oversized bodies and noncanonical base64', () => {
    expect(verifyWebhookSignature({ provider, secret, rawBody: Buffer.alloc(2 * 1024 * 1024 + 1), signature })).toBe(false);
    expect(verifyWebhookSignature({ provider, secret, rawBody, signature: `${signature}\n` })).toBe(false);
    expect(verifyWebhookSignature({ provider, secret, rawBody, signature: signature.slice(0, -1) })).toBe(false);
  });
});
