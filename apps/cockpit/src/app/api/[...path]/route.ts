import { NextResponse } from 'next/server';
import { z } from 'zod';
import { constitutionPatchSchema, pilotApprovalRequestSchema, productCreateSchema, productUpdateSchema, refundSchema } from '@hotl/schemas';
import { assertSameOrigin, integrationCreateSchema, integrationCredentialsSchema, integrationDisconnectSchema, integrationRevisionSchema, ownerHeaders, resolveSchema, simulationEnabled, upstream } from '@/lib/proxy';
import { shopifyCookie, shopifyMutationSchema } from '@/lib/shopify-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const route = path.join('/');
    assertSameOrigin(request);
    if (route === 'session' && request.method === 'GET') {
      return NextResponse.json({ mode: simulationEnabled(request) ? 'simulation' : 'live',
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' });
    }
    const auth = ownerHeaders(request);
    const idempotency = request.headers.get('idempotency-key');
    if (request.method !== 'GET' && (!idempotency || idempotency.length > 200)) return NextResponse.json({ error: { message: 'A valid Idempotency-Key is required.' } }, { status: 400 });
    const headers = { ...auth, ...(idempotency ? { 'Idempotency-Key': idempotency } : {}) };
    const guardrail = process.env.GUARDRAIL_SERVICE_URL ?? 'http://127.0.0.1:4100';
    const orchestrator = process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:4300';
    const kill = process.env.KILL_SWITCH_URL ?? 'http://127.0.0.1:4200';
    const prefix = '/api/guardrails/v1';
    let result;
    if (request.method === 'GET' && ['telemetry', 'interrupts', 'audit-log', 'status'].includes(route)) {
      result = await upstream(guardrail, `${prefix}/${route}`, auth);
    } else if (request.method === 'GET' && ['constitution', 'operating-state', 'integrations', 'shopify'].includes(route)) {
      result = await upstream(guardrail, `/api/${route}`, auth);
    } else if (request.method === 'POST' && path[0] === 'shopify' && shopifyMutationSchema(path)) {
      result = await upstream(guardrail, `${prefix}/${path.join('/')}`, headers, 'POST', shopifyMutationSchema(path)!.parse(await request.json()));
    } else if (route === 'finance' && request.method === 'GET') {
      const period = z.enum(['7d', '30d', 'all']).parse(new URL(request.url).searchParams.get('period') ?? '30d');
      result = await upstream(guardrail, `/api/finance?period=${period}`, auth);
    } else if (route === 'integration-catalog' && request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('connectionId');
      result = await upstream(guardrail, `/api/integration-catalog${id ? `?connectionId=${encodeURIComponent(z.string().max(200).parse(id))}` : ''}`, auth);
    } else if (route === 'constitution' && request.method === 'PATCH') {
      result = await upstream(guardrail, `${prefix}/constitution`, headers, 'PATCH', constitutionPatchSchema.parse(await request.json()));
    } else if (route === 'constitution/pilot/approve' && request.method === 'POST') {
      result = await upstream(guardrail, `${prefix}/constitution/pilot/approve`, headers, 'POST', pilotApprovalRequestSchema.parse(await request.json()));
    } else if (route === 'products/create' && request.method === 'POST') {
      result = await upstream(guardrail, `${prefix}/products/create`, headers, 'POST', productCreateSchema.parse(await request.json()));
    } else if (path.length === 3 && path[0] === 'products' && path[2] === 'update' && request.method === 'POST') {
      result = await upstream(guardrail, `${prefix}/products/${encodeURIComponent(path[1])}/update`, headers, 'POST', productUpdateSchema.parse(await request.json()));
    } else if (route === 'refunds/evaluate' && request.method === 'POST') {
      const body = refundSchema.extend({ expectedConstitutionVersion: z.number().int().positive(), expectedRevision: z.number().int().nonnegative() }).parse(await request.json());
      result = await upstream(guardrail, `${prefix}/refunds/evaluate`, headers, 'POST', body);
    } else if (route === 'integrations' && request.method === 'POST') {
      result = await upstream(guardrail, `${prefix}/integrations`, headers, 'POST', integrationCreateSchema.parse(await request.json()));
    } else if (path.length === 3 && path[0] === 'integrations' && ['sync', 'disconnect', 'credentials'].includes(path[2]) && request.method === 'POST') {
      const schema = path[2] === 'sync' ? integrationRevisionSchema : path[2] === 'disconnect' ? integrationDisconnectSchema : integrationCredentialsSchema;
      result = await upstream(guardrail, `${prefix}/integrations/${encodeURIComponent(path[1])}/${path[2]}`, headers, 'POST', schema.parse(await request.json()));
    } else if (route === 'config' && request.method === 'GET') {
      result = await upstream(guardrail, `${prefix}/guardrails/config`, auth);
    } else if (route === 'pause' && ['POST', 'DELETE'].includes(request.method)) {
      result = await upstream(guardrail, `${prefix}/pause/${request.method === 'POST' ? 'engage' : 'release'}`, headers, 'POST', { reason: 'Owner cockpit control' });
    } else if (route === 'runs' && request.method === 'POST') {
      result = await upstream(orchestrator, '/api/runs', headers, 'POST', z.object({ cycle: z.enum(['daily', 'weekly', 'monthly']) }).strict().parse(await request.json()));
    } else if (path[0] === 'runs' && path.length === 2 && request.method === 'GET') {
      const runId = z.string().min(1).max(120).parse(path[1]);
      result = await upstream(orchestrator, `/api/runs/${encodeURIComponent(runId)}`, auth);
    } else if (path[0] === 'interrupts' && path[2] === 'resolve' && path.length === 3 && request.method === 'POST') {
      const body = resolveSchema.parse(await request.json());
      result = await upstream(guardrail, `${prefix}/interrupts/${encodeURIComponent(path[1])}/resolve`, headers, 'POST', body);
      // The guardrail service owns the decision; the orchestrator re-reads that
      // persisted decision before resuming. No browser-supplied decision is trusted.
      if (result.ok) {
        const outcome = result.data as { resumedThreadId?: string; runId?: string; resumeRequired?: boolean };
        if (outcome.resumeRequired !== false && (outcome.resumedThreadId || outcome.runId)) {
          try {
            const resumed = await upstream(orchestrator, `/api/runs/${encodeURIComponent(outcome.runId ?? outcome.resumedThreadId!)}/resume`, headers, 'POST', { interruptId: path[1] });
            if (!resumed.ok) throw new Error('The agent could not resume.');
          } catch {
            result = { status: 202, ok: true, data: { ...outcome, warning: 'Decision saved. The agent has not resumed yet; retry resume from Activity after the orchestrator reconnects.' } };
          }
        }
      }
    } else if (path[0] === 'runs' && path[2] === 'resume' && path.length === 3 && request.method === 'POST') {
      result = await upstream(orchestrator, `/api/runs/${encodeURIComponent(path[1])}/resume`, headers, 'POST', z.object({ interruptId: z.string().min(1) }).strict().parse(await request.json()));
    } else if (route === 'reauth' && request.method === 'POST' && simulationEnabled(request)) {
      const body = z.object({ password: z.string().min(1).max(300) }).strict().parse(await request.json());
      result = await upstream(kill, '/reauth', { ...headers, Authorization: `Bearer ${process.env.KILL_SWITCH_OWNER_TOKEN ?? 'hotl-demo-kill-owner-token'}` }, 'POST', body);
    } else if (route === 'kill-switch' && request.method === 'GET') {
      result = await upstream(kill, '/state', { Authorization: `Bearer ${process.env.KILL_SWITCH_READ_TOKEN ?? 'hotl-demo-kill-read-token'}` });
    } else if (route === 'kill-switch' && request.method === 'POST') {
      const body = z.object({ reason: z.string().trim().min(10).max(2000), confirmationPhrase: z.literal('STOP EVERYTHING'), reauthToken: z.string().optional() }).strict().parse(await request.json());
      const killHeaders = simulationEnabled(request) ? { ...headers, Authorization: `Bearer ${process.env.KILL_SWITCH_OWNER_TOKEN ?? 'hotl-demo-kill-owner-token'}`, 'X-Reauth-Token': body.reauthToken ?? '' } : headers;
      result = await upstream(kill, '/engage', killHeaders, 'POST', { reason: body.reason, confirmationPhrase: body.confirmationPhrase });
    } else {
      return NextResponse.json({ error: { message: 'Route not found.' } }, { status: 404 });
    }
    if (route === 'shopify/install' && result.ok) {
      const cookie = shopifyCookie('setCookie' in result ? result.setCookie ?? null : null);
      if (!cookie) return NextResponse.json({ error: { message: 'The installation browser binding could not be established. Start a new installation.' } }, { status: 502 });
      return NextResponse.json(result.data, { status: result.status, headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(result.data, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const validation = error instanceof z.ZodError;
    const message = validation ? error.issues.map(issue => issue.message).join(' ') : error instanceof Error ? error.message : 'Request failed.';
    const authFailure = message.includes('Sign in') || message.includes('Cross-origin') || message.includes('request header');
    return NextResponse.json({ error: { code: validation ? 'INVALID_REQUEST' : authFailure ? 'UNAUTHORIZED' : 'SERVICE_UNAVAILABLE',
      message: message === 'fetch failed' ? 'Unable to reach the service. Check that your local services are running, then retry.' : message } }, { status: validation ? 400 : authFailure ? 401 : 503 });
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
