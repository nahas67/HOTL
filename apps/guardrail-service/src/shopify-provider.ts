import { z } from 'zod';
import { createHttpClient, shopifyEndpoint } from '@hotl/connector-sdk/transport';
import { ConnectorError, type ConnectorOptions } from '@hotl/connector-sdk';
import { decimal, variantId, type PriceObservation } from './shopify-state.js';

const observed = z.object({ id: variantId, price: z.string(), product: z.object({ id: z.string().regex(/^gid:\/\/shopify\/Product\/[1-9]\d*$/), updatedAt: z.string().datetime() }) });
export type ShopifyPricePort = { read(id: string): Promise<PriceObservation>; write(productId: string, id: string, price: string): Promise<{ requestId: string | null }>; locations(): Promise<unknown[]> };

/** Only constructed in the guardrail process. Mutations have no automatic retry. */
export function shopifyPricePort(shop: string, accessToken: string, options: ConnectorOptions = {}): ShopifyPricePort {
  const http = createHttpClient({ ...options, timeoutMs: options.timeoutMs ?? 4000 });
  const url = shopifyEndpoint(shop);
  const query = async (document: string, variables: Record<string, unknown>) => {
    const response = await http({ url, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken }, body: JSON.stringify({ query: document, variables }) });
    if (response.headers['x-shopify-api-version'] !== '2026-07') throw new ConnectorError('API_VERSION_MISMATCH');
    const body = z.object({ data: z.record(z.unknown()).optional(), errors: z.array(z.object({ extensions: z.object({ code: z.string().optional() }).passthrough().optional() }).passthrough()).optional() }).parse(response.data);
    if (body.errors?.length) throw new ConnectorError(body.errors.some(e => e.extensions?.code === 'THROTTLED') ? 'RATE_LIMITED' : 'UPSTREAM_REJECTED');
    if (!body.data) throw new ConnectorError('INVALID_RESPONSE');
    return { data: body.data, requestId: response.headers['x-request-id']?.slice(0, 200) ?? null };
  };
  return {
    async read(id) {
      variantId.parse(id);
      const { data, requestId } = await query('query HOTLPrice($id: ID!) { shop { currencyCode myshopifyDomain plan { partnerDevelopment } } productVariant(id: $id) { id price product { id updatedAt } } }', { id });
      const item = observed.parse(data.productVariant);
      const store = z.object({ currencyCode: z.string().regex(/^[A-Z]{3}$/), myshopifyDomain: z.literal(shop), plan: z.object({ partnerDevelopment: z.boolean() }) }).parse(data.shop);
      const rawPrice = /^\d+\.\d$/.test(item.price) ? `${item.price}0` : /^\d+$/.test(item.price) ? `${item.price}.00` : item.price;
      if (item.id !== id) throw new ConnectorError('INVALID_RESPONSE');
      return { variantId: item.id, productId: item.product.id, price: decimal.parse(rawPrice), currency: store.currencyCode, providerRevision: item.product.updatedAt, requestId, developmentStore: store.plan.partnerDevelopment };
    },
    async write(productId, id, price) {
      z.string().regex(/^gid:\/\/shopify\/Product\/[1-9]\d*$/).parse(productId); variantId.parse(id); decimal.parse(price);
      const { data, requestId } = await query('mutation HOTLPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: false) { productVariants { id price } userErrors { code field } } }', { productId, variants: [{ id, price }] });
      const result = z.object({ productVariants: z.array(z.object({ id: z.string(), price: z.string() })).nullable(), userErrors: z.array(z.object({ code: z.string().nullable().optional(), field: z.array(z.string()).nullable().optional() })) }).parse(data.productVariantsBulkUpdate);
      if (result.userErrors.length) throw new ConnectorError('UPSTREAM_REJECTED');
      if (result.productVariants?.length !== 1 || result.productVariants[0].id !== id) throw new ConnectorError('INVALID_RESPONSE');
      const rawPrice = result.productVariants[0].price;
      const normalized = /^\d+$/.test(rawPrice) ? `${rawPrice}.00` : /^\d+\.\d$/.test(rawPrice) ? `${rawPrice}0` : rawPrice;
      if (!decimal.safeParse(normalized).success || normalized !== price) throw new ConnectorError('INVALID_RESPONSE');
      return { requestId };
    },
    async locations() {
      const { data } = await query('query HOTLLocations { locations(first: 100) { nodes { id name isActive } pageInfo { hasNextPage } } }', {});
      const result = z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string(), isActive: z.boolean() })), pageInfo: z.object({ hasNextPage: z.boolean() }) }).parse(data.locations);
      if (result.pageInfo.hasNextPage) throw new ConnectorError('INVALID_RESPONSE');
      return result.nodes;
    },
  };
}
