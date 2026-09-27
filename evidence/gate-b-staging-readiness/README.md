# Gate B staging configuration preflight

**Date:** 2026-09-24 (Asia/Calcutta)

**Result:** BLOCKED. This is a static configuration check, not deployed identity, TLS, database, emergency or provider evidence.

The owner confirmed that an authorized Shopify development store, development app and trusted public HTTPS callback/webhook URLs are **not set up yet**. The owner also has not chosen Gate A pilot economics and risk limits. No real Shopify operation was attempted.

`node --test tests/staging-readiness.test.mjs` passed **4 tests** for a structurally complete fixture, denial of simulation/unsafe settings, rejection of IP/local webhook origins, and redaction of configuration values. `node scripts/staging-readiness.mjs` against the current process environment exited nonzero and reported missing live mode, dedicated workspace/database, owner identity, trusted HTTPS origins, app credentials/allowlist/scopes, connector encryption key and independent emergency reader. The checker reports field names and reasons, never configured credential values.

Passing the checker in a future environment would mean only that required configuration strings have the expected shape. It cannot verify a real TLS certificate, deployment separation, database grants/RLS, provider development-store identity, app permissions, webhook delivery, emergency revocation or restore. Those require the separate Gate B/C evidence in the [mandate](../../docs/gates-a-c-implementation-mandate.md).
