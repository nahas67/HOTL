// The canonical set of cockpit screens.
//
// Single source of truth for two consumers that must never disagree: the navigation
// the owner clicks, and the catch-all route deciding whether a path is a real screen.
// It lives in a plain module rather than in the client component on purpose: a server
// component importing a function from a "use client" module fails at runtime on EVERY
// route, which is exactly what happened when this first lived in `components/cockpit.tsx`.
export const SECTION_IDS = [
  'overview', 'agents', 'approvals', 'products', 'orders', 'guardrails',
  'activity', 'autonomy', 'integrations', 'finance', 'settings',
] as const;
export type Section = (typeof SECTION_IDS)[number];
export const DEFAULT_SECTION: Section = 'overview';

/**
 * Whether a requested path segment names a real cockpit screen.
 *
 * An unknown path previously rendered Overview with a 200, which made a screen the
 * owner never built indistinguishable from a deliberate one. The route answers 404.
 */
export function isKnownSection(value: string | undefined): value is Section {
  return value !== undefined && (SECTION_IDS as readonly string[]).includes(value);
}
export type Config = { dailyAdSpendCeiling: number; marginFloor: number; autoRefundThreshold: number; currency: string };
export type Interrupt = {
  id: string; runId: string; threadId: string; category: string; title: string; summary: string;
  agentName: string; priority: string; payload: Record<string, unknown>; status: string; createdAt: string;
};
export type Agent = {
  id: string; name: string; role: string; status: string; currentTask: string; lastActive: string;
  actionsToday: number; successRate: number; tokenUsage: number; tokenBudget: number;
};
export type Product = {
  revision: number; description?: string;
  id: string; sku: string; name: string; category: string; price: number; landedCost: number;
  estimatedCac: number; margin: number; inventory: number; status: string; color: string; image?: string; orders: number; revenue: number;
};
export type Order = {
  revision?: number; refunded?: number;
  id: string; customer: { name: string; email: string }; items: { productId: string; name: string; quantity: number; price: number }[];
  total: number; status: string; createdAt: string; tracking?: string;
};
export type Activity = {
  id: string; actor?: string; actorId?: string; actorType?: string; actor_type?: string; agentName?: string;
  action?: string; actionType?: string; action_type?: string; summary?: string; decision?: string;
  payload?: Record<string, unknown>; createdAt?: string; created_at?: string; hash?: string; previousHash?: string;
};
export type Telemetry = {
  mode: 'simulation' | 'live'; status: 'running' | 'paused' | 'killed';
  /** Ledger-derived only. Nothing fabricated may appear here. */
  metrics: { revenue: number; orders: number; adSpend: number; adSpendCeiling: number; activeAgents: number; pendingInterrupts: number };
  /** Illustrative values for the local simulation. Never present these as observed data. */
  synthetic: { revenueChange: number; ordersChange: number; margin: number; marginChange: number; chart: { date: string; label: string; revenue: number; spend: number }[]; note: string };
  agents: Agent[]; products: Product[]; orders: Order[]; activity: Activity[]; config: Config; interrupts: Interrupt[]; updatedAt: string;
};
