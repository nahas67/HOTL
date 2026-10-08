import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertSameOrigin, configSchema, isLocalRequest, resolveSchema, upstream } from './proxy';

afterEach(() => vi.unstubAllGlobals());

describe('cockpit owner boundary', () => {
  it('accepts the actual local target authority after Next normalizes the internal URL', () => {
    expect(() => assertSameOrigin(new Request('http://localhost:3000/api/pause', { method:'POST', headers:{host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000','x-hotl-cockpit':'1'} }))).not.toThrow();
    expect(isLocalRequest(new Request('http://localhost:3000/api/telemetry', {headers:{host:'attacker.example'}}))).toBe(false);
    expect(() => assertSameOrigin(new Request('http://localhost:3000/api/pause',{method:'POST',headers:{host:'127.0.0.1:3000',origin:'https://attacker.example','x-forwarded-host':'attacker.example','x-hotl-cockpit':'1'}}))).toThrow('Cross-origin');
  });
  it('blocks cross-origin owner mutations', () => {
    expect(() => assertSameOrigin(new Request('http://localhost:3000/api/pause', { method: 'POST', headers: { origin: 'https://attacker.example', 'x-hotl-cockpit': '1' } }))).toThrow('Cross-origin');
  });
  it('does not classify remote or deceptive hosts as local', () => {
    for (const host of ['commerce.example', 'localhost.attacker.example', '192.168.1.2']) expect(isLocalRequest(new Request(`http://${host}/api/telemetry`))).toBe(false);
    expect(isLocalRequest(new Request('http://127.0.0.1:3000/api/telemetry'))).toBe(true);
  });
  it('rejects attempts to lower the mandatory margin floor or raise auto-refunds', () => {
    expect(configSchema.safeParse({ dailyAdSpendCeiling: 100, marginFloor: 0.2, autoRefundThreshold: 25, currency: 'USD' }).success).toBe(false);
    expect(configSchema.safeParse({ dailyAdSpendCeiling: 100, marginFloor: 0.4, autoRefundThreshold: 50, currency: 'USD' }).success).toBe(false);
  });
  it('requires an auditable note and actual modified payload', () => {
    expect(resolveSchema.safeParse({ decision: 'approve', note: '' }).success).toBe(false);
    expect(resolveSchema.safeParse({ decision: 'modify', note: 'Verified amount' }).success).toBe(false);
    expect(resolveSchema.safeParse({ decision: 'modify', note: 'Verified amount', modifiedPayload: { amount: 20 } }).success).toBe(true);
  });
  it('treats an HTTP 200 guardrail denial as a failed operation so it cannot resume', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ decision: 'deny', reason: 'MARGIN_BELOW_FLOOR' }), { status: 200 })));
    const result = await upstream('http://127.0.0.1:4100', '/interrupts/example/resolve', {}, 'POST', { decision: 'approve' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.data).toMatchObject({ error: { code: 'MARGIN_BELOW_FLOOR' } });
  });
  it('treats an UNKNOWN provider outcome as a failure, not as success', async () => {
    // The guardrail returns decision 'unknown' when a provider write may or may not have
    // landed. Before this was handled, every transport signal -- HTTP 200 and ok:true --
    // reported a financial operation as completed.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      decision: 'unknown', operationId: 'op-1', status: 'UNKNOWN', receipt: { outcome: 'UNKNOWN' },
    }), { status: 200 })));
    const result = await upstream('http://127.0.0.1:4100', '/shopify/prices/op-1/execute', {}, 'POST', {});
    expect(result.ok).toBe(false);
    expect(result.status).toBe(502);
    expect(result.data).toMatchObject({ error: { code: 'PROVIDER_OUTCOME_UNKNOWN' } });
    expect((result.data as { error: { message: string } }).error.message).toMatch(/must not be retried blindly/i);
  });
  it('does not report an uncertain outcome as a denial either', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ decision: 'unknown' }), { status: 200 })));
    const result = await upstream('http://127.0.0.1:4100', '/shopify/prices/op-1/execute', {}, 'POST', {});
    expect(result.status).not.toBe(409);
    expect((result.data as { error: { code: string } }).error.code).not.toBe('GUARDRAIL_DENIED');
  });
  it('fails closed on malformed upstream JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Maintenance</html>', { status: 200 })));
    expect(await upstream('http://127.0.0.1:4100', '/telemetry', {})).toMatchObject({ ok: false, status: 502 });
  });
  it('explains policy and resource conflicts without treating them as success', async () => {
    for (const [reason, message] of [
      ['CONSTITUTION_CHANGED', 'Review the latest policy version'],
      ['RESOURCE_CHANGED', 'Review its latest revision'],
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ decision: 'deny', reason }), { status: 200 })));
      const result = await upstream('http://127.0.0.1:4100', '/products/example/update', {}, 'POST', {});
      expect(result).toMatchObject({ ok: false, status: 409, data: { error: { code: reason } } });
      expect((result.data as { error: { message: string } }).error.message).toContain(message);
    }
  });
});
