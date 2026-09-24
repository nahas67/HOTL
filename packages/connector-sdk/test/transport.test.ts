import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient, isPublicIpv4, secureNodeTransport } from '../src/transport.js';
import { fixtureTransport, json } from './fixtures.js';

const mock = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mock.lookup }));
vi.mock('node:https', () => ({ request: mock.request }));

describe('HTTPS transport destination protections', () => {
  beforeEach(() => { mock.lookup.mockReset(); mock.request.mockReset(); });

  it.each(['0.0.0.0', '10.1.2.3', '127.0.0.1', '100.64.0.1', '169.254.169.254', '172.31.2.3', '192.168.0.1', '192.0.2.2', '198.18.1.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '::1', '::ffff:127.0.0.1'])('rejects non-public address %s', (address) => {
    expect(isPublicIpv4(address)).toBe(false);
  });

  it('denies a DNS answer containing any private address before opening a socket', async () => {
    mock.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]);
    await expect(secureNodeTransport({ url: new URL('https://shop.hotl-fixture.com'), method: 'GET', headers: {}, signal: new AbortController().signal })).rejects.toMatchObject({ code: 'UNSAFE_DESTINATION' });
    expect(mock.request).not.toHaveBeenCalled();
  });

  it('pins the validated DNS answer into a fresh TLS connection and never follows redirects', async () => {
    mock.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    mock.request.mockImplementation((_url, _options, callback) => {
      const request = new EventEmitter() as EventEmitter & { end(): void; write(): void; destroy(): void };
      request.write = () => undefined;
      request.destroy = () => undefined;
      request.end = () => {
        const response = new EventEmitter() as EventEmitter & { headers: Record<string, string>; statusCode: number };
        response.headers = { location: 'https://127.0.0.1/private' };
        response.statusCode = 302;
        callback(response);
        response.emit('end');
      };
      return request;
    });
    const client = createHttpClient({ maxGetRetries: 0 });
    await expect(client({ url: new URL('https://shop.hotl-fixture.com'), method: 'GET', headers: { Authorization: 'Basic fixture' } })).rejects.toMatchObject({ code: 'UPSTREAM_REJECTED' });
    const options = mock.request.mock.calls[0][1];
    expect(options).toMatchObject({ family: 4, agent: false });
    const resolved = vi.fn();
    options.lookup('shop.hotl-fixture.com', {}, resolved);
    expect(resolved).toHaveBeenCalledExactlyOnceWith(null, '8.8.8.8', 4);
    expect(mock.lookup).toHaveBeenCalledTimes(1);
    expect(mock.request).toHaveBeenCalledTimes(1);
  });
});

describe('bounded provider requests', () => {
  it('ends a hung request at the deadline and signals cancellation', async () => {
    const transport = vi.fn(async () => new Promise<never>(() => undefined));
    const client = createHttpClient({ transport, timeoutMs: 10, maxGetRetries: 0 });
    await expect(client({ url: new URL('https://shop.hotl-fixture.com'), method: 'GET', headers: {} })).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(transport.mock.calls).toHaveLength(1);
    // The public client supplies the signal even when a custom transport ignores it.
  });

  it('caps GET retries and returns sanitized errors for thrown provider failures', async () => {
    const transport = vi.fn(async () => { throw new Error('Authorization: secret-token; customer private@fixture.com'); });
    const sleep = vi.fn(async () => undefined);
    const client = createHttpClient({ transport, sleep, maxGetRetries: 2 });
    const error = await client({ url: new URL('https://shop.hotl-fixture.com'), method: 'GET', headers: {} }).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(JSON.stringify(error)).not.toMatch(/secret-token|private@/);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
  });

  it.each([
    { status: 200, body: 'not JSON: secret-token', headers: {} },
    { status: 200, body: 'x'.repeat(2 * 1024 * 1024 + 1), headers: {} },
  ])('rejects malformed and excessive responses without retry', async (response) => {
    const transport = fixtureTransport(response);
    const client = createHttpClient({ transport });
    await expect(client({ url: new URL('https://shop.hotl-fixture.com'), method: 'GET', headers: {} })).rejects.toMatchObject({ retryable: false });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('does not follow a redirect returned by an injected transport', async () => {
    const transport = fixtureTransport(json({}, 307, { location: 'https://other.hotl-fixture.com' }));
    await expect(createHttpClient({ transport })({ url: new URL('https://shop.hotl-fixture.com'), method: 'POST', headers: {}, body: '{}' })).rejects.toMatchObject({ code: 'UPSTREAM_REJECTED' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
