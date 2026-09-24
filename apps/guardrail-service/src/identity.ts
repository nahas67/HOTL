import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';
import { agentIdSchema, type Actor } from '@hotl/schemas';
import { GuardrailError } from './engine.js';

export type Principal = { actor: Actor; scopes: Set<string>; workspaceId: string; authorizationVersion: number };
export const agentScopes: Readonly<Record<string, readonly string[]>> = {
  sourcing_agent: ['listing', 'runs', 'context'],
  marketing_agent: ['spend', 'campaign', 'runs', 'context'],
  order_agent: ['supplier', 'commerce', 'runs', 'context'],
  support_agent: ['refund', 'runs', 'context'],
  master_orchestrator: ['status', 'runs', 'context'],
};
export type IdentityOptions = {
  mode: 'simulation' | 'live';
  internalToken?: string;
  workspaceId?: string;
  supabaseUrl?: string;
  ownerUserIds?: string[];
  agentJwtSecret?: string;
  agentJwtKeys?: Record<string, string>;
  agentJwtIssuer?: string;
  authorizationVersion?: number;
  tokensValidAfter?: number;
  revokedTokenIds?: string[];
  revokedSessionIds?: string[];
  agentScopeLimits?: Record<string, string[]>;
  /** Trusted dependency injection for a locally hosted issuer/test harness; never supplied by HTTP. */
  ownerKeyResolver?: JWTVerifyGetKey;
};

