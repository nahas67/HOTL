import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

// The storefront checkout proxy is public and unauthenticated, and the package reported
// success with ZERO tests. Its origin check is a CSRF control: if it can be bypassed, a
// third-party page can drive a checkout against a shopper's session.
//
// These cases assert the shape of that control directly. They do not mock the route; they
// call it with real NextRequest objects and spy only on the downstream fetch, so an assertion
// can prove a hostile request never reached the commerce service.

const calls: string[] = [];
const originalFetch = globalThis.fetch;

function commerceSpy() {
  calls.length = 0;
  return vi.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ products: [], order: null }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.STOREFRONT_PUBLIC_ORIGIN;
  vi.restoreAllMocks();
});

const post = (init: { origin?: string | null; host?: string; body?: string; pinned?: string } = {}) =>
  POST(
    new NextRequest('http://shop.internal/api/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(init.origin === null ? {} : init.origin ? { origin: init.origin } : { origin: 'http://shop.internal' }),
        ...(init.host ? { host: init.host } : {}),
      },
      body: init.body ?? JSON.stringify({ items: [] }),
    }),
    { params: Promise.resolve({ path: ['checkout'] }) },
  );

describe('storefront checkout origin control', () => {
  it('allows a same-origin checkout when the origin is pinned', async () => {
    process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://shop.example.com';
    globalThis.fetch = commerceSpy();
    const response = await post({ origin: 'https://shop.example.com' });
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('refuses a cross-origin checkout and never reaches the commerce service', async () => {
    process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://shop.example.com';
    globalThis.fetch = commerceSpy();
    const response = await post({ origin: 'https://evil.example' });
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('refuses a checkout with no Origin header rather than assuming same-origin', async () => {
    process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://shop.example.com';
    globalThis.fetch = commerceSpy();
    const response = await post({ origin: null });
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('refuses an origin that merely shares the host prefix', async () => {
    process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://shop.example.com';
    globalThis.fetch = commerceSpy();
    for (const hostile of ['https://shop.example.com.evil.test', 'http://shop.example.com', 'https://SHOP.example.com']) {
      const response = await post({ origin: hostile });
      expect(response.status, hostile).toBe(403);
    }
    expect(calls).toHaveLength(0);
  });

  it('refuses a cross-origin checkout when the public origin is unset', async () => {
    globalThis.fetch = commerceSpy();
    const response = await post({ origin: 'https://evil.example' });
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('does not apply the CSRF control to GET reads', async () => {
    globalThis.fetch = commerceSpy();
    const response = await GET(
      new NextRequest('http://shop.internal/api/products', { headers: { origin: 'https://elsewhere.example' } }),
      { params: Promise.resolve({ path: ['products'] }) },
    );
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('keeps unknown routes unreachable', async () => {
    globalThis.fetch = commerceSpy();
    const response = await POST(
      new NextRequest('http://shop.internal/api/admin', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ path: ['admin'] }) },
    );
    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});
