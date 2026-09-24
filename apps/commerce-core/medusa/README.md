# Medusa staging adapter

This optional Medusa 2.20.1 application is integration groundwork. The runnable
HOTL storefront uses the separate local simulation gateway in `../src`, not this
application. **Live checkout, card charges, captures, and refunds are unavailable.**
The central `/api/guardrails/v1/medusa/payments` endpoints are not implemented by the
current guardrail service; the bridge rejects their 404 responses. No simulation
receipt can complete a Medusa payment.

## Implemented integration

- Medusa config loads its native catalog, cart, order, inventory, and payment modules,
  the Redis event bus, and the custom `hotl-guarded` payment provider.
- Every payment provider mutation calls the authenticated central guardrail bridge.
  Medusa's context idempotency key is scoped by operation, and retries return to the
  central service. This adapter holds no Stripe, advertising, or supplier write key.
- A successful bridge response must confirm `mode: live`, `executed: true`, the
  matching operation and payment reference, a durable receipt ID, and the expected
  status. Policy-only allow, escalation, denial, malformed responses, missing
  endpoints, network failure, and simulation receipts all fail closed. Payment
  status is retrieved centrally, never trusted from caller-provided session data.
- Native order and inventory subscribers publish resource references to the
  `commerce-events` BullMQ queue. Stable Medusa event metadata provides retry
  deduplication. Queue errors propagate so the Redis event bus can retry delivery;
  failed jobs are retained and completed jobs remain for seven days.
- All native admin and store mutations return 503 pending audited central
  workflows, including checkout through Medusa's default system payment provider.
  Read APIs remain available. Unverified payment webhooks return `not_supported`.

## Install and verify independently

This nested staging application is intentionally outside the root pnpm workspace
release pipeline. Its separate install must not alter the root dependency lock.
Use Node.js 22 and run these commands from this directory. Configure the required
environment variables described below before `npm run build` or server startup:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
```

If a lockfile has not been generated yet, use `npm install --ignore-scripts` for the
initial install. Unit tests use an in-process HTTP fixture and injected responses;
the fixture's `mode: live` labels only exercise response validation and are not
evidence of provider execution. They cover payment denial, receipt binding,
idempotency forwarding, forged state, webhook rejection, event deduplication,
and Redis connection configuration. The native mutation-denial tests also cover
the default system provider bypass.

Verified on 2026-09-08 with the available Node.js 25.9.0 runtime: typecheck passed
and all 25 tests passed. Medusa build is checked for actual generated JavaScript,
not only a zero exit code; the CLI can report success for a `noEmit` configuration.
The build uses compile-only environment values and does not connect to a provider.
Node.js 22 staging execution, database migrations, Redis delivery, and real payment
or emergency-stop integrations still require their own infrastructure checks.

## Staging configuration and remaining work

Copy `.env.example` to `.env` and replace its placeholder secrets before starting.
Use a separate Medusa database/schema, an available Redis server, and a narrowly
scoped service credential for the guardrail bridge. The central service must own
all provider write credentials; do not configure Medusa's direct Stripe provider.
`MEDUSA_JWT_SECRET` and `MEDUSA_COOKIE_SECRET` are application secrets, not provider
credentials. The admin UI is disabled. Database migration is `npm run db:migrate`;
the server command is `npm run dev` on port 9000.

Do not expose this staging application as a production checkout. The following
work remains before live use:

1. Implement central payment operations with authoritative cart/session ownership,
   price and margin validation, currency/minor-unit conversion, pause/kill checks,
   atomic request/actor/operation binding, provider execution, durable audit, and
   reconciliation of uncertain outcomes. Cached allow decisions must never confer
   new execution authority.
2. Implement a signed central payment webhook contract and guarded native catalog,
   pricing, checkout, and admin workflows before replacing the current blanket
   denial of native commerce writes.
3. Connect `commerce-events` to the runtime consumer and exercise actual Redis
   delivery, duplicate/retry handling, retention, and restart behavior. The local
   simulation's separate webhook worker does not automatically consume this queue.
4. Run Medusa database migrations, full checkout/payment/webhook staging tests,
   authenticated ownership and replay drills, and the independently deployed kill
   drill. These require provisioned infrastructure and integrations; unit tests and
   a compilation alone do not demonstrate them.

API reference: [Medusa payment providers](https://docs.medusajs.com/resources/commerce-modules/payment/payment-provider),
[Redis event module](https://docs.medusajs.com/resources/architectural-modules/event/redis),
and [subscriber event payloads](https://docs.medusajs.com/learn/fundamentals/events-and-subscribers/data-payload).
