import { describe, expect, it } from 'vitest';
import { financeOverview } from '../src/finance.js';
import { seedState } from '../src/seed.js';

describe('financial evidence and unavailable values', () => {
  it('uses order records rather than sample aggregate revenue and does not invent profit or cash', () => {
    const state = seedState(true);
    state.baseRevenue = 999999;
    state.orders = [{ id: 'order', customer: { name: 'Test', email: 'test@example.com' }, items: [{ productId: 'prod-01', name: 'Lamp', quantity: 2, price: 49 }], total: 98, refunded: 10, status: 'partially_refunded', createdAt: '2026-09-08T10:00:00Z', tracking: null }];
    state.reservations = [{ id: 'ad', campaignId: 'campaign', amountMinor: 1000, agentId: 'marketing_agent', day: '2026-09-08', status: 'committed', expiresAt: '2026-09-08T10:15:00Z' }];
    const result = financeOverview(state, 'simulation', '30d', new Date('2026-09-09T12:00:00Z'));
    expect(result.metrics).toMatchObject({ grossSales: 98, refunds: 10, netSales: 88, estimatedCogs: 35, grossProfitEstimate: 53, adSpend: 10, contributionBeforeUnrecordedCosts: 43, netOperatingProfit: null, cashBalance: null, attributedRoas: null });
    expect(result.dataQuality.costBasis).toBe('current_catalog_estimate');
  });
  it('keeps missing unit costs and empty ratios unknown and excludes failed/future orders', () => {
    const state = seedState(false);
    const order = { id: 'order', customer: { name: 'Test', email: 'test@example.com' }, items: [{ productId: 'removed', name: 'Removed product', quantity: 1, price: 10 }], total: 10, refunded: 0, status: 'processing', createdAt: '2026-09-08T10:00:00Z', tracking: null };
    state.orders = [order, { ...order, id: 'failed', status: 'payment_failed' }, { ...order, id: 'future', createdAt: '2027-01-01T00:00:00Z' }];
    const result = financeOverview(state, 'simulation', '7d', new Date('2026-09-09T12:00:00Z'));
    expect(result.metrics).toMatchObject({ orderCount: 1, netSales: 10, estimatedCogs: null, grossProfitEstimate: null, contributionBeforeUnrecordedCosts: null, blendedMer: null });
    expect(result.dataQuality.missingCostLines).toBe(1);
  });
});
