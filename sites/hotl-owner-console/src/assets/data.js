// Illustrative design fixtures only. Never imported into the HOTL business runtime.
import { checkpoint } from './checkpoint.js';

export { checkpoint };
export const groups = [
  ['Workspace', [['dashboard', 'Dashboard', 'home'], ['agents', 'AI agents', 'bot'], ['approvals', 'Approvals', 'check']]],
  ['Commerce', [['products', 'Products', 'tag'], ['orders', 'Orders', 'box'], ['inventory', 'Inventory', 'layers'], ['customers', 'Customers', 'users'], ['suppliers', 'Suppliers', 'truck']]],
  ['Growth', [['marketing', 'Marketing', 'chart'], ['finance', 'Finance', 'wallet']]],
  ['Controls', [['integrations', 'Integrations', 'link'], ['autonomy', 'Autonomy', 'sparkles'], ['guardrails', 'Guardrails', 'shield'], ['activity', 'Activity', 'clock'], ['readiness', 'Launch readiness', 'rocket'], ['settings', 'Settings', 'settings']]],
];
export const pages = groups.flatMap(([group, items]) => items.map(([id, label, icon]) => ({ id, label, icon, group })));
export const gates = [
  { id: 'gate-a', name: 'Business approval', label: 'Gate A', status: 'Required', description: 'Choose and approve the pilot business and its risk limits.', items: checkpoint.gateA.unknowns, note: checkpoint.gateA.summary },
  { id: 'gate-b', name: 'Protected infrastructure', label: 'Gate B', status: 'Unverified', description: 'Verify the protected runtime in an isolated hosted environment.', items: ['Hosted owner identity and workspace isolation', 'Protected database roles and row-level security', 'Independent emergency kill and provider revocation', 'External backup and restore proof', 'Hosted monitoring and failure recovery'], note: 'Local tests are recorded. Hosted identity, deployment, revocation and recovery remain externally unverified.' },
  { id: 'gate-c', name: 'Shopify development store', label: 'Gate C', status: 'Not connected', description: 'Set up an authorized development store and complete the external drill.', items: checkpoint.gateC.checks, note: checkpoint.gateC.summary },
];
export const products = [
  { id: 'DEMO-P01', name: 'Everyday canvas tote', sku: 'DEMO-TOTE-01', category: 'Accessories', price: 4300, cost: 2200, stock: 148, reserved: 8, status: 'Active', supplier: 'Northfield Studio', mark: 'CT', tone: 'sand' },
  { id: 'DEMO-P02', name: 'Ceramic travel mug', sku: 'DEMO-MUG-02', category: 'Home & living', price: 4200, cost: 2000, stock: 64, reserved: 4, status: 'Active', supplier: 'Form & Field', mark: 'CM', tone: 'mint' },
  { id: 'DEMO-P03', name: 'Oak desk organizer', sku: 'DEMO-DESK-03', category: 'Workspace', price: 5600, cost: 2900, stock: 12, reserved: 2, status: 'Low stock', supplier: 'Northfield Studio', mark: 'DO', tone: 'sand' },
  { id: 'DEMO-P04', name: 'Linen notebook set', sku: 'DEMO-NOTE-04', category: 'Workspace', price: 2800, cost: 1400, stock: 92, reserved: 6, status: 'Active', supplier: 'Paper Assembly', mark: 'LN', tone: 'lilac' },
  { id: 'DEMO-P05', name: 'Foldable laptop stand', sku: 'DEMO-STAND-05', category: 'Workspace', price: 6400, cost: 3300, stock: 0, reserved: 0, status: 'Out of stock', supplier: 'Form & Field', mark: 'LS', tone: 'blue' },
  { id: 'DEMO-P06', name: 'Cotton tea towel set', sku: 'DEMO-TOWEL-06', category: 'Home & living', price: 3200, cost: 1700, stock: 38, reserved: 3, status: 'Draft', supplier: 'Northfield Studio', mark: 'TT', tone: 'rose' },
];
export const orders = [
  ['DEMO-0186', 'Avery Lane', 'Processing', '2026-10-08', 'DEMO-P01', 3],
  ['DEMO-0185', 'Morgan Reed', 'Shipped', '2026-10-08', 'DEMO-P02', 2],
  ['DEMO-0184', 'Jamie Park', 'Delivered', '2026-10-07', 'DEMO-P03', 1],
  ['DEMO-0183', 'Casey Ellis', 'Processing', '2026-10-07', 'DEMO-P04', 2],
  ['DEMO-0182', 'Riley Quinn', 'Delivered', '2026-10-06', 'DEMO-P01', 1],
  ['DEMO-0181', 'Alex Rowan', 'On hold', '2026-10-06', 'DEMO-P05', 1],
  ['DEMO-0180', 'Avery Lane', 'Delivered', '2026-10-05', 'DEMO-P04', 3],
  ['DEMO-0179', 'Taylor Brook', 'Shipped', '2026-10-05', 'DEMO-P02', 1],
].map(([id, customer, status, date, productId, quantity]) => ({ id, customer, status, date, productId, quantity, total: products.find(p => p.id === productId).price * quantity }));
export const customers = [...new Set(orders.map(o => o.customer))].map((name, i) => {
  const customerOrders = orders.filter(o => o.customer === name);
  return { id: `DEMO-C0${i + 1}`, name, orders: customerOrders.length, total: customerOrders.reduce((n, o) => n + o.total, 0), lastOrder: customerOrders[0].date, segment: customerOrders.length > 1 ? 'Returning' : 'New' };
});
export const suppliers = [...new Set(products.map(p => p.supplier))].map((name, i) => ({ id: `DEMO-S0${i + 1}`, name, products: products.filter(p => p.supplier === name).length, lead: [8, 12, 6][i], status: i === 1 ? 'Review needed' : 'Sample partner' }));
export const agents = [
  { id: 'research', name: 'Research', role: 'Market & product discovery', icon: 'search', status: 'Brief ready', task: 'Compare demand signals for the next pilot.', description: 'Reviews market evidence and drafts a product brief. Business choices still require owner approval.', steps: ['Gather evidence', 'Compare candidate products', 'Prepare owner brief'], context: 'Illustrative research workflow; no current research run is connected.' },
  { id: 'merchandising', name: 'Merchandising', role: 'Catalog & pricing', icon: 'tag', status: 'Awaiting review', task: 'Prepare a catalog update for review.', description: 'Drafts catalog and price proposals. Only the authenticated guardrail can authorize a change.', steps: ['Review catalog', 'Draft a proposal', 'Request owner review'], context: 'Example product context; no listing or price will be published.' },
  { id: 'operations', name: 'Operations', role: 'Orders & inventory', icon: 'settings', status: 'Monitoring', task: 'Review a low-stock example.', description: 'Surfaces inventory and fulfillment exceptions for an owner.', steps: ['Check observations', 'Identify exceptions', 'Summarize next actions'], context: 'Sample inventory only; live order and stock feeds are unavailable.' },
  { id: 'finance', name: 'Finance', role: 'Ledger & contribution', icon: 'chart', status: 'Reconciled', task: 'Summarize the example period.', description: 'Presents ledger observations and contribution estimates. No funds are held or moved here.', steps: ['Collect observations', 'Compare ledger entries', 'Prepare a summary'], context: 'Illustrative reconciliation; no actual settlement or bank connection.' },
  { id: 'growth', name: 'Growth', role: 'Campaign planning', icon: 'sparkles', status: 'Draft ready', task: 'Prepare a sample campaign brief.', description: 'Suggests experiments within an approved policy. Real advertising remains disabled.', steps: ['Form a hypothesis', 'Draft an experiment', 'Request authorization'], context: 'No advertising account, budget authorization, or delivery is connected.' },
  { id: 'care', name: 'Customer care', role: 'Support & returns', icon: 'message', status: 'Needs review', task: 'Flag an illustrative returns question.', description: 'Organizes customer issues and drafts responses for review.', steps: ['Review the request', 'Draft a response', 'Escalate when needed'], context: 'Demonstration only; customer-learning memory is not implemented in production.' },
];
export const approvals = [
  { id: 'DEMO-A01', title: 'Review a price proposal', kind: 'Pricing', agent: 'Merchandising', status: 'Pending review', amount: 4300, summary: 'Example proposal for Everyday canvas tote. Verify the underlying costs and owner policy before any real change.', checks: ['Current product revision', 'Verified landed cost', 'Margin and market policy', 'One-use provider dispatch'] },
  { id: 'DEMO-A02', title: 'Review inventory replenishment', kind: 'Inventory', agent: 'Operations', status: 'Pending review', amount: 58000, summary: 'Example replenishment of 20 Oak desk organizers. No supplier order exists or can be submitted here.', checks: ['Supplier authorization', 'Inventory exposure', 'Protected reserve', 'Owner approval'] },
  { id: 'DEMO-A03', title: 'Review campaign brief', kind: 'Marketing', agent: 'Growth', status: 'Needs information', amount: 15000, summary: 'Example test campaign. Verified economics and an approved spending envelope are still required.', checks: ['Pilot selection', 'Contribution economics', 'Campaign spend cap', 'Stop thresholds'] },
];
export const integrations = [
  { id: 'shopify', name: 'Shopify', mark: 'S', category: 'Commerce', status: 'Not connected', description: 'Development-store catalog, order sync, and guarded price workflow.', requirements: checkpoint.gateC.checks.slice(0, 5), route: 'gate-c', tone: 'mint' },
  { id: 'woocommerce', name: 'WooCommerce', mark: 'W', category: 'Commerce', status: 'Not connected', description: 'Read adapter for catalog and order observations.', requirements: ['Authorized store', 'Protected connector configuration', 'Owner identity binding', 'Externally verified read sync'], route: 'readiness', tone: 'lilac' },
  { id: 'payments', name: 'Payments', mark: '$', category: 'Finance', status: 'Unavailable', description: 'Payment, refund, and settlement integrations.', requirements: ['Approved business envelope', 'Protected payment adapter', 'Verified payment and settlement cycle'], route: 'gate-a', tone: 'blue' },
  { id: 'llm', name: 'AI model gateway', mark: 'AI', category: 'Intelligence', status: 'Not connected', description: 'Scoped agent model access through the protected LiteLLM proxy.', requirements: ['External protected proxy', 'Per-agent virtual keys', 'Verified model budget and scope enforcement'], route: 'guardrails', tone: 'sand' },
  { id: 'database', name: 'Commerce database', mark: 'DB', category: 'Infrastructure', status: 'Unverified', description: 'Protected PostgreSQL state and audit storage.', requirements: gates[1].items.slice(0, 4), route: 'gate-b', tone: 'blue' },
  { id: 'emergency', name: 'Independent kill switch', mark: 'KS', category: 'Infrastructure', status: 'Unverified', description: 'Separate emergency state and provider revocation authority.', requirements: ['Independent hosting and credentials', 'Durable one-way latch', 'Verified revocation drill', 'Freshness and failure denial'], route: 'gate-b', tone: 'rose' },
];
export const events = [
  { id: 'DEMO-E01', time: '14:42', actor: 'Merchandising', category: 'Approval', title: 'Price proposal prepared', detail: 'Sample catalog proposal queued for review. No provider action.', icon: 'tag' },
  { id: 'DEMO-E02', time: '14:30', actor: 'Operations', category: 'Inventory', title: 'Low-stock example identified', detail: 'Oak desk organizer has 10 example available units.', icon: 'layers' },
  { id: 'DEMO-E03', time: '14:15', actor: 'Finance', category: 'Finance', title: 'Example period summarized', detail: 'Illustrative totals calculated from the demo series.', icon: 'wallet' },
  { id: 'DEMO-E04', time: '13:50', actor: 'Research', category: 'Research', title: 'Sample research brief prepared', detail: 'No market or business decision is authorized.', icon: 'search' },
  { id: 'DEMO-E05', time: '13:25', actor: 'Growth', category: 'Approval', title: 'Campaign example needs information', detail: 'Pilot economics and owner risk limits are unknown.', icon: 'chart' },
];
export const campaigns = [
  { id: 'DEMO-M01', name: 'Everyday essentials', channel: 'Email', status: 'Illustrative', audience: 'Returning customers', note: 'Example retention concept. No email has been sent.' },
  { id: 'DEMO-M02', name: 'A calmer workspace', channel: 'Search', status: 'Needs review', audience: 'Workspace category', note: 'Example search campaign. No advertising account or spend is connected.' },
  { id: 'DEMO-M03', name: 'Make room for simple', channel: 'Social', status: 'Draft', audience: 'Home & living', note: 'Example creative brief. No publication is scheduled.' },
];

