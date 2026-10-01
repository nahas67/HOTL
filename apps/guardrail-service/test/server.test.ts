import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { createEngine } from '../src/engine.js';
import { createServer } from '../src/server.js';
const ownerHeaders={'x-hotl-internal-token':'test-secret','idempotency-key':'test-key'};
afterEach(()=>vi.unstubAllEnvs());
describe('HTTP boundary and authorization',()=>{
  it('fails startup for an unknown mode and mismatched authentication/execution modes',async()=>{
    vi.stubEnv('HOTL_MODE','production');
    await expect(createServer({engine:await createEngine()})).rejects.toMatchObject({code:'INVALID_MODE'});
    await expect(createEngine({mode:'production' as 'live'})).rejects.toMatchObject({code:'INVALID_MODE'});
    await expect(createServer({engine:await createEngine(),mode:'live'})).rejects.toMatchObject({code:'MODE_MISMATCH'});
  });
  it('requires the trusted gateway token and an idempotency key',async()=>{
    const app=await createServer({engine:await createEngine(),internalToken:'test-secret'});
    expect((await app.inject({method:'GET',url:'/api/overview'})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url:'/api/guardrails/v1/pause/engage',headers:{'x-hotl-internal-token':'test-secret'},payload:{}})).json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const overview=await app.inject({url:'/api/overview',headers:ownerHeaders});expect(overview.statusCode).toBe(200);expect(overview.json().interrupts).toHaveLength(3);
    await app.close();
  });
  it('exposes secret-free static staging readiness to owners only',async()=>{
    const secret='private-fixture-client-secret-never-return';
    vi.stubEnv('SHOPIFY_CLIENT_SECRET',secret);
    const app=await createServer({engine:await createEngine(),internalToken:'test-secret'});
    expect((await app.inject({url:'/api/staging-readiness'})).statusCode).toBe(401);
    expect((await app.inject({url:'/api/staging-readiness',headers:{...ownerHeaders,'x-hotl-agent-id':'sourcing_agent'}})).statusCode).toBe(403);
    const response=await app.inject({url:'/api/staging-readiness',headers:ownerHeaders});
    expect(response.statusCode).toBe(200);
    const report=response.json();
    expect(report.staticConfiguration.evidenceScope).toBe('STATIC_CONFIGURATION_ONLY');
    expect(report.staticConfiguration.status).toBe('BLOCKED');
    expect(report.activeProbes.status).toBe('NOT_RUN');
    expect(report.externalStagingVerified).toBe(false);
    expect(JSON.stringify(report)).not.toContain(secret);
    await app.close();
  });
  it('does not report live readiness without the private PostgreSQL store',async()=>{
    const workspaceId='11111111-1111-4111-8111-111111111111';
    const app=await createServer({engine:await createEngine({mode:'live'}),mode:'live',workspaceId,internalToken:'local-rejected',agentJwtSecret:'test-secret-longer-than-thirty-two-characters'});
    const response=await app.inject({url:'/health/ready'});
    expect(response.statusCode).toBe(503);
    expect(response.json().status).toBe('not_ready');
    await app.close();
  });
  it('does not permit an agent to resolve interrupts, modify controls, or use another department scope',async()=>{
    const app=await createServer({engine:await createEngine(),internalToken:'test-secret'});
    const headers={...ownerHeaders,'x-hotl-agent-id':'support_agent'};
    expect((await app.inject({method:'POST',url:'/api/guardrails/v1/interrupts/int-refund-1029/resolve',headers,payload:{decision:'approve'}})).statusCode).toBe(403);
    expect((await app.inject({method:'PATCH',url:'/api/guardrails/v1/guardrails/config',headers,payload:{dailyAdSpendCeiling:999}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/api/guardrails/v1/spend/check',headers,payload:{campaignId:'spoof',requestedAmount:1,agentId:'marketing_agent'}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/api/guardrails/v1/interrupts/int-refund-1029/resolve',headers:ownerHeaders,payload:{decision:'approve',resolvedBy:'spoofed-owner'}})).statusCode).toBe(403);
    await app.close();
  });
  it('exposes scoped agent context without leaking customer information across departments',async()=>{
    const app=await createServer({engine:await createEngine(),internalToken:'test-secret'});
    expect((await app.inject({url:'/api/agent-context'})).statusCode).toBe(401);
    const context=async(id:string)=>(await app.inject({url:'/api/agent-context',headers:{...ownerHeaders,'x-hotl-agent-id':id}})).json();
    const sourcing=await context('sourcing_agent');expect(sourcing.products[0].landedCost).toBeDefined();expect(sourcing.orders).toEqual([]);
    const order=await context('order_agent');expect(order.orders).toHaveLength(6);expect(order.orders[0].customer).toBeUndefined();expect(order.interrupts).toEqual([]);
    const marketing=await context('marketing_agent');expect(marketing.orders).toEqual([]);expect(marketing.products[0].landedCost).toBeUndefined();
    const support=await context('support_agent');expect(support.orders[0].customer.email).toBeDefined();expect(support.interrupts.every((item:{category:string})=>item.category==='refund_escrow')).toBe(true);
    await app.close();
  });
  it('rejects local tokens in live mode and accepts only a short-lived scoped agent JWT',async()=>{
    const secret='test-secret-longer-than-thirty-two-characters';
    const workspaceId='11111111-1111-4111-8111-111111111111';
    const app=await createServer({engine:await createEngine({mode:'live'}),mode:'live',workspaceId,internalToken:'test-secret',agentJwtSecret:secret});
    expect((await app.inject({url:'/api/overview',headers:ownerHeaders})).statusCode).toBe(401);
    const token=await new SignJWT({role:'agent',scope:'hotl:spend',workspace_id:workspaceId,authorization_version:1}).setJti('live-agent').setProtectedHeader({alg:'HS256'}).setSubject('marketing_agent').setIssuer('hotl-agents').setAudience('hotl-guardrails').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(secret));
    const response=await app.inject({method:'POST',url:'/api/guardrails/v1/spend/check',headers:{authorization:`Bearer ${token}`,'idempotency-key':'jwt'},payload:{campaignId:'live',agentId:'marketing_agent',requestedAmount:1}});
    expect(response.statusCode).toBe(200);expect(response.json().reason).toBe('LIVE_ADAPTERS_UNAVAILABLE');
    expect((await app.inject({method:'POST',url:'/api/guardrails/v1/pause/engage',headers:{authorization:`Bearer ${token}`,'idempotency-key':'pause'},payload:{}})).statusCode).toBe(403);
    const overbroadToken=await new SignJWT({role:'agent',scope:'hotl:* hotl:spend hotl:refund',workspace_id:workspaceId,authorization_version:1}).setJti('overbroad-agent').setProtectedHeader({alg:'HS256'}).setSubject('support_agent').setIssuer('hotl-agents').setAudience('hotl-guardrails').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(secret));
    expect((await app.inject({method:'POST',url:'/api/guardrails/v1/spend/check',headers:{authorization:`Bearer ${overbroadToken}`,'idempotency-key':'overbroad'},payload:{campaignId:'spoof',requestedAmount:1,agentId:'support_agent'}})).statusCode).toBe(403);
    await app.close();
  });
  it('exposes no kill disengage or main-service kill engage route',async()=>{
    const app=await createServer({engine:await createEngine(),internalToken:'test-secret'});
    for(const suffix of ['engage','disengage'])expect((await app.inject({method:'POST',url:`/api/guardrails/v1/kill-switch/${suffix}`,headers:ownerHeaders,payload:{}})).statusCode).toBe(404);
    await app.close();
  });
});
