import { autonomyDomainEnforcement, type AutonomyDomain, type BusinessConstitution } from '@hotl/schemas';
import type { AgentContext, Result } from './client.js';

/**
 * Which owner autonomy domain governs each stage of the runtime commerce cycle.
 *
 * This map is orchestration bookkeeping, not policy. The guardrail remains the only authority:
 * `GuardrailEngine.autonomy()` decides whether an action executes, escalates, or is denied, and no
 * value here is ever used to compute that. It exists so the graph stops *proposing* work the owner
 * has switched off, and so a run's log can name the domain a decision came from.
 *
 * The domains `orders`, `inventory` and `finance` are enforced by the guardrail on
 * `commerce.checkout` and `commerce.event`, but no orchestrator stage drives them: an agent order
 * or a provider payment event enters the guardrail directly. They are listed by
 * `guardrailOnlyDomains()` rather than being quietly dropped from the picture.
 */
export type Stage = 'catalog' | 'campaign' | 'supplier' | 'refund';

export const stageDomains: Record<Stage, readonly AutonomyDomain[]> = {
  catalog: ['catalog', 'pricing'],
  campaign: ['advertising'],
  supplier: ['purchasing', 'fulfillment'],
  refund: ['refunds'],
};

/** Enforced domains the guardrail evaluates on a path this graph never drives. */
export const guardrailOnlyDomains: readonly AutonomyDomain[] = ['orders', 'inventory', 'finance'];

/**
 * A governing domain the owner has paused, or `null`.
 *
 * Only PAUSE is honoured here. MANUAL and COPILOT are deliberately left to the guardrail so the
 * run still records the authoritative `MANUAL_CONTROL` / escalation decision in its decision log
 * rather than replacing it with a local guess.
 */
export function pausedStageDomain(constitution: BusinessConstitution, stage: Stage): AutonomyDomain | null {
  for (const domain of stageDomains[stage]) if (constitution.domains[domain]?.paused) return domain;
  return null;
}

export function pausedDomainForStage(context: AgentContext, stage: Stage): AutonomyDomain | null {
  return pausedStageDomain(context.constitution, stage);
}

/** The domain a guardrail decision was refused or escalated under, when it named one. */
export function decisionDomain(decision: Result): AutonomyDomain | null {
  const domain = decision.domain;
  return typeof domain === 'string' ? domain as AutonomyDomain : null;
}

export function describeDomain(domain: AutonomyDomain): string {
  return `${domain}: ${autonomyDomainEnforcement[domain].enforced ? 'enforced' : 'configured but not enforced'}`;
}