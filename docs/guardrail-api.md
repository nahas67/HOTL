> Source design extracted from the user-supplied build prompt. Read [implementation notes](implementation-notes.md) for the actual runtime contract, deliberate corrections, and remaining production work. This section describes the target; it is not a claim that a production deployment exists.

## 6. Deterministic Guardrail Middleware — API Contracts

Base path: `/api/guardrails/v1`. All calls from runtime agents use a short-lived service JWT scoped to that agent only. The owner cockpit calls a separate owner-scoped set (config, kill-switch, interrupt resolution) authenticated via Supabase Auth session.

| Endpoint | Method | Purpose | Idempotent? |
|---|---|---|---|
| `/spend/check` | POST | Pre-flight check before requesting ad spend | no (read) |
| `/spend/commit` | POST | Records confirmed spend after platform confirms | yes (`Idempotency-Key`) |
| `/listing/margin-check` | POST | Pre-flight check before publishing a listing | no (read) |
| `/refunds/evaluate` | POST | Auto-approve ≤ threshold, else create an interrupt | yes |
| `/interrupts/:id/resolve` | POST | Owner resolves a pending interrupt, resumes the graph | yes |
| `/kill-switch/engage` | POST | Irreversible full stop | yes, but only fires once |
| `/pause/engage` / `/pause/release` | POST | Reversible hold, no infra teardown | yes |
| `/guardrails/config` | GET / PATCH | Read ceilings/floors; PATCH is owner-only | — |
| `/audit-log` | GET | Query the append-only log | — |

**Common error envelope:**
```json
{ "error": { "code": "MARGIN_BELOW_FLOOR", "message": "string", "details": {} } }
```

**`POST /spend/check`**
```json
// request
{ "agentId": "marketing_agent", "campaignId": "string", "requestedAmount": 25.00, "currency": "USD" }
// response (allow)
{ "decision": "allow", "remainingDailyBudget": 75.00, "ceiling": 100.00 }
// response (deny)
{ "decision": "deny", "reason": "DAILY_CEILING_EXCEEDED", "remainingDailyBudget": 0, "ceiling": 100.00 }
```

**`POST /listing/margin-check`**
```json
// request
{ "sku": "string", "sellingPrice": 29.99, "landedCost": 9.50, "estimatedCac": 6.00, "currency": "USD" }
// response
{ "decision": "allow", "marginPct": 0.483, "floor": 0.40 }
```
`marginPct = (sellingPrice - landedCost - estimatedCac) / sellingPrice`; deny if `< floor`.

**`POST /refunds/evaluate`**
```json
// request
{ "orderId": "string", "amount": 42.00, "currency": "USD", "reasonCode": "item_not_as_described", "requestedBy": "support_agent" }
// response (auto-approved, <= $25)
{ "decision": "allow", "refundId": "string" }
// response (escalated, > $25)
{ "decision": "escalated", "interruptId": "uuid", "threshold": 25.00 }
```

**`POST /interrupts/:id/resolve`**
```json
// request
{ "decision": "approve", "modifiedPayload": null, "note": "string", "resolvedBy": "owner_user_id" }
// response
{ "status": "resolved", "resumedThreadId": "string" }
```

**`POST /kill-switch/engage`**
```json
// request
{ "reason": "string", "requestedBy": "owner_user_id", "confirmationPhrase": "STOP EVERYTHING" }
// response
{
  "status": "engaged",
  "engagedAt": "ISO8601",
  "actionsTaken": ["queues_drained", "storefront_maintenance_on", "meta_token_revoked", "tiktok_token_revoked", "supplier_key_rotated"]
}
```
No matching disengage endpoint exists — see Section 7.4.

---

