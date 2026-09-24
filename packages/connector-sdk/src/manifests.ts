import type { CapabilityManifest, ConnectorProvider } from './types.js';

const capabilities = Object.freeze(['catalog.read', 'variants.read', 'inventory.read', 'orders.read', 'webhooks.verify'] as const);
export const connectorManifests: Readonly<Record<ConnectorProvider, CapabilityManifest>> = Object.freeze({
  shopify: Object.freeze({
    provider: 'shopify', name: 'Shopify', apiVersion: '2026-07', implementation: 'read_only', capabilities,
    requiredPermissions: Object.freeze({
      'catalog.read': Object.freeze(['read_products']), 'variants.read': Object.freeze(['read_products']),
      'inventory.read': Object.freeze(['read_products', 'read_inventory']), 'orders.read': Object.freeze(['read_orders']),
    }),
    limitations: Object.freeze([
      'No provider writes are implemented. All financial/public writes require the deterministic guardrail service.',
      'Order access is limited by installed scopes, protected customer data approval, and provider history restrictions.',
      'Inventory is an aggregate across locations; it is not a location-level availability guarantee.',
      'Health probes confirm catalog access only. OAuth installation and token renewal are not implemented here.',
    ]),
  }),
  woocommerce: Object.freeze({
    provider: 'woocommerce', name: 'WooCommerce', apiVersion: 'wc/v3', implementation: 'read_only', capabilities,
    requiredPermissions: Object.freeze({
      'catalog.read': Object.freeze(['read']), 'variants.read': Object.freeze(['read']),
      'inventory.read': Object.freeze(['read']), 'orders.read': Object.freeze(['read']),
    }),
    limitations: Object.freeze([
      'No provider writes are implemented. Use a read-only consumer key.',
      'Inventory without productId lists product-level stock. Pass a variable productId to page through variant stock.',
      'Product prices use the configured store currency; order totals use the provider order currency.',
      'A trusted server host allowlist and publicly resolved IPv4 HTTPS endpoint are required.',
      'Rate limits and authentication behavior can vary with the host, plugins, and reverse proxy.',
    ]),
  }),
});
