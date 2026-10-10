import { Annotation, END, START, StateGraph, interrupt } from '@langchain/langgraph';
import { createHash } from 'node:crypto';
import type { CommerceOrder, Product } from '@hotl/schemas';
import { draftWithLiteLLM, type AgentContext, type AgentId, type GuardrailGateway, type Result } from './client.js';
import { decisionDomain, pausedDomainForStage, stageDomains } from './domains.js';

type Stage = 'catalog' | 'campaign' | 'supplier' | 'refund';
type Log = { node: string; summary: string; decision?: string };
export type ActionPlan = {
  stage: Stage; agent: AgentId; path: string; body: Record<string, unknown>; key: string;
  context: AgentContext; objective: string;
};
const replace = <T>(_old: T, next: T) => next;
export const CommerceState = Annotation.Root({
  runId: Annotation<string>(),
  cycle: Annotation<'daily' | 'weekly' | 'monthly'>(),
  status: Annotation<'running' | 'interrupted' | 'completed' | 'halted' | 'failed'>({ reducer: replace, default: () => 'running' }),
  targets: Annotation<{ revenueTarget: number | null; marginFloor: number; adSpendCeiling: number } | null>({ reducer: replace, default: () => null }),
  telemetry: Annotation<{ revenueToDate: number; marginToDate: number; adSpendToday: number } | null>({ reducer: replace, default: () => null }),
  productDrafts: Annotation<Product[]>({ reducer: replace, default: () => [] }),
  campaignDrafts: Annotation<string[]>({ reducer: replace, default: () => [] }),
  supplierOrders: Annotation<CommerceOrder[]>({ reducer: replace, default: () => [] }),
  supportTickets: Annotation<{ orderId: string; amount: number }[]>({ reducer: replace, default: () => [] }),
  planningContexts: Annotation<Partial<Record<AgentId, AgentContext>>>({ reducer: (old, next) => ({ ...old, ...next }), default: () => ({}) }),
  plan: Annotation<ActionPlan | null>({ reducer: replace, default: () => null }),
  activeStage: Annotation<Stage>({ reducer: replace, default: () => 'catalog' }),
  replanCounts: Annotation<Partial<Record<Stage, number>>>({ reducer: (old, next) => ({ ...old, ...next }), default: () => ({}) }),
  replanning: Annotation<boolean>({ reducer: replace, default: () => false }),
  supplierFinished: Annotation<string[]>({ reducer: (old, next) => [...new Set([...old, ...next])], default: () => [] }),
  resolvedInterruptIds: Annotation<string[]>({ reducer: (old, next) => [...new Set([...old, ...next])], default: () => [] }),
  guardrailDecisions: Annotation<Result[]>({ reducer: (old, next) => [...old, ...next], default: () => [] }),
  lastDecision: Annotation<Result>({ reducer: replace, default: () => ({}) }),
  interruptId: Annotation<string | null>({ reducer: replace, default: () => null }),
  logs: Annotation<Log[]>({ reducer: (old, next) => [...old.filter(item => !next.some(n => n.node === item.node)), ...next], default: () => [] }),
  killSwitchEngaged: Annotation<boolean>({ reducer: replace, default: () => false }),
});
export type State = typeof CommerceState.State;
type Update = Partial<State>;
type Checkpointer = NonNullable<Parameters<StateGraph<typeof CommerceState.spec>['compile']>[0]>['checkpointer'];
const stageAgents: Record<Stage, AgentId> = { catalog: 'sourcing_agent', campaign: 'marketing_agent', supplier: 'order_agent', refund: 'support_agent' };
const planningNodes = { catalog: 'sourcing_trend_scan', campaign: 'marketing_copy_and_creative', supplier: 'order_stock_sync', refund: 'support_triage' } as const;
const followingNodes = { catalog: 'marketing_copy_and_creative', campaign: 'marketing_launch_or_hold', supplier: 'order_stock_sync', refund: 'support_resolve_or_escalate' } as const;
const staleReasons = new Set(['RESOURCE_CHANGED', 'CONSTITUTION_CHANGED', 'AGENT_CONTEXT_REQUIRED']);
const lineId = (orderId: unknown, productId: unknown) => `${orderId}:${productId}`;

