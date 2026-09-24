# Infrastructure and production runbook

The application currently runs in simulation. This document prepares a deployment;
it does not claim the live financial adapters or a cloud environment exist.

The continuation implements a narrowly gated, owner-only Shopify development-store
price adapter with local fixture coverage. Its [staging procedure](shopify-closed-loop.md)
and [evidence ledger](continuation-verification.md) govern that exception. Normal
merchant writes, autonomous prices and the other live financial adapters remain
disabled. Use the [production identity contract](production-identity.md) for exact
workspace/session/token requirements; a role claim alone is insufficient.

## Optional local infrastructure

Copy `infra/.env.example` to `infra/.env` and set unique development passwords and
LiteLLM administration/salt keys. Compose interpolation requires those keys even when
the model profile is disabled. Do not commit this file.

```powershell
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d postgres redis
```

The Postgres bootstrap applies only when its data volume is first initialized. The
Auth shim is for local SQL/RLS checks only. Never apply it to a real Supabase project.
For an existing database, apply new reviewed migrations with a migration administrator;
do not delete a volume to force initialization.

To verify SQL independently in a disposable container, run from Bash with Docker:

```bash
bash infra/scripts/test-database.sh
```

The script never uses `DATABASE_URL`, creates a uniquely named temporary Postgres
container, applies the Auth shim then production migration, runs RLS and adversarial
financial tests, and removes only that container. Main CI calls this exact script.

## LiteLLM provisioning

Set a supported provider-prefixed `LITELLM_RUNTIME_MODEL`, its provider API key,
independent strong `LITELLM_MASTER_KEY`, persistent `LITELLM_SALT_KEY`, and a budget
alert webhook in `infra/.env`. The optional Compose image uses a floating upstream
tag for development; validate and pin an immutable image digest for staging.

```powershell
docker compose --env-file infra/.env -f infra/docker-compose.yml --profile models up -d litellm
```

The proxy administrator runs `node infra/scripts/provision-litellm-keys.mjs` with
`LITELLM_URL`, `LITELLM_MASTER_KEY`, and `LITELLM_KEYS_OUTPUT` set in its environment.
The output must be a new secret-file path outside version control. No issued key is
printed; partial issuance attempts rollback. On Windows, enforce filesystem ACLs
through the secret store because Unix file-mode bits alone do not set Windows ACLs.

Provisioned virtual keys allow only `runtime-fast`, expire in 30 days, and have a
one-day budget window. Master/sourcing/marketing/support each receive $2/day and
operations $1/day; request/token limits are set per agent in the script. Transfer
only each scoped virtual key into its runtime secret. The coordinator uses
`LITELLM_ORCHESTRATOR_KEY`; `LITELLM_MASTER_KEY` is exclusively the proxy
administration key and must never reach a runtime process. Keep proxy and
application environments separate. The default runtime model alias is `runtime-fast`,
matching the proxy configuration and provisioned virtual-key model allowance.
Validate budget rejection and receipt of the alert in staging before permitting
scheduled runs. These model budget limits are separate from commerce/ad ceilings.

## Production preparation

1. Provision Supabase and an owner identity with pinned subject and owner app metadata.
   Apply the production migration without the local shim. Review RLS using two owners
   and a non-owner. Server credentials remain outside browsers and runtime agent jobs.
2. Provision and deploy the [guardrail Postgres runtime ledger](postgres-runtime.md). Bind financial
   mutations, audit append, idempotency and outbox records within transactions. Add
   one-time refund approval binding, isolated stop freshness, contention/restart tests,
   backup restoration and externally anchored audit retention.
3. Complete Medusa/Stripe, supplier, ad and support provider adapters behind that
   boundary. Validate signatures, provider idempotency, uncertain receipt reconciliation,
   overspend races, duplicate callbacks, and refunds against paid balances.
4. Configure independent owner authentication, short-lived per-agent JWT issuance,
   per-agent LiteLLM keys, Redis workers, verified Postgres checkpoints, and the cockpit's
   durable interrupt/realtime path. Reject all local demonstration credentials.
5. Deploy and verify the emergency plane using [the kill-switch runbook](kill-switch-runbook.md).
   Record separate account/project identities, secret access policies and provider
   revocation authority. Perform the main-stack-down drill on the deployed system.
6. Run staging with the owner's explicitly approved supplier, ad ceiling, refund pool
   and production content. Obtain the Phase 8 owner sign-off before raising limits.

No environment-variable toggle completes these steps. `LIVE_ADAPTERS_UNAVAILABLE`
remains a deliberate denial on existing financial paths. The separate Shopify
development-store capability cannot be promoted to ordinary merchant or autonomous
execution without its own real evidence and resolution of the documented race and
recovery limitations.
