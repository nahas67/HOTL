import type { EngineState } from './types.js';
import { fromMinor, toMinor } from '@hotl/schemas';

export type FinancePeriod = '7d' | '30d' | 'all';

/** Analytical estimates never authorize a financial action. Missing costs stay unknown. */
export function financeOverview(state: EngineState, mode: 'simulation' | 'live', period: FinancePeriod = '30d', now = new Date()) {
  const cutoff = period === 'all' ? 0 : now.getTime() - (period === '7d' ? 7 : 30) * 86_400_000;
  const inPeriod = (date: string) => Number.isFinite(Date.parse(date)) && Date.parse(date) >= cutoff && Date.parse(date) <= now.getTime();
  const orders = state.orders.filter(order => inPeriod(order.createdAt) && order.status !== 'payment_failed' && order.status !== 'cancelled');
  let grossSales = 0, refunds = 0, estimatedCogs = 0, missingCostLines = 0;
  const products = new Map(state.products.map(product => [product.id, product]));
  const skuRows = new Map<string, { productId: string; name: string; units: number; grossSalesMinor: number; estimatedCogsMinor: number | null }>();
  for (const order of orders) {
    grossSales += toMinor(order.total);
    refunds += toMinor(order.refunded);
    for (const item of order.items) {
      const product = products.get(item.productId);
      const row = skuRows.get(item.productId) ?? { productId: item.productId, name: item.name, units: 0, grossSalesMinor: 0, estimatedCogsMinor: 0 };
      row.units += item.quantity;
      row.grossSalesMinor += toMinor(item.price) * item.quantity;
      if (product) {
        const cost = toMinor(product.landedCost) * item.quantity;
        estimatedCogs += cost;
        if (row.estimatedCogsMinor !== null) row.estimatedCogsMinor += cost;
      } else { missingCostLines++; row.estimatedCogsMinor = null; }
      skuRows.set(item.productId, row);
    }
  }
  const reservations = state.reservations.filter(item => item.day >= new Date(cutoff).toISOString().slice(0, 10) && item.day <= now.toISOString().slice(0, 10));
  const adSpend = reservations.filter(item => item.status === 'committed').reduce((sum, item) => sum + item.amountMinor, 0);
  const reservedAdSpend = reservations.filter(item => item.status === 'reserved' && Date.parse(item.expiresAt) > now.getTime()).reduce((sum, item) => sum + item.amountMinor, 0);
  const netSales = grossSales - refunds;
  const grossProfitEstimate = missingCostLines ? null : netSales - estimatedCogs;
  const contributionBeforeUnrecordedCosts = grossProfitEstimate === null ? null : grossProfitEstimate - adSpend;
  const days = new Map<string, { date: string; grossSalesMinor: number; refundsMinor: number; adSpendMinor: number }>();
  for (const order of orders) {
    const date = order.createdAt.slice(0, 10);
    const day = days.get(date) ?? { date, grossSalesMinor: 0, refundsMinor: 0, adSpendMinor: 0 };
    day.grossSalesMinor += toMinor(order.total); day.refundsMinor += toMinor(order.refunded); days.set(date, day);
  }
  for (const item of reservations.filter(value => value.status === 'committed')) {
    const day = days.get(item.day) ?? { date: item.day, grossSalesMinor: 0, refundsMinor: 0, adSpendMinor: 0 };
    day.adSpendMinor += item.amountMinor; days.set(item.day, day);
  }
  return {
    mode, currency: 'USD', period, generatedAt: now.toISOString(),
    source: 'persisted_order_and_reservation_ledger',
    metrics: {
      grossSales: fromMinor(grossSales), refunds: fromMinor(refunds), netSales: fromMinor(netSales),
      orderCount: orders.length, aov: orders.length ? fromMinor(Math.round(grossSales / orders.length)) : null,
      estimatedCogs: missingCostLines ? null : fromMinor(estimatedCogs),
      grossProfitEstimate: grossProfitEstimate === null ? null : fromMinor(grossProfitEstimate),
      adSpend: fromMinor(adSpend), reservedAdSpend: fromMinor(reservedAdSpend),
      contributionBeforeUnrecordedCosts: contributionBeforeUnrecordedCosts === null ? null : fromMinor(contributionBeforeUnrecordedCosts),
      netOperatingProfit: null, cashBalance: null, cac: null, ltv: null, attributedRoas: null,
      blendedMer: adSpend ? Math.round(netSales / adSpend * 100) / 100 : null,
      refundedOrderRate: orders.length ? orders.filter(order => order.refunded > 0).length / orders.length : null,
    },
    dataQuality: {
      costBasis: 'current_catalog_estimate', missingCostLines,
      unavailable: ['payment_fees', 'marketplace_fees', 'tax_liabilities', 'operating_expenses', 'cash_reconciliation', 'customer_acquisition_attribution', 'historical_unit_costs'],
      notes: [
        'Seeded dashboard aggregate metrics are excluded; this view sums persisted order records.',
        'Refunds are attributed to the original order date. This is order-cohort analysis, not a cash-flow statement.',
        'COGS uses current landed costs and conservatively retains sold-unit costs after refunds; returned inventory recovery is not assumed.',
        'Contribution shown excludes unrecorded fees, taxes and operating costs. Net profit and cash remain unavailable.',
        'Ad spend includes committed ledger reservations only; the historical demonstration spend baseline is excluded.',
      ],
    },
    daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(day => ({ date: day.date, grossSales: fromMinor(day.grossSalesMinor), refunds: fromMinor(day.refundsMinor), adSpend: fromMinor(day.adSpendMinor) })),
    products: [...skuRows.values()].sort((a, b) => b.grossSalesMinor - a.grossSalesMinor).map(row => ({ productId: row.productId, name: row.name, units: row.units, grossSales: fromMinor(row.grossSalesMinor), estimatedCogs: row.estimatedCogsMinor === null ? null : fromMinor(row.estimatedCogsMinor) })),
  };
}
