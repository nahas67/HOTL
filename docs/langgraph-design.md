> Source design extracted from the user-supplied build prompt. Read [implementation notes](implementation-notes.md) for the actual runtime contract, deliberate corrections, and remaining production work. This section describes the target; it is not a claim that a production deployment exists.

## 5. Runtime Agent Swarm — LangGraph State Machine

This is the **product's own** multi-agent graph (not Codex subagents). Built with `@langchain/langgraph`. Exact `Annotation`/reducer syntax shifts between LangGraph.js versions — verify against current docs when `orchestration_builder` implements this — but the topology below is stable.

### 5.1 Shared state

```typescript
import { Annotation } from "@langchain/langgraph";

const CommerceState = Annotation.Root({
  runId: Annotation<string>,
  cycle: Annotation<"daily" | "weekly" | "monthly">,
  targets: Annotation<{
    revenueTarget: number;
    marginFloor: number;      // 0.40
    adSpendCeiling: number;   // daily, absolute
  }>,
  telemetry: Annotation<{
    revenueToDate: number;
    marginToDate: number;
    adSpendToday: number;
  }>,
  productDrafts: Annotation<ProductDraft[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  campaignDrafts: Annotation<CampaignDraft[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  supplierOrders: Annotation<SupplierOrder[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  supportTickets: Annotation<TicketState[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  guardrailDecisions: Annotation<GuardrailDecision[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  killSwitchEngaged: Annotation<boolean>({ default: () => false }),
});
```

### 5.2 Graph topology

| Node | Kind | Job | Calls guardrail-service? |
|---|---|---|---|
| `kill_switch_watcher` | guard, runs first every cycle | Checks `kill_switch_state`; if engaged, routes straight to `halted` | read-only check |
| `master_orchestrator` | planner | Splits monthly targets into daily milestones, routes to department subgraphs | no |
| `sourcing.trend_scan` | tool | Pulls TikTok/Google Trends signals | no |
| `sourcing.supplier_query` | tool | Queries CJ Dropshipping/AliExpress for candidate SKUs + landed cost | no |
| `sourcing.margin_gate` | **guardrail call** | `POST /listing/margin-check` | yes |
| `sourcing.publish_or_reject` | branch | allow → queue listing draft; deny → log + retry sourcing | — |
| `marketing.copy_and_creative` | tool | Drafts ad copy + image variants | no |
| `marketing.spend_gate` | **guardrail call** | `POST /spend/check` before requesting platform spend | yes |
| `marketing.launch_or_hold` | branch | allow → call Meta/TikTok Ads API; deny → hold, notify orchestrator | — |
| `order.stock_sync` | tool | Polls Medusa inventory + supplier stock | no |
| `order.reorder_and_fulfill` | tool | Places supplier POs, updates shipment tracking | optional, for large POs |
| `support.triage` | tool | Classifies inbound ticket | no |
| `support.refund_gate` | **guardrail call** | `POST /refunds/evaluate` | yes |
| `support.resolve_or_escalate` | branch → interrupt | ≤$25 auto-resolves; >$25 → `human_interrupt` | — |
| `human_interrupt` | `interrupt()` call | Pauses graph, writes an `interrupts` row, waits for `Command(resume=…)` | — |
| `halted` | terminal | No-op end state while kill switch is engaged | — |

### 5.3 Guardrail gate + interrupt pattern (sketch)

```typescript
async function refundGate(state: typeof CommerceState.State) {
  const ticket = state.supportTickets.at(-1)!;
  const decision = await guardrailClient.evaluateRefund({
    orderId: ticket.orderId,
    amount: ticket.refundAmount,
    currency: ticket.currency,
    reasonCode: ticket.reasonCode,
    requestedBy: "support_agent",
  });

  if (decision.decision === "allow") {
    return { supportTickets: [{ ...ticket, status: "auto_resolved" }] };
  }

  // Escalate: pause the graph and surface the case to the owner.
  const ownerDecision = interrupt({
    category: "refund_escrow",
    orderId: ticket.orderId,
    amount: ticket.refundAmount,
    reason: decision.reason,
  });

  return {
    supportTickets: [{ ...ticket, status: ownerDecision.decision, resolutionNote: ownerDecision.note }],
  };
}
```

Resuming from the cockpit's API route, after the owner acts:

```typescript
await graph.invoke(
  new Command({ resume: { decision: "approve", note: "Customer verified via photo." } }),
  { configurable: { thread_id: runId } }
);
```

### 5.4 Checkpointing

Use a Postgres checkpointer pointed at the shared Supabase database so an interrupted run resumes exactly where it left off, even across a service restart. `thread_id` = `runId`, so the cockpit only needs to track `runId` to resume any paused thread.

---

