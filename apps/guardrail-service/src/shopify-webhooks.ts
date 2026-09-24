import { z } from 'zod';
import { createHttpClient, shopifyEndpoint } from '@hotl/connector-sdk/transport';
import { ConnectorError, type ConnectorOptions } from '@hotl/connector-sdk';

export const managedWebhookTopics = ['products/create', 'products/update', 'products/delete', 'inventory_levels/update'] as const;
export const managedWebhookTopic = z.enum(managedWebhookTopics);
export type ManagedWebhookTopic = z.infer<typeof managedWebhookTopic>;
const providerTopics: Record<ManagedWebhookTopic, string> = {
  'products/create': 'PRODUCTS_CREATE', 'products/update': 'PRODUCTS_UPDATE',
  'products/delete': 'PRODUCTS_DELETE', 'inventory_levels/update': 'INVENTORY_LEVELS_UPDATE',
};
const subscription = z.object({ id: z.string().regex(/^gid:\/\/shopify\/WebhookSubscription\/[1-9]\d*$/), topic: z.string(), uri: z.string().url(), format: z.literal('JSON') });
export type ProviderSubscription = z.infer<typeof subscription>;
export type ShopifyWebhookPort = {
  list(topic: ManagedWebhookTopic): Promise<{ shop: string; developmentStore: boolean; subscriptions: ProviderSubscription[] }>;
  create(topic: ManagedWebhookTopic, uri: string): Promise<{ subscription: ProviderSubscription | null; requestId: string | null; rejected: boolean }>;
};

/** Shop-scoped Admin API subscriptions. No mutation retry is configured. */
export function shopifyWebhookPort(shop: string, accessToken: string, options: ConnectorOptions = {}): ShopifyWebhookPort {
  const http = createHttpClient({ ...options, timeoutMs: options.timeoutMs ?? 4000 });
  const url = shopifyEndpoint(shop);
  const query = async (document: string, variables: Record<string, unknown>) => {
    const response = await http({ url, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken }, body: JSON.stringify({ query: document, variables }) });
    if (response.headers['x-shopify-api-version'] !== '2026-07') throw new ConnectorError('API_VERSION_MISMATCH');
    const body = z.object({ data: z.record(z.unknown()).optional(), errors: z.array(z.object({ extensions: z.object({ code: z.string().optional() }).passthrough().optional() }).passthrough()).optional() }).parse(response.data);
    if (body.errors?.length) throw new ConnectorError(body.errors.some(error => error.extensions?.code === 'THROTTLED') ? 'RATE_LIMITED' : 'UPSTREAM_REJECTED');
    if (!body.data) throw new ConnectorError('INVALID_RESPONSE');
    return { data: body.data, requestId: response.headers['x-request-id']?.slice(0, 200) ?? null };
  };
  return {
    async list(topic) {
      const { data } = await query('query HOTLWebhooks($topics: [WebhookSubscriptionTopic!], $after: String) { shop { myshopifyDomain plan { partnerDevelopment } } webhookSubscriptions(first: 100, topics: $topics, after: $after) { nodes { id topic uri format } pageInfo { hasNextPage } } }', { topics: [providerTopics[topic]], after: null });
      const store = z.object({ myshopifyDomain: z.literal(shop), plan: z.object({ partnerDevelopment: z.boolean() }) }).parse(data.shop);
      const result = z.object({ nodes: z.array(subscription).max(100), pageInfo: z.object({ hasNextPage: z.boolean() }) }).parse(data.webhookSubscriptions);
      if (result.pageInfo.hasNextPage || result.nodes.some(item => item.topic !== providerTopics[topic])) throw new ConnectorError('INVALID_RESPONSE');
      return { shop: store.myshopifyDomain, developmentStore: store.plan.partnerDevelopment, subscriptions: result.nodes };
    },
    async create(topic, uri) {
      const { data, requestId } = await query('mutation HOTLWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) { webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) { webhookSubscription { id topic uri format } userErrors { field message } } }', { topic: providerTopics[topic], webhookSubscription: { uri, format: 'JSON' } });
      const result = z.object({ webhookSubscription: subscription.nullable(), userErrors: z.array(z.object({ field: z.array(z.string()).nullable().optional(), message: z.string() })) }).parse(data.webhookSubscriptionCreate);
      if (result.userErrors.length) return { subscription: null, requestId, rejected: true };
      if (!result.webhookSubscription || result.webhookSubscription.topic !== providerTopics[topic] || result.webhookSubscription.uri !== uri) throw new ConnectorError('INVALID_RESPONSE');
      return { subscription: result.webhookSubscription, requestId, rejected: false };
    },
  };
}
