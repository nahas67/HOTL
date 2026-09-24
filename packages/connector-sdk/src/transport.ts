import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { ConnectorError, normalizeConnectorError } from './errors.js';
import type { ConnectorOptions, HttpTransport, TransportRequest, TransportResponse } from './types.js';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export function isPublicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}
export function validatePublicHostname(host: string): void {
  // Only ordinary DNS names; no IP literals, local suffixes, percent-encoding, or absolute DNS dots.
  if (isIP(host) || host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
    || /\.(?:localhost|local|internal|test|invalid|example|home|lan)$/.test(host)) throw new ConnectorError('UNSAFE_DESTINATION');
}
export function shopifyEndpoint(shop: string): URL {
  if (typeof shop !== 'string' || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw new ConnectorError('INVALID_CONFIGURATION');
  validatePublicHostname(shop);
  return new URL(`https://${shop}/admin/api/2026-07/graphql.json`);
}
export function wooBaseUrl(baseUrl: string, allowedHosts: readonly string[]): URL {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new ConnectorError('INVALID_CONFIGURATION'); }
  validatePublicHostname(url.hostname);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || !Array.isArray(allowedHosts) || !allowedHosts.includes(url.hostname)
    || !/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*$/.test(url.pathname)) throw new ConnectorError('UNSAFE_DESTINATION');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/wp-json/wc/v3/`;
  return url;
}

/** Pins the approved IPv4 resolution into the TLS connection. Redirects are never followed. */
export const secureNodeTransport: HttpTransport = async (input) => {
  if (input.url.protocol !== 'https:' || input.url.port || input.url.username || input.url.password) throw new ConnectorError('UNSAFE_DESTINATION');
  validatePublicHostname(input.url.hostname);
  const addresses = await lookup(input.url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIpv4(address))) throw new ConnectorError('UNSAFE_DESTINATION');
  if (input.signal.aborted) throw new ConnectorError('TIMEOUT');
  const pinned = addresses[0].address;
  return await new Promise<TransportResponse>((resolve, reject) => {
    const request = httpsRequest(input.url, {
      method: input.method,
      headers: input.headers,
      signal: input.signal,
      agent: false,
      // Explicit IPv4 disables family auto-selection: only the checked address is used.
      family: 4,
      lookup: (_hostname, _options, callback) => callback(null, pinned, 4),
    }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          response.destroy(); request.destroy(); reject(new ConnectorError('RESPONSE_TOO_LARGE'));
        } else chunks.push(chunk);
      });
      response.on('error', () => reject(new ConnectorError('UPSTREAM_UNAVAILABLE')));
      response.on('end', () => {
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(response.headers)) if (typeof value === 'string') headers[name.toLowerCase()] = value;
        resolve({ status: response.statusCode ?? 502, headers, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    request.on('error', () => reject(new ConnectorError(input.signal.aborted ? 'TIMEOUT' : 'UPSTREAM_UNAVAILABLE')));
    if (input.body) request.write(input.body);
    request.end();
  });
};

function statusError(status: number): ConnectorError {
  const code = status === 401 ? 'AUTHENTICATION_FAILED' : status === 403 ? 'AUTHORIZATION_FAILED'
    : status === 404 ? 'RESOURCE_NOT_FOUND' : status === 429 ? 'RATE_LIMITED'
    : status >= 500 ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_REJECTED';
  return new ConnectorError(code, { status });
}

export function createHttpClient(options: ConnectorOptions = {}) {
  const transport = options.transport ?? secureNodeTransport;
  const timeoutMs = options.timeoutMs ?? 10000;
  const retries = options.maxGetRetries ?? 2;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 || !Number.isSafeInteger(retries) || retries < 0 || retries > 3) {
    throw new ConnectorError('INVALID_CONFIGURATION');
  }
  return async (request: Omit<TransportRequest, 'signal'>): Promise<{ data: unknown; headers: Readonly<Record<string, string>> }> => {
    // GraphQL uses POST even for queries: this client never automatically retries POST.
    const maxAttempts = request.method === 'GET' ? retries + 1 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let retryAfter = 0;
      try {
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let response: TransportResponse;
        try {
          response = await Promise.race([
            transport({ ...request, signal: controller.signal }),
            new Promise<never>((_resolve, reject) => {
              timeout = setTimeout(() => { controller.abort(); reject(new ConnectorError('TIMEOUT')); }, timeoutMs);
            }),
          ]);
        } finally { clearTimeout(timeout); }
        if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) throw new ConnectorError('INVALID_RESPONSE');
        // Never expose provider error bodies; they can contain credentials or customer data.
        if (response.status < 200 || response.status >= 300) {
          const header = response.headers['retry-after'];
          if (header) retryAfter = /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
          throw statusError(response.status);
        }
        if (typeof response.body !== 'string') throw new ConnectorError('INVALID_RESPONSE');
        if (Buffer.byteLength(response.body, 'utf8') > MAX_RESPONSE_BYTES) throw new ConnectorError('RESPONSE_TOO_LARGE');
        let data: unknown;
        try { data = JSON.parse(response.body); } catch { throw new ConnectorError('INVALID_RESPONSE'); }
        return { data, headers: response.headers };
      } catch (error) {
        const safeError = normalizeConnectorError(error);
        if (attempt + 1 >= maxAttempts || !safeError.retryable || retryAfter > 5000) throw safeError;
        await sleep(Math.min(5000, Math.max(250 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter : 0)));
      }
    }
    throw new ConnectorError('UPSTREAM_UNAVAILABLE');
  };
}
