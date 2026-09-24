import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createAuth, type AuthConfig } from './auth.js';
import { KillJournal, type KillAction } from './journal.js';

export const ACTION_NAMES = ['queues_halted', 'storefront_maintenance_on', 'litellm_keys_revoked', 'meta_token_revoked', 'tiktok_token_revoked', 'supplier_key_revoked', 'stripe_restricted_key_revoked'] as const;
export interface Hook { url: string; token: string }
export interface KillConfig {
  auth: AuthConfig;
  journalPath: string;
  allowInitialize: boolean;
  hooks: Partial<Record<typeof ACTION_NAMES[number], Hook>>;
  fetch?: typeof fetch;
}
const bearer = (request: IncomingMessage) => request.headers.authorization?.replace(/^Bearer /, '') ?? '';
const respond = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(body));
};
async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = '';
  for await (const chunk of request) {
    body += String(chunk);
    if (Buffer.byteLength(body) > 8192) throw new Error('Request too large');
  }
  const value: unknown = JSON.parse(body || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Object payload required');
  return value as Record<string, unknown>;
}

export async function createKillSwitch(config: KillConfig) {
  const auth = createAuth(config.auth);
  const journal = new KillJournal(config.journalPath, config.allowInitialize);
  await journal.initialize();
  let pending: Promise<unknown> = Promise.resolve();
  let closed = false;
  const failedAuthentication = new Map<string, { count: number; expires: number }>();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }
  async function runActions() {
    if (!journal.snapshot().engaged) return;
    for (const action of journal.snapshot().actions) {
      if (action.status === 'succeeded') continue;
      const hook = config.hooks[action.name as keyof typeof config.hooks];
      let next: KillAction = { ...action, attempts: action.attempts + 1 };
      if (!hook) {
        next = { ...next, status: 'unconfigured', error: 'No independently authorized revocation hook configured' };
      } else {
        try {
          const url = new URL(hook.url);
          if (config.auth.mode === 'live' && url.protocol !== 'https:') throw new Error('Live hooks require HTTPS');
          const response = await (config.fetch ?? fetch)(url, { method: 'POST', headers: {
            authorization: `Bearer ${hook.token}`, 'content-type': 'application/json',
            'idempotency-key': `kill:${journal.snapshot().engagedAt}:${action.name}`,
          }, body: JSON.stringify({ action: action.name, engagedAt: journal.snapshot().engagedAt, reason: journal.snapshot().reason }), signal: AbortSignal.timeout(5000), redirect: 'error' });
          // A generic HTTP 200 is insufficient evidence of token revocation.
          const receipt = await response.json() as { status?: string; action?: string };
          if (!response.ok || receipt.status !== 'succeeded' || receipt.action !== action.name) throw new Error(`Hook did not confirm ${action.name} (HTTP ${response.status})`);
          next = { ...next, status: 'succeeded', completedAt: new Date().toISOString() };
          delete next.error;
        } catch (error) { next = { ...next, status: 'failed', error: error instanceof Error ? error.message : 'Hook failed' }; }
      }
      await journal.append('action', { ...next });
    }
  }
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://kill-switch.local').pathname;
    try {
      if (request.method === 'GET' && path === '/health') {
        respond(response, 200, { status: 'ok', service: 'isolated-kill-switch', mode: config.auth.mode }); return;
      }
      if (request.method === 'GET' && path === '/state') {
        if (!auth.read(bearer(request))) { respond(response, 401, { error: { code: 'UNAUTHORIZED', message: 'Read token required' } }); return; }
        respond(response, 200, { ...journal.snapshot(), mode: config.auth.mode }); return;
      }
      if (request.method !== 'POST' || !['/engage', '/reauth', '/retry'].includes(path)) {
        respond(response, 404, { error: { code: 'NOT_FOUND', message: 'No such endpoint' } }); return;
      }
      const body = await readJson(request);
      if (path === '/reauth') {
        const address = request.socket.remoteAddress ?? 'unknown';
        const now = Date.now();
        const failures = failedAuthentication.get(address);
        if (failures && failures.expires > now && failures.count >= 5) { respond(response, 429, { error: { code: 'RATE_LIMITED', message: 'Try reauthentication in five minutes' } }); return; }
        try {
          const reauthToken = await auth.issueProof(bearer(request), typeof body.password === 'string' ? body.password : '');
          failedAuthentication.delete(address);
          respond(response, 200, { reauthToken, expiresIn: 300 });
        } catch {
          const previous = failures && failures.expires > now ? failures.count : 0;
          failedAuthentication.set(address, { count: previous + 1, expires: now + 300000 });
          respond(response, 401, { error: { code: 'REAUTH_REQUIRED', message: 'Reauthentication failed' } });
        }
        return;
      }
      let actor: string;
      try { actor = await auth.owner(bearer(request), typeof request.headers['x-reauth-token'] === 'string' ? request.headers['x-reauth-token'] : undefined); }
      catch { respond(response, 401, { error: { code: 'REAUTH_REQUIRED', message: 'An authorized owner with recent reauthentication is required' } }); return; }
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || key.length < 8 || key.length > 200) { respond(response, 400, { error: { code: 'IDEMPOTENCY_REQUIRED', message: 'Idempotency-Key must contain 8 to 200 characters' } }); return; }
      if (path === '/engage') {
        if (body.confirmationPhrase !== 'STOP EVERYTHING' || typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 1000) {
          respond(response, 400, { error: { code: 'CONFIRMATION_REQUIRED', message: 'Type STOP EVERYTHING and provide a reason' } }); return;
        }
        await serialize(async () => {
          if (!journal.snapshot().engaged) await journal.append('engaged', { actor, reason: (body.reason as string).trim(), idempotencyKey: key, actions: [...ACTION_NAMES] });
        });
        // Publish the durable latch immediately; external revocations proceed independently of this response.
        respond(response, 202, { status: 'engaged', ...journal.snapshot(), actionsTaken: journal.snapshot().actions.filter(action => action.status === 'succeeded').map(action => action.name) });
        void serialize(runActions).catch(error => process.stderr.write(`Kill actions failed to persist: ${error instanceof Error ? error.message : 'unknown'}\n`));
        return;
      }
      if (!journal.snapshot().engaged) { respond(response, 409, { error: { code: 'NOT_ENGAGED', message: 'The kill switch has not been engaged' } }); return; }
      respond(response, 202, { status: 'retrying', ...journal.snapshot() });
      void serialize(runActions).catch(error => process.stderr.write(`Kill retry failed: ${error instanceof Error ? error.message : 'unknown'}\n`));
    } catch (error) {
      respond(response, 500, { error: { code: 'KILL_SWITCH_ERROR', message: error instanceof Error ? error.message : 'Request failed' } });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  const retryTimer = setInterval(() => {
    if (!closed && journal.snapshot().engaged && journal.snapshot().actions.some(action => ['pending', 'failed'].includes(action.status))) {
      void serialize(runActions).catch(error => process.stderr.write(`Kill retry failed: ${String(error)}\n`));
    }
  }, 30000);
  retryTimer.unref();
  if (journal.snapshot().engaged) void serialize(runActions).catch(error => process.stderr.write(`Kill recovery failed: ${String(error)}\n`));
  return {
    server,
    snapshot: () => journal.snapshot(),
    async flush() { await pending; },
    async close() {
      closed = true;
      clearInterval(retryTimer);
      if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await pending;
      await journal.close();
    },
  };
}
