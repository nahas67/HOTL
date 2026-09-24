import { autonomyDomains, type Actor } from '@hotl/schemas';
import { createEngine, type EngineOptions, type Result } from '../src/engine.js';

const fixtureOwner: Actor = { type: 'owner', id: 'owner-test' };

/**
 * The existing ledger suite isolates fixed financial boundaries. Its owner first
 * authorizes automation, and its callers read resource versions before acting.
 * Policy/context denial tests must use createEngine directly instead of this fixture.
 */
export async function createLedgerFixture(options: EngineOptions = {}) {
  const engine = await createEngine(options);
  const initial = await engine.snapshot();
  if (initial.constitution?.mode !== 'AUTONOMOUS') {
    const policy = await engine.updateConstitution({
      expectedVersion: initial.constitution!.version,
      reason: 'Authorize ledger test callers within the fixed financial limits',
      mode: 'AUTONOMOUS',
      maxAutonomousTransaction: 100,
      domains: Object.fromEntries(autonomyDomains.map(domain => [domain, { maxAutoActionAmount: 100 }])),
    }, fixtureOwner, 'test-ledger-autonomy-policy-v1');
    if (policy.decision !== 'allow') throw new Error('Ledger fixture policy was not accepted');
  }

  // Replays keep the context originally submitted, even after resource revisions
  // advance. Changed business payloads are still passed through and must conflict.
  const contexts = new Map<string, Result>();
  const agentActions = new Set(['checkSpend', 'commitSpend', 'publishListing', 'launchCampaign', 'evaluateRefund', 'placeSupplierOrder']);
  return new Proxy(engine, {
    get(target, property) {
      const original = Reflect.get(target, property);
      if (typeof original !== 'function') return original;
      if (!agentActions.has(String(property)) && property !== 'resolveInterrupt') return original.bind(target);
      return async (...args: unknown[]) => {
        const resolving = property === 'resolveInterrupt';
        const offset = resolving ? 1 : 0;
        const raw = args[offset] as Result;
        const actor = args[offset + 1] as Actor;
        const key = args[offset + 2] as string;
        const snapshot = await target.snapshot();
        const interrupt = resolving ? snapshot.interrupts.find(item => item.id === args[0]) : undefined;
        const legacy = Boolean(interrupt?.payload.legacyReviewRequired);
        if (actor.type === 'agent' || legacy) {
          const binding = `${String(property)}:${actor.type}:${actor.id}:${key}`;
          let context = contexts.get(binding);
          if (!context) {
            const request = legacy ? interrupt!.payload : raw;
            context = { expectedConstitutionVersion: snapshot.constitution!.version };
            if (legacy) context.reviewLegacy = true;
            if (request.productId) context.expectedRevision = snapshot.products.find(item => item.id === request.productId)?.revision ?? 0;
            else if (request.orderId) context.expectedRevision = snapshot.orders.find(item => item.id === request.orderId)?.revision ?? 0;
            else if (request.campaignId) context.expectedRevision = snapshot.campaigns.find(item => item.campaignId === request.campaignId)?.revision ?? 0;
            else if (request.reservationId) context.expectedRevision = snapshot.reservations.find(item => item.id === request.reservationId)?.revision ?? 0;
            if (request.productId && request.orderId) context.expectedOrderRevision = snapshot.orders.find(item => item.id === request.orderId)?.revision ?? 0;
            contexts.set(binding, context);
          }
          args[offset] = { ...context, ...raw };
        }
        return original.apply(target, args);
      };
    },
  });
}