const denied = () => new GuardrailError('UNAUTHORIZED', 'The credential is invalid, expired, or revoked.', 401);
const configurationError = () => new GuardrailError('AUTH_NOT_CONFIGURED', 'Identity configuration is missing or invalid.', 503);
const constantEqual = (left: string, right: string) => {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const list = (value: string | undefined) => (value ?? '').split(',').map(item => item.trim()).filter(Boolean);
function jsonConfig<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { throw configurationError(); }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** One trusted workspace per service instance, matching the runtime ledger's database binding. */
export function createIdentity(options: IdentityOptions) {
  const workspaceId = options.workspaceId ?? process.env.GUARDRAIL_WORKSPACE_ID ?? (options.mode === 'simulation' ? 'simulation' : '');
  const internalToken = options.internalToken ?? process.env.HOTL_INTERNAL_TOKEN ?? 'hotl-local-development-token';
  if (options.mode === 'live' && !uuid.test(workspaceId)) throw configurationError();
  const version = options.authorizationVersion ?? Number(process.env.GUARDRAIL_AUTHORIZATION_VERSION ?? '1');
  const validAfter = options.tokensValidAfter ?? Number(process.env.GUARDRAIL_TOKENS_VALID_AFTER ?? '0');
  if (!Number.isSafeInteger(version) || version < 1 || !Number.isSafeInteger(validAfter) || validAfter < 0) throw configurationError();
  const revokedTokens = new Set(options.revokedTokenIds ?? list(process.env.GUARDRAIL_REVOKED_TOKEN_IDS));
  const revokedSessions = new Set(options.revokedSessionIds ?? list(process.env.GUARDRAIL_REVOKED_SESSION_IDS));
  const limits = options.agentScopeLimits ?? jsonConfig<Record<string, string[]>>(process.env.AGENT_SCOPE_LIMITS, {});
  if (!record(limits) || Object.entries(limits).some(([id, scopes]) => !Object.hasOwn(agentScopes, id) || !Array.isArray(scopes) || scopes.some(scope => !agentScopes[id].includes(scope)))) throw configurationError();
  // Copy trusted configuration so callers cannot mutate an established authorization boundary.
  const scopeLimits = new Map(Object.entries(limits).map(([id, scopes]) => [id, new Set(scopes)]));
  const secret = options.agentJwtSecret ?? process.env.AGENT_JWT_SECRET;
  const keys = options.agentJwtKeys ?? jsonConfig<Record<string, string>>(process.env.AGENT_JWT_KEYS, secret ? { legacy: secret } : {});
  if (!record(keys) || Object.entries(keys).some(([kid, value]) => !/^[A-Za-z0-9_-]{1,80}$/.test(kid) || typeof value !== 'string' || Buffer.byteLength(value) < 32)) throw configurationError();
  const agentKeys = new Map(Object.entries(keys).map(([kid, value]) => [kid, new TextEncoder().encode(value)]));
  const issuer = options.agentJwtIssuer ?? process.env.AGENT_JWT_ISSUER ?? 'hotl-agents';
  const supabaseUrl = options.supabaseUrl ?? process.env.SUPABASE_URL;
  const ownerIds = new Set(options.ownerUserIds ?? list(process.env.OWNER_USER_IDS ?? process.env.OWNER_USER_ID ?? process.env.SUPABASE_OWNER_IDS));
  let ownerIssuer: string | undefined;
  let ownerKeys: JWTVerifyGetKey | undefined;
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw configurationError();
      ownerIssuer = `${url.origin}/auth/v1`;
      ownerKeys = options.ownerKeyResolver ?? createRemoteJWKSet(new URL(`${ownerIssuer}/.well-known/jwks.json`), { timeoutDuration: 2500 });
    } catch { throw configurationError(); }
  }

  function verifyLifetime(claims: JWTPayload, maximum: number) {
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || claims.iat! > now || claims.exp! <= claims.iat! || claims.exp! - claims.iat! > maximum || claims.iat! <= validAfter) throw denied();
    if (typeof claims.jti === 'string' && revokedTokens.has(claims.jti)) throw denied();
  }
  function bindWorkspace(value: unknown, authorizationVersion: unknown) {
    if (value !== workspaceId) throw new GuardrailError('WORKSPACE_REQUIRED', 'The credential is not bound to this workspace.', 403);
    if (authorizationVersion !== version) throw denied();
  }

  async function authenticate(headers: Record<string, string | string[] | undefined>): Promise<Principal> {
    const header = (name: string) => typeof headers[name] === 'string' ? headers[name] as string : '';
    if (options.mode === 'simulation') {
      if (!constantEqual(header('x-hotl-internal-token'), internalToken)) throw denied();
      const agent = header('x-hotl-agent-id');
      if (!agent) return { actor: { type: 'owner', id: 'simulation-owner' }, scopes: new Set(['*']), workspaceId, authorizationVersion: version };
      const parsed = agentIdSchema.safeParse(agent);
      if (!parsed.success) throw denied();
      return { actor: { type: 'agent', id: parsed.data }, scopes: new Set(agentScopes[parsed.data]), workspaceId, authorizationVersion: version };
    }
    const authorization = header('authorization');
    if (!authorization.startsWith('Bearer ') || authorization.length > 16384) throw denied();
    const token = authorization.slice(7);
    let algorithm: string | undefined, kid: string | undefined;
    try { const protectedHeader = decodeProtectedHeader(token); algorithm = protectedHeader.alg; kid = protectedHeader.kid; } catch { throw denied(); }
    if (algorithm === 'HS256') {
      const key = agentKeys.get(kid ?? (agentKeys.size === 1 && agentKeys.has('legacy') ? 'legacy' : ''));
      if (!key) throw denied();
      let claims: JWTPayload;
      try { claims = (await jwtVerify(token, key, { issuer, audience: 'hotl-guardrails', algorithms: ['HS256'], maxTokenAge: '15m' })).payload; } catch { throw denied(); }
      verifyLifetime(claims, 900);
      const id = agentIdSchema.safeParse(claims.sub);
      if (claims.role !== 'agent' || !id.success || typeof claims.jti !== 'string' || !claims.jti.trim() || claims.jti.length > 200 || typeof claims.scope !== 'string') throw denied();
      bindWorkspace(claims.workspace_id, claims.authorization_version);
      const allowed = new Set(agentScopes[id.data]);
      const reduced = scopeLimits.get(id.data);
      const scopes = claims.scope.split(/\s+/).filter(scope => scope.startsWith('hotl:')).map(scope => scope.slice(5)).filter(scope => allowed.has(scope) && (!reduced || reduced.has(scope)));
      return { actor: { type: 'agent', id: id.data }, scopes: new Set(scopes), workspaceId, authorizationVersion: version };
    }
    if (algorithm !== 'RS256' && algorithm !== 'ES256') throw denied();
    if (!ownerIssuer || !ownerKeys || ownerIds.size === 0) throw configurationError();
    let claims: JWTPayload;
    try { claims = (await jwtVerify(token, ownerKeys, { issuer: ownerIssuer, audience: 'authenticated', algorithms: ['RS256', 'ES256'], maxTokenAge: '1h' })).payload; } catch { throw denied(); }
    verifyLifetime(claims, 3600);
    const metadata = record(claims.app_metadata) ? claims.app_metadata : {};
    if (!claims.sub || !ownerIds.has(claims.sub) || metadata.role !== 'owner') throw new GuardrailError('OWNER_REQUIRED', 'This account is not an authorized workspace owner.', 403);
    if (typeof claims.session_id !== 'string' || !claims.session_id.trim() || claims.session_id.length > 200 || revokedSessions.has(claims.session_id)) throw denied();
    bindWorkspace(metadata.workspace_id, metadata.authorization_version);
    return { actor: { type: 'owner', id: claims.sub }, scopes: new Set(['*']), workspaceId, authorizationVersion: version };
  }
  return { workspaceId, authenticate };
}