function distribute(total, weights) {
  const sum = weights.reduce((n, x) => n + x, 0);
  let allocated = 0;
  return weights.map((w, i) => {
    const v = i === weights.length - 1 ? total - allocated : Math.floor(total * w / sum);
    allocated += v;
    return v;
  });
}
const weights = Array.from({ length: 30 }, (_, i) => Math.round((i + 5) ** 1.5 * (1 + [0.015, 0.04, 0.025, -0.025, 0.01, -0.04][i % 6])));
const cents = distribute(2486000, weights);
const previous = distribute(2203901, weights.map((w, i) => w * (0.7 + (i % 4) * 0.13)));
const counts = distribute(186, weights);
const previousCounts = distribute(172, weights);
export const series = weights.map((_, i) => ({ date: new Date(Date.UTC(2026, 8, 9 + i)).toISOString().slice(0, 10), revenue: cents[i], previous: previous[i], orders: counts[i], previousOrders: previousCounts[i] }));
export function metrics(days = 30) {
  const rows = series.slice(-days);
  const total = key => rows.reduce((n, row) => n + row[key], 0);
  const revenue = total('revenue');
  const costs = [['Product costs', Math.round(revenue * 0.52)], ['Fulfillment', Math.round(revenue * 0.068)], ['Payment fees', Math.round(revenue * 0.032)], ['Marketing', Math.round(revenue * 0.056)]];
  const previousRevenue = total('previous');
  return { rows, revenue, previous: previousRevenue, previousContribution: Math.round(previousRevenue * 0.303), orders: total('orders'), previousOrders: total('previousOrders'), contribution: revenue - costs.reduce((n, [, amount]) => n + amount, 0), costs };
}
export const money = (cents, decimals = true) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: decimals ? 2 : 0, minimumFractionDigits: decimals ? 2 : 0 }).format(cents / 100);
export const dateLabel = date => new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
export function filtered(rows, query = '', filter = 'All', key = 'status') {
  const term = query.trim().toLocaleLowerCase();
  return rows.filter(row => (filter === 'All' || String(row[key]) === filter) && (!term || Object.values(row).some(value => typeof value !== 'object' && String(value).toLocaleLowerCase().includes(term))));
}
export function normalizeRoute(hash) {
  const route = hash.replace(/^#\/?/, '').split('?')[0];
  if (!route || route === 'overview') return 'dashboard';
  return [...pages, ...gates].some(p => p.id === route) ? route : 'dashboard';
}
export function searchWorkspace(query, mode) {
  const results = pages.map(p => ({ title: p.label, subtitle: p.group, route: p.id, icon: p.icon }));
  if (mode === 'demo') {
    results.push(...products.map(p => ({ title: p.name, subtitle: `Sample product · ${p.sku}`, route: 'products', detail: p.id, icon: 'tag' })));
    results.push(...orders.map(o => ({ title: o.id, subtitle: `Sample order · ${o.customer}`, route: 'orders', detail: o.id, icon: 'box' })));
  }
  return filtered(results, query).slice(0, 15);
}
export function report(mode, route, days) {
  const common = { title: 'HOTL Owner Control', mode, route, liveConnection: false, commerceActionsEnabled: false, checkpointRecordedOn: checkpoint.reviewedOn };
  if (mode !== 'demo') return { ...common, dataKind: 'RECORDED_CHECKPOINT_NOT_LIVE', gateA: checkpoint.gateA, gateC: checkpoint.gateC, liveMetrics: null };
  const m = metrics(days);
  return { ...common, dataKind: 'ILLUSTRATIVE_SAMPLE_NOT_BUSINESS_RECORDS', currency: 'USD (example only; does not select pilot currency)', days, summary: { revenueCents: m.revenue, orders: m.orders, contributionCents: m.contribution }, sampleProducts: products, sampleOrders: orders, actualReadiness: { gateA: checkpoint.gateA.status, gateC: checkpoint.gateC.status } };
}
