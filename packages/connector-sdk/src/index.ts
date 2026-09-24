export type * from './types.js';
export { ConnectorError, normalizeConnectorError } from './errors.js';
export type { ConnectorErrorCode } from './errors.js';
export { connectorManifests } from './manifests.js';
export { createShopifyConnector } from './shopify.js';
export { createWooCommerceConnector } from './woocommerce.js';
export { verifyWebhookSignature, assertWebhookSignature } from './webhooks.js';
export type { WebhookSignatureInput } from './webhooks.js';
import { ConnectorError } from './errors.js';
import { createShopifyConnector } from './shopify.js';
import { createWooCommerceConnector } from './woocommerce.js';
import type { CommerceConnector, ConnectorConfig, ConnectorOptions } from './types.js';

export function createConnector(config: ConnectorConfig, options?: ConnectorOptions): CommerceConnector {
  if (config?.provider === 'shopify') return createShopifyConnector(config, options);
  if (config?.provider === 'woocommerce') return createWooCommerceConnector(config, options);
  throw new ConnectorError('INVALID_CONFIGURATION');
}
