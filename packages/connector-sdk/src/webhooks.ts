import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { ConnectorError } from './errors.js';
import type { ConnectorProvider } from './types.js';

export interface WebhookSignatureInput {
  provider: ConnectorProvider;
  rawBody: Uint8Array;
  /** Shopify X-Shopify-Hmac-SHA256 or WooCommerce X-WC-Webhook-Signature. */
  signature: string | null | undefined;
  /** Shopify app client secret or the individual WooCommerce webhook secret. */
  secret: string;
}
/** Authenticity only. The caller must durably deduplicate by connection + delivery ID + digest. */
export function verifyWebhookSignature(input: WebhookSignatureInput): boolean {
  if (!['shopify', 'woocommerce'].includes(input.provider) || !(input.rawBody instanceof Uint8Array)
    || input.rawBody.byteLength > 2 * 1024 * 1024 || typeof input.secret !== 'string' || !input.secret
    || input.secret.length > 8192 || typeof input.signature !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(input.signature)) return false;
  const actual = Buffer.from(input.signature, 'base64');
  if (actual.length !== 32 || actual.toString('base64') !== input.signature) return false;
  const expected = createHmac('sha256', input.secret).update(input.rawBody).digest();
  return timingSafeEqual(actual, expected);
}
export function assertWebhookSignature(input: WebhookSignatureInput): { bodySha256: string } {
  if (!verifyWebhookSignature(input)) throw new ConnectorError('INVALID_WEBHOOK');
  return { bodySha256: createHash('sha256').update(input.rawBody).digest('hex') };
}