export function createCommerceGraph(gateway: GuardrailGateway, checkpointer: Checkpointer, options: { refundAmount?: number; campaignAmount?: number } = {}) {
  async function event(state: State, agent: AgentId, name: string, status: State['status'], summary: string) {
    const scope = createHash('sha256').update(JSON.stringify([name, status, state.plan?.key, state.interruptId, state.replanCounts])).digest('hex').slice(0, 24);
    const result = await gateway.execute(agent, '/runs/event', { runId: state.runId, cycle: state.cycle, status, agentId: agent, summary }, `${state.runId}:event:${scope}`);
    if (result.decision === 'deny') throw new Error(`Run audit denied: ${result.reason}`);
  }
  const stopped = (current: Awaited<ReturnType<GuardrailGateway['status']>>) => current.status !== 'running' || current.paused || current.killSwitch.engaged || current.killSwitch.reachable === false;
  function node(name: string, agent: AgentId, summary: string, action: (state: State) => Promise<Update> | Update) {
    return async (state: State): Promise<Update> => {
      const current = await gateway.status();
      if (stopped(current)) return { status: 'halted', killSwitchEngaged: current.killSwitch.engaged, logs: [{ node: name, summary: 'Cycle stopped by platform controls.' }] };
      await event(state, agent, name, 'running', summary);
      return { logs: [{ node: name, summary }], ...await action(state) };
    };
  }
  function key(state: State, stage: Stage, original: string) {
    const attempt = state.replanCounts?.[stage] ?? 0;
    return `${state.runId}:${original}${attempt ? `:replan:${attempt}` : ''}`;
  }
  function planned(state: State, stage: Stage, context: AgentContext, path: string, body: Record<string, unknown>, suffix: string, objective: string): ActionPlan {
    return { stage, agent: stageAgents[stage], context, path, body: { ...body, expectedConstitutionVersion: context.constitution.version }, key: key(state, stage, suffix), objective };
  }
  function skip(stage: Stage, reason: string, context: AgentContext): Update {
    return { activeStage: stage, plan: null, replanning: false, lastDecision: { decision: 'skip', reason }, planningContexts: { [stageAgents[stage]]: context } };
  }
  async function execute(state: State): Promise<Update> {
    const plan = state.plan;
    // A skipped stage has no action to authorize, so nothing is pending an owner.
    if (!plan) return { lastDecision: { decision: 'skip' }, interruptId: null };
    // The preceding node checkpoints this exact body and key. A replayed allow
    // never causes a separate provider action in the runtime graph.
    const decision = await gateway.execute(plan.agent, plan.path, plan.body, plan.key);
    // Always assign. This field means "the interrupt this run is waiting on",
    // not "the last interrupt id ever seen". Carrying a resolved id forward
    // would advertise an approval the owner already decided, and would let an
    // escalation carrying no id resume against the wrong proposal.
    const interruptId = decision.decision === 'escalated' ? decision.interruptId ?? null : null;
    // Name the owner autonomy domain a refusal came from. Without this a run log records "denied"
    // and leaves the owner to guess which of twenty domain policies stopped the cycle.
    const domain = decisionDomain(decision);
    const logs: Log[] = domain
      ? [{ node: `guardrail.${domain}`, summary: `${plan.objective} — ${decision.decision === 'escalated' ? 'awaiting an owner decision' : `refused (${String(decision.reason ?? 'GUARDRAIL_DENIED')})`} under the ${domain} autonomy domain` }]
      : [];
    return { lastDecision: decision, guardrailDecisions: [decision], interruptId, logs,
      ...(plan.stage === 'supplier' && decision.decision !== 'escalated' && !staleReasons.has(decision.reason ?? '') ? { supplierFinished: [lineId(plan.body.orderId, plan.body.productId)] } : {}) };
  }
  /**
   * Skip a stage whose governing autonomy domain the owner has paused.
   *
   * The guardrail would deny this action anyway with `DOMAIN_PAUSED`; skipping first means the run
   * never spends an owner decision or a proposal slot on work that is certain to be refused. Only
   * PAUSE is honoured here -- MANUAL and COPILOT still go to the guardrail so the authoritative
   * decision is recorded in the run's decision log.
   */
  function paused(stage: Stage, context: AgentContext): Update | null {
    const domain = pausedDomainForStage(context, stage);
    return domain ? skip(stage, `DOMAIN_PAUSED:${domain}`, context) : null;
  }
  function afterAction(state: State) {
    if (state.status === 'halted') return 'halted';
    if (state.lastDecision.decision === 'escalated' && state.interruptId) return 'human_interrupt';
    if (staleReasons.has(state.lastDecision.reason ?? '') && state.plan) return 'replan';
    return followingNodes[state.activeStage];
  }
  const builder = new StateGraph(CommerceState)
    .addNode('kill_switch_watcher', async state => {
      const current = await gateway.status(), halted = stopped(current);
      await event(state, 'master_orchestrator', 'kill_switch_watcher', halted ? 'halted' : 'running', halted ? 'Cycle blocked by platform controls' : 'Platform controls verified');
      return { status: halted ? 'halted' as const : 'running' as const, killSwitchEngaged: current.killSwitch.engaged };
    })
    .addNode('master_orchestrator', node('master_orchestrator', 'master_orchestrator', 'Preparing department objectives from the current Business Constitution', async state => {
      const context = await gateway.context('master_orchestrator');
      await draftWithLiteLLM('master_orchestrator', `Plan a ${state.cycle} commerce cycle. Owner goals: ${JSON.stringify(context.constitution.goals)}. Policy version: ${context.constitution.version}. All actions require deterministic guardrail authorization.`);
      return { planningContexts: { master_orchestrator: context }, targets: { revenueTarget: null, marginFloor: context.constitution.marginFloor, adSpendCeiling: context.constitution.dailyAdSpendCeiling } };
    }))
    .addNode('sourcing_trend_scan', node('sourcing.trend_scan', 'sourcing_agent', 'Reviewing local catalog candidates; no external trend feed is connected', async state => {
      const context = await gateway.context('sourcing_agent');
      const held = paused('catalog', context);if(held)return held;
      const prior = state.replanning && state.plan?.stage === 'catalog' ? state.plan : null;
      const product = prior ? context.products.find(p => p.id === prior.body.productId) : context.products.find(p => p.status !== 'active');
      // An owner edit invalidates the old publish intent. Do not merely refresh
      // a revision token and then override the human's current catalog choice.
      if (!product || product.status === 'active' || (prior && product.revision !== prior.body.expectedRevision))
        return { ...skip('catalog', prior ? 'HUMAN_CATALOG_CHANGE_OBSERVED' : 'NO_CATALOG_CANDIDATE', context), productDrafts: [] };
      return { activeStage: 'catalog', replanning: false, planningContexts: { sourcing_agent: context }, productDrafts: [product], plan: planned(state, 'catalog', context, '/listing/publish', { productId: product.id, expectedRevision: product.revision, runId: state.runId }, 'publish', 'Evaluate the current catalog draft for publication') };
    }))
    .addNode('sourcing_supplier_query', node('sourcing.supplier_query', 'sourcing_agent', 'Reading candidate cost evidence from the saved catalog snapshot', () => ({})))
    .addNode('sourcing_margin_gate', node('sourcing.margin_gate', 'sourcing_agent', 'Requesting a deterministic listing margin evaluation', async state => {
      const product = state.productDrafts[0];
      if (!product || !state.plan) return { lastDecision: { decision: 'skip' }, interruptId: null };
      const decision = await gateway.execute('sourcing_agent', '/listing/margin-check', { sku: product.sku, sellingPrice: product.price, landedCost: product.landedCost, estimatedCac: product.estimatedCac, currency: 'USD' }, key(state, 'catalog', 'margin'));
      return { lastDecision: decision, guardrailDecisions: [decision], interruptId: null };
    }))
    .addNode('sourcing_publish_or_reject', node('sourcing.publish_or_reject', 'sourcing_agent', 'Submitting the saved listing intent to guardrails when its margin passes', state => state.lastDecision.decision === 'allow' ? execute(state) : {}))
    .addNode('marketing_copy_and_creative', node('marketing.copy_and_creative', 'marketing_agent', 'Preparing a campaign proposal against current advertising policy', async state => {
      const context = await gateway.context('marketing_agent');
      const held = paused('campaign', context);if(held)return held;
      const campaignId = `campaign-${state.runId}`;
      if (context.campaigns.some(c => c.campaignId === campaignId)) return skip('campaign', 'EXISTING_CAMPAIGN_OBSERVED', context);
      const copy = await draftWithLiteLLM('marketing_agent', 'Write a short, truthful everyday-essentials campaign. Do not invent reviews, scarcity, or health benefits.');
      return { activeStage: 'campaign', replanning: false, planningContexts: { marketing_agent: context }, campaignDrafts: [copy], plan: planned(state, 'campaign', context, '/campaigns/launch', { agentId: 'marketing_agent', campaignId, requestedAmount: options.campaignAmount ?? 12, currency: 'USD', runId: state.runId, expectedRevision: 0 }, 'campaign', 'Evaluate one campaign within current owner policy') };
    }))
    .addNode('marketing_spend_gate', node('marketing.spend_gate', 'marketing_agent', 'Requesting atomic campaign authorization and execution from guardrails', execute))
    .addNode('marketing_launch_or_hold', node('marketing.launch_or_hold', 'marketing_agent', 'Recording the campaign decision without separate provider execution', () => ({})))
    .addNode('order_stock_sync', node('order.stock_sync', 'order_agent', 'Reconciling open order lines with current supplier purchase receipts', async state => {
      const context = await gateway.context('order_agent');
      const held = paused('supplier', context);if(held)return held;
      const selected = state.supplierOrders[0];
      const order = selected ? context.orders.find(o => o.id === selected.id) : context.orders.find(o => o.status === 'processing');
      const item = order?.status === 'processing' ? order.items.find(i => !(state.supplierFinished ?? []).includes(lineId(order.id, i.productId)) && !context.supplierOrders.some(p => p.orderId === order.id && p.productId === i.productId)) : undefined;
      const product = context.products.find(p => p.id === item?.productId);
      if (!order || !item || !product) return { ...skip('supplier', 'NO_UNFULFILLED_ORDER_LINE', context), supplierOrders: order ? [order] : state.supplierOrders };
      return { activeStage: 'supplier', replanning: false, planningContexts: { order_agent: context }, supplierOrders: [order], plan: planned(state, 'supplier', context, '/supplier-orders', { productId: item.productId, quantity: item.quantity, orderId: order.id, runId: state.runId, expectedRevision: product.revision, expectedOrderRevision: order.revision }, `supplier:${order.id}:${item.productId}`, 'Fulfill the next unpurchased line of the selected paid order') };
    }))
    .addNode('order_reorder_and_fulfill', node('order.reorder_and_fulfill', 'order_agent', 'Submitting one supplier line through mandatory purchase and fulfillment policy', execute))
    .addNode('support_triage', node('support.triage', 'support_agent', 'Checking the explicit simulation support case against current order state', async state => {
      const context = await gateway.context('support_agent');
      if (context.mode !== 'simulation') return { ...skip('refund', 'NO_CONNECTED_SUPPORT_REQUEST', context), supportTickets: [] };
      const held = paused('refund', context);if(held)return { ...held, supportTickets: [] };
      const prior = state.replanning && state.plan?.stage === 'refund' ? state.plan : null;
      const amount = options.refundAmount ?? 42;
      // Candidate selection only. Whether a refund is permitted -- the balance arithmetic and
      // the order state it depends on -- is decided solely by the guardrail at /refunds/evaluate.
      // This node previously reimplemented that policy (minor-unit rounding plus a
      // `status === 'delivered'` restriction the guardrail does not apply), which is forbidden:
      // an agent must not carry policy math. It had already drifted: the guardrail marks an
      // order `partially_refunded` after any partial refund, so this filter silently stopped
      // proposing refunds the guardrail still permits.
      // `NO_PENDING_REFUND_FOR_ORDER` is orchestration bookkeeping (an interrupt already awaits
      // this order), not financial policy, so it stays here.
      const eligible = (o: CommerceOrder) => !context.interrupts.some(i => i.status === 'pending' && ((i.payload.request as Record<string, unknown> | undefined) ?? i.payload).orderId === o.id);
      const order = prior ? context.orders.find(o => o.id === prior.body.orderId && eligible(o)) : context.orders.find(eligible);
      if (!order || (prior && order.revision !== prior.body.expectedRevision)) return { ...skip('refund', prior ? 'HUMAN_ORDER_CHANGE_OBSERVED' : 'NO_ELIGIBLE_SUPPORT_CASE', context), supportTickets: [] };
      return { activeStage: 'refund', replanning: false, planningContexts: { support_agent: context }, supportTickets: [{ orderId: order.id, amount }], plan: planned(state, 'refund', context, '/refunds/evaluate', { orderId: order.id, amount, currency: 'USD', reasonCode: 'simulation_customer_request', requestedBy: 'support_agent', runId: state.runId, expectedRevision: order.revision }, 'refund', 'Evaluate the unchanged simulation customer refund request') };
    }))
    .addNode('support_refund_gate', node('support.refund_gate', 'support_agent', 'Submitting the saved refund request to deterministic guardrails', execute))
    .addNode('support_resolve_or_escalate', node('support.resolve_or_escalate', 'support_agent', 'Recording the support outcome', () => ({})))
    .addNode('replan', node('replan', 'master_orchestrator', 'Invalidating stale intent and rereading current owner policy and resource evidence', state => {
      const stage = state.plan?.stage ?? state.activeStage, count = (state.replanCounts?.[stage] ?? 0) + 1;
      if (count > 2) return { status: 'halted', lastDecision: { decision: 'deny', reason: 'REPLAN_LIMIT_REACHED' }, guardrailDecisions: [{ decision: 'deny', reason: 'REPLAN_LIMIT_REACHED', stage }] };
      return { activeStage: stage, replanCounts: { [stage]: count }, replanning: true, lastDecision: { decision: 'replan' } };
    }))
    .addNode('human_interrupt', async state => {
      // Keep this original node ID for existing persisted refund checkpoints.
      const stage = state.plan?.stage ?? 'refund';
      await event(state, stageAgents[stage], 'human_interrupt', 'interrupted', `${stage} action awaits an authenticated owner decision`);
      const decision = interrupt({ category: stage === 'refund' ? 'refund_escrow' : stage, interruptId: state.interruptId, runId: state.runId, objective: state.plan?.objective }) as { status: string; note?: string };
      const expired = decision.status === 'expired';
      return { status: 'running' as const, activeStage: stage, lastDecision: expired ? { decision: 'deny', reason: 'CONSTITUTION_CHANGED', replan: true } : { decision: decision.status },
        resolvedInterruptIds: state.interruptId ? [state.interruptId] : [],
        // The owner decision is consumed here. The id moves to
        // resolvedInterruptIds, so it must stop being advertised as pending.
        interruptId: null,
        ...(stage === 'supplier' && !expired && state.plan ? { supplierFinished: [lineId(state.plan.body.orderId, state.plan.body.productId)] } : {}),
        logs: [{ node: 'human_interrupt', summary: expired ? 'The saved proposal expired; current evidence must be evaluated again.' : `Owner decision: ${decision.status}` }] };
    })
    .addNode('completed', async state => { await event(state, 'master_orchestrator', 'completed', 'completed', 'Department cycle completed; decisions are recorded in the audit trail'); return { status: 'completed' as const }; })
    .addNode('halted', async state => { await event(state, 'master_orchestrator', 'halted', 'halted', 'Department cycle halted; no further actions will execute'); return { status: 'halted' as const }; });

  type NodeId = Parameters<typeof builder.addConditionalEdges>[0];
  const connect = (from: NodeId, target: NodeId) => builder.addConditionalEdges(from, state => state.status === 'halted' ? 'halted' : target, [target, 'halted']);
  builder.addEdge(START, 'kill_switch_watcher');
  connect('kill_switch_watcher', 'master_orchestrator');
  connect('master_orchestrator', 'sourcing_trend_scan');
  connect('sourcing_trend_scan', 'sourcing_supplier_query');
  connect('sourcing_supplier_query', 'sourcing_margin_gate');
  connect('sourcing_margin_gate', 'sourcing_publish_or_reject');
  for (const name of ['sourcing_publish_or_reject', 'marketing_spend_gate', 'order_reorder_and_fulfill', 'support_refund_gate'] as const)
    builder.addConditionalEdges(name, afterAction, ['halted', 'human_interrupt', 'replan', ...Object.values(followingNodes)]);
  connect('marketing_copy_and_creative', 'marketing_spend_gate');
  connect('marketing_launch_or_hold', 'order_stock_sync');
  builder.addConditionalEdges('order_stock_sync', state => state.status === 'halted' ? 'halted' : state.plan ? 'order_reorder_and_fulfill' : 'support_triage', ['halted', 'order_reorder_and_fulfill', 'support_triage']);
  connect('support_triage', 'support_refund_gate');
  connect('support_resolve_or_escalate', 'completed');
  builder.addConditionalEdges('human_interrupt', state => staleReasons.has(state.lastDecision.reason ?? '') && state.plan ? 'replan' : followingNodes[state.activeStage], ['replan', ...Object.values(followingNodes)]);
  builder.addConditionalEdges('replan', state => state.status === 'halted' ? 'halted' : planningNodes[state.activeStage], ['halted', ...Object.values(planningNodes)]);
  builder.addEdge('completed', END).addEdge('halted', END);
  return builder.compile({ checkpointer });
}
