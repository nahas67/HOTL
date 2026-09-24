# HOTL implementation plan

Build the supplied commerce platform in a pnpm/Turborepo workspace. The implemented local simulation follows the six steps below; verification evidence and external launch gates are recorded in `docs/verification.md` and `docs/implementation-notes.md`.

1. Establish shared contracts, tooling, documentation, CI and local infrastructure.
2. Implement deterministic guardrails with durable local state, authentication, idempotency, audit chaining, spend reservations, refunds and pause enforcement; validate adversarial cases.
3. Build the owner cockpit and customer storefront with working API flows and explicit simulation mode.
4. Add commerce integration and LangGraph orchestration after guardrail tests pass, with checkpointing, owner interrupts and centrally mediated writes.
5. Implement an isolated emergency-stop service, Supabase migrations/RLS, LiteLLM configuration and deployment runbooks.
6. Install, typecheck, test, build and exercise the running application in the browser. Record external deployment prerequisites honestly.

Local development must work without paid API credentials. Simulation mode must be labeled, persisted and incapable of making live financial writes. Production mode must fail closed when required infrastructure or credentials are absent.
