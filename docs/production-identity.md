# Production identity boundary

Implemented locally on 2026-09-17. These checks use cryptographically signed test
JWTs and the actual HTTP server; they do not establish a hosted Supabase login,
deployed tenant isolation, session revocation propagation, or a production rollout.

## Workspace authority

Each guardrail process serves one trusted workspace. Live startup requires
`GUARDRAIL_WORKSPACE_ID`, a canonical lowercase UUID. A trusted programmatic
`ServerOptions.workspaceId` can supply it instead. When the server creates its
PostgreSQL store, the identity workspace must match the database workspace setting.
The existing PostgreSQL administrator-to-login binding remains a separate check.

Client headers, query parameters, JSON bodies, and user-editable profile metadata
cannot select the active workspace. An agent's signed `workspace_id`, or an owner's
signed `app_metadata.workspace_id`, must equal the server setting. Missing and
foreign bindings are rejected before a private route reaches the engine. The
current deployment model is one instance and ledger per workspace, not a shared
multi-workspace HTTP router. A caller who injects a custom engine is responsible
for binding that engine to the same workspace; production startup uses the
configured store instead.

## Owner access

Owners use RS256 or ES256 Supabase session JWTs, verified using the trusted HTTPS
`SUPABASE_URL` JWKS endpoint. The issuer must be that project's `/auth/v1` and
the audience must include `authenticated`. The subject must appear in
`OWNER_USER_IDS` (comma separated; earlier aliases remain supported).

The signed, administrator-controlled `app_metadata` must contain:

```json
{
  "role": "owner",
  "workspace_id": "11111111-1111-4111-8111-111111111111",
  "authorization_version": 1
}
```

A signed `session_id` and integer `iat`/`exp` are required. Owner tokens have a
maximum lifetime and age of one hour. Configure the issuer accordingly; deployments
using longer Supabase access-token lifetimes must shorten them before enabling
this boundary. User-editable `user_metadata` never grants access. The process
supports owner and department-agent roles only; viewer, operator, and arbitrary
service roles are denied rather than silently mapped to owner.

## Runtime agent credentials

The existing five department identities also serve as bounded runtime service
identities. They use HS256, issuer `AGENT_JWT_ISSUER` (default `hotl-agents`),
audience `hotl-guardrails`, and a maximum lifetime and age of 15 minutes. A trusted
issuer provisions tokens with claims such as:

```json
{
  "sub": "marketing_agent",
  "role": "agent",
  "workspace_id": "11111111-1111-4111-8111-111111111111",
  "authorization_version": 1,
  "scope": "hotl:spend hotl:context",
  "jti": "unique-token-identifier",
  "iss": "hotl-agents",
  "aud": "hotl-guardrails",
  "iat": 1800000000,
  "exp": 1800000300
}
```

The timestamps above illustrate the format only. The issuer must generate current
timestamps and a unique token identifier. Signing keys belong to the trusted
issuer and guardrail verifier, never an agent, browser, prompt, or telemetry event.
There is no public token-minting endpoint in this service.

| Department | Maximum scopes |
| --- | --- |
| sourcing_agent | listing, runs, context |
| marketing_agent | spend, campaign, runs, context |
| order_agent | supplier, commerce, runs, context |
| support_agent | refund, runs, context |
| master_orchestrator | status, runs, context |

Token scopes are intersected with this allowlist. Unknown, cross-department,
owner, and wildcard scopes grant no additional permissions. Optional
`AGENT_SCOPE_LIMITS` is a JSON object of narrower plain scope names, for example
`{"marketing_agent":["context"]}`. An empty list removes every scope for that
agent. Configuration cannot add a scope outside the department maximum.
Owner-only route checks remain separate from scopes.

## Rotation and revocation

`AGENT_JWT_KEYS` is a secret JSON object mapping key identifiers to signing secrets
of at least 32 bytes. Tokens select an installed key using their protected `kid`.
Use independently generated random secrets. During planned rotation, install both
keys, issue new tokens with the new identifier, then remove the retired key after
the maximum token lifetime. A removed or unknown key is denied.

For compatibility, `AGENT_JWT_SECRET` supplies a single `legacy` key when no key
ring is configured. Only that single-key legacy configuration accepts an absent
`kid`. Workspace, version, lifetime, scope and token-ID requirements still apply.

Trusted configuration also supports:

- `GUARDRAIL_AUTHORIZATION_VERSION`: positive integer, default `1`. Both owner
  application metadata and agent claims must match it. Bumping it rejects older
  authorization claims even before their expiry.
- `GUARDRAIL_TOKENS_VALID_AFTER`: Unix seconds, default `0`. Tokens with `iat`
  at or before this cutoff are denied. New credentials must be issued afterward.
- `GUARDRAIL_REVOKED_TOKEN_IDS`: comma-separated JWT `jti` identifiers.
- `GUARDRAIL_REVOKED_SESSION_IDS`: comma-separated owner `session_id` identifiers.

These are startup configuration, not a distributed revocation database. Apply
changes to every replica through the trusted deployment process. A running replica
does not poll environment variables. Until replicas restart or tokens expire,
they retain their loaded key and revocation configuration. Hosted logout/session
revocation is not automatically queried on every request. Live operation therefore
still needs a demonstrated issuer lifecycle, coordinated rotation/revocation,
secret distribution, and deployment-level drills. No recovery path for the
independent one-way kill latch is added by identity rotation.

## Secrets and audit

Authentication failures return fixed error messages without JWTs, signing keys,
raw claim payloads, or verifier exception detail. Standard HTTP logging redacts
authorization, cookie, local gateway token, webhook signature, and set-cookie
headers. The identity module does not persist credentials. Authorized mutations
continue to record the established actor in the engine's append-only audit chain.
Unauthenticated requests fail before domain mutation and do not manufacture an
authenticated actor or append a domain mutation audit record. Dedicated retained
authentication-event telemetry remains a deployment task.

## Local evidence

`apps/guardrail-service/test/identity.test.ts` has 36 tests covering signed
cross-workspace rejection, issuer/audience and lifetime checks, malformed and
tampered tokens, role confusion, missing claims, owner allowlists, user-metadata
denial, scope reduction, owner controls, key overlap/removal, token/session
revocation, stale authorization versions, HTTP boundary checks, and credential
absence from audit and response data. The existing six server tests still pass,
including unchanged local simulation behavior and live financial denial. Tests
use a local JWKS resolver for owner signature verification; remote JWKS retrieval,
Supabase access-token issuance, and remote rotation remain unrun.

Commands:

```powershell
pnpm --filter @hotl/guardrail-service exec vitest run test/identity.test.ts test/server.test.ts
pnpm --filter @hotl/guardrail-service typecheck
```
