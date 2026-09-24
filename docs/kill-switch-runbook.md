# Independent emergency-stop runbook

The kill service is an independent Node.js process with an fsync-before-response
append-only journal. It requires no main API or database to latch. It exposes no
disengage endpoint. It provides revocation **hooks**, not completed provider-specific
revocation integrations. An engaged latch does not prove outstanding provider work
has stopped; inspect every action result and provider-side evidence.

## Deploy independently

Use a separate cloud project/account, secret vault, deployment identity, network
ingress and persistent state volume. The primary application receives only the
read-state credential. It must not hold emergency deployment or revocation authority.
The owner needs an emergency URL reachable without the main cockpit.

`infra/kill-switch/Dockerfile` builds from its own package/lockfile.
`.github/workflows/kill-switch-ci.yml` tests it and exports an image artifact; it does
not deploy to a cloud account. The main CI has no emergency deployment secrets.
Copy the example environment to `.env.kill-switch` on the independent host, never
to a shared source checkout. Configure `HOTL_MODE=live`, a pinned owner allowlist,
independent Supabase Auth/JWKS URL and a strong state-read token.

Create the named volume `hotl-emergency-state` once. It must remain persistent across
releases and have write ownership for the container's `node` user. On the first
verified empty deployment only, set `KILL_SWITCH_ALLOW_INITIALIZE=true`. Start with:

```bash
docker volume create hotl-emergency-state
docker compose -f deploy.compose.yml up -d --build
```

After verifying that `/state/events.jsonl` exists, set initialization to false and
recreate the service against the **same** volume. Put a TLS reverse proxy in the
independent environment in front of the loopback-bound port. Run one writer replica
per journal; this implementation does not support multiple independent writers.

## Independent authority and hook contract

Each `KILL_HOOK_<ACTION>_URL` requires its matching `_TOKEN`. Live URLs require HTTPS.
Hooks must be hosted independently from the main stack and hold provider-specific,
revocation-only authority. The hook itself must verify that its effect completed;
a generic successful HTTP response is insufficient.

The service POSTs `{action,engagedAt,reason}` with bearer authorization and a stable
`Idempotency-Key`. A successful response is `{status:"succeeded",action:"<same action>"}`.
The seven actions are `queues_halted`, `storefront_maintenance_on`,
`litellm_keys_revoked`, `meta_token_revoked`, `tiktok_token_revoked`,
`supplier_key_revoked`, and `stripe_restricted_key_revoked`.

The queue hook must independently pause job intake and execution, remove queued work
as appropriate, and prove workers cannot resume financially consequential jobs. The
storefront hook must affect independent edge/origin maintenance control. Provider hooks
must use the provider's actual revocation/rotation mechanism and preserve confirmation
evidence. Implementations of those mechanisms are deployment prerequisites.

## Engage and inspect

In live mode, authenticate to the independent owner identity provider and supply an
owner JWT with a fresh password/OTP/MFA/WebAuthn authentication entry, no older than
five minutes. A newly refreshed JWT alone is not proof of reauthentication. POST
`/engage` with this bearer JWT, an `Idempotency-Key` of 8–200 characters, a reason and
`confirmationPhrase:"STOP EVERYTHING"`. HTTP 202 means the durable latch is engaged.

Read `GET /state` with the separate read bearer token. Verify `engaged=true`; then
inspect action states. `pending`, `failed`, and `unconfigured` never mean revoked.
Failed configured hooks retry every 30 seconds; `/retry` also requires recent owner
reauthentication and an idempotency key. Repeated engage cannot clear the latch and
does not rerun already successful actions.

Simulation reauthentication uses `/reauth` and a short-lived proof token. That local
password flow is unavailable in live mode. The guardrail denies new execution when
the independent state endpoint is engaged, unreachable, or malformed.

## Deployed drill

Use a disposable staging instance with test provider credentials and its own journal.
Record the deployment revision and account identities. Stop the main API, orchestrator,
and cockpit deliberately, leaving the independent emergency URL and revokers available.
Engage through that URL. Verify a durable latch, blocked customer execution, drained
or permanently halted queue work, and actual invalidation of every staged provider
credential. Restart the main stack and verify consequential actions stay denied.
Restart the emergency process against the same volume and verify it stays engaged.
Archive the journal, independent provider receipts, and logs with timestamps.

The automated unit drill demonstrates latching with unreachable hooks; it explicitly
asserts that revocation is **not** claimed. It is not evidence that this deployed
queue/token drill has passed.

## Recovery and failures

Never truncate, delete, or rewrite a latched journal. A failed process can leave its
exclusive `.lock` file. Before removing only that exact stale lock, an operator must
verify the recorded PID is not running and no other host/container owns the same
volume. Preserve the journal and inspect its integrity. Corrupt or incomplete journal
data requires incident review and restoration from verified independent backups;
do not initialize a fresh unengaged journal as a repair.

The journal hash chain has no independent head anchor and cannot resist a privileged
storage administrator rewriting it. Protect storage and archive signed/external
checkpoints before treating it as production tamper evidence.

Recover service in a **new explicitly provisioned instance** only after investigation,
verified outstanding-action reconciliation, credential re-provisioning, tested new
deployments, and owner sign-off. Retain the engaged instance and its evidence. There
is deliberately no automated reversal or reset button.
