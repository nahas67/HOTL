import { createHmac, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { shopifyWebhookMac, verifyShopifyWebhookMac } from '../src/shopify-oauth.js';

const key = Buffer.alloc(32, 4);
const otherKey = Buffer.alloc(32, 5);
const installationId = randomUUID();
const otherInstallationId = randomUUID();
const mac = () => shopifyWebhookMac(key, installationId);

describe('installation-bound Shopify webhook callback MAC (M1)', () => {
  it('is deterministic so re-registering after a provider-side deletion yields the identical URI', () => {
    expect(mac()).toBe(mac());
    expect(shopifyWebhookMac(key, installationId)).toBe(shopifyWebhookMac(key, installationId));
  });

  it('is exactly one URL-path-safe base64url segment carrying the full 256-bit digest', () => {
    const value = mac();
    expect(value).toHaveLength(43);
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // 43 unpadded base64url characters is the whole 32-byte digest, not a truncation.
    expect(Buffer.from(value, 'base64url')).toHaveLength(32);
    expect(createHmac('sha256', key).update(`hotl-shopify-webhook:v1:${installationId}`).digest('base64url')).toHaveLength(43);
  });

  it('binds the callback to one installation, which is the property the replay fix depends on', () => {
    // A body captured for installation A must not authenticate installation B's endpoint.
    expect(mac()).not.toBe(shopifyWebhookMac(key, otherInstallationId));
    expect(verifyShopifyWebhookMac(key, otherInstallationId, mac())).toBe(false);
    expect(verifyShopifyWebhookMac(key, installationId, shopifyWebhookMac(key, otherInstallationId))).toBe(false);
  });

  it('binds the callback to the configured vault key', () => {
    expect(mac()).not.toBe(shopifyWebhookMac(otherKey, installationId));
    expect(verifyShopifyWebhookMac(otherKey, installationId, mac())).toBe(false);
  });

  it('is domain separated from a bare MAC over the same key and message', () => {
    // Guards against reusing another construction's output as the webhook authenticator.
    expect(mac()).not.toBe(createHmac('sha256', key).update(installationId).digest('base64url'));
    expect(mac()).not.toBe(createHmac('sha256', key).update(installationId).digest('hex'));
    // A v2 scheme must not silently reproduce v1 output.
    expect(mac()).not.toBe(createHmac('sha256', key).update(`hotl-shopify-webhook:v2:${installationId}`).digest('base64url'));
  });

  it('accepts only the exact segment for that installation and key', () => {
    expect(verifyShopifyWebhookMac(key, installationId, mac())).toBe(true);
    for (const presented of [
      '', mac().slice(0, 42), `${mac()}x`, `${mac()}=`, mac().replace(/^./, (c: string) => (c === 'a' ? 'b' : 'a')),
      'not-a-mac', null, undefined, 42, {}, [], Buffer.from(mac()),
    ]) expect(verifyShopifyWebhookMac(key, installationId, presented), String(presented)).toBe(false);
  });
});