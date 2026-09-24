import { forwardShopifyCallback } from '@/lib/shopify-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = forwardShopifyCallback;
