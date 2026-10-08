import { checkpoint, pages, gates, products, orders, customers, suppliers, agents, approvals, integrations, events, campaigns, metrics, money, dateLabel, filtered } from './data.js';
import { esc, icon, badge, link, button, panel, heading, sampleNote, empty, facts, list, table, toolbar, recordButton, productName, avatar, kpis, performanceChart, percent } from './ui.js';

const subtitles = {
  products: 'A considered catalog, ready for a closer look.', orders: 'From checkout to doorstep, every step in view.', inventory: 'Know what is available and what needs attention.', customers: 'The people behind your example orders.', suppliers: 'Your sourcing relationships, in one place.', approvals: 'Give important decisions your attention.', agents: 'Clear responsibilities. Visible work. Human oversight.', marketing: 'Ideas and experiments for thoughtful growth.', finance: 'Understand the contribution behind the revenue.', integrations: 'Connect your business through protected services.', autonomy: 'Define where your judgment stays in the loop.', guardrails: 'The boundaries that every real action must respect.', activity: 'A traceable view of what happened and why.', readiness: 'The path from a local simulation to a verified pilot.', settings: 'Make this workspace feel right for you.',
};

function periodSelect(state) {
  return `<select class="period-select" data-input="period" aria-label="Reporting period">${[7, 14, 30].map(n => `<option value="${n}" ${state.days === n ? 'selected' : ''}>Last ${n} days</option>`).join('')}</select>`;
}
const exportButton = () => button('export', `${icon('download')}Export report`);
function readinessList() {
  return `<div class="readiness-list">${gates.map((g, i) => `<a href="#${g.id}" class="readiness-row">${icon(['file', 'server', 'box'][i])}<span>${esc(g.name)}<strong>${esc(g.status)}</strong></span>${icon('chevron')}</a>`).join('')}</div>`;
}
function orderRows(rows, compact = false) {
  return rows.map(o => [recordButton(o.id, o.id), esc(o.customer), ...(compact ? [] : [esc(dateLabel(o.date))]), badge(o.status), `<span class="tabular">${money(o.total)}</span>`, ...(compact ? [] : [button('detail', 'View', 'text-button', `data-id="${o.id}" aria-label="View ${o.id}"`)])]);
}
function dashboard(state) {
  const demo = state.mode === 'demo';
  const m = metrics(state.days);
  const actions = `${demo ? periodSelect(state) : ''}${exportButton()}`;
  let html = heading('Business overview', demo ? 'A clear view of your commerce operations.' : 'Recorded project status. Live business data is not connected.', actions);
  html += kpis(demo ? [
    { label: 'Revenue', value: money(m.revenue, false), note: percent(m.revenue, m.previous), positive: true },
    { label: 'Orders', value: m.orders, note: percent(m.orders, m.previousOrders), positive: true },
    { label: 'Contribution margin', value: `${(m.contribution / m.revenue * 100).toFixed(1)}%`, note: `+${((m.contribution / m.revenue - m.previousContribution / m.previous) * 100).toFixed(1)} pts vs previous example period`, positive: true },
    { label: 'Needs review', value: approvals.length, note: 'Demo approval requests' },
  ] : [
    { label: 'Revenue', value: 'Unknown', note: 'No live ledger connection' },
    { label: 'Orders', value: 'Unknown', note: 'No live order feed' },
    { label: 'Service health', value: 'Unknown', note: 'No service telemetry received' },
    { label: 'Commerce actions', value: 'Disabled', note: 'Read-only Site boundary' },
  ]);
  const chart = demo ? `<div class="chart-toolbar"><div class="tab-list" aria-label="Performance metric">${['revenue', 'orders'].map(k => button('chart', k === 'revenue' ? 'Revenue' : 'Orders', `tab ${state.chart === k ? 'selected' : ''}`, `data-kind="${k}" aria-pressed="${state.chart === k}"`)).join('')}</div><div class="chart-legend"><span class="legend-current">Current period</span><span class="legend-previous">Previous period</span></div></div>${performanceChart(state.days, state.chart)}<div class="chart-foot">${state.chart === 'revenue' ? 'USD' : 'Order counts'} · sample daily totals · ${dateLabel(m.rows[0].date)}–${dateLabel(m.rows.at(-1).date)}, 2026</div>` : empty('Performance is not connected', 'Revenue, order counts, and margin remain unknown until a verified data source is connected.', link('integrations', 'Review integrations'));
  const team = demo ? `<div class="agent-rows">${agents.slice(0, 4).map(a => `<button class="agent-row" type="button" data-action="detail" data-id="AGENT:${a.id}"><span class="round-icon">${icon(a.icon)}</span><span class="agent-copy"><strong>${esc(a.name)}</strong><span>Sample workflow</span></span>${badge(a.status)}</button>`).join('')}</div>${link('agents', 'View all agents', 'button full')}` : empty('Agent state is unknown', 'No orchestrator or active run is connected.', link('agents', 'View agent architecture'));
  html += `<div class="dashboard-grid">${panel('Revenue performance', chart, { className: 'performance-panel' })}${panel('Your AI team', team, { className: 'team-panel' })}</div>`;
  const recent = demo ? table(['Order', 'Customer', 'Status', 'Total'], orderRows(orders.slice(0, 3), true), 'Recent sample orders') : empty('No order feed', 'Unknown does not mean there are no orders.');
  html += `<div class="dashboard-grid lower-grid">${panel('Recent orders', recent, { subtitle: demo ? 'Sample orders' : 'No connected source', action: link('orders', 'View all', 'button small') })}${panel('Launch readiness', readinessList() + link('readiness', 'Review readiness', 'button primary full'), { subtitle: `Recorded project status · ${checkpoint.reviewedOn}`, action: badge('Setup required') })}</div>`;
  return html;
}

function checkpointView(route) {
  const p = pages.find(p => p.id === route);
  const source = checkpoint.sections[route];
  const statements = {
    inventory: ['Live stock and reservations: unknown', 'Inventory mutation API: outside this Site', 'Supplier and inventory exposure: owner limits required'],
    customers: ['Customer records: not connected', 'Customer-learning memory: not implemented as a real business capability', 'No customer personal data is copied into this Site'],
    suppliers: ['Verified supplier relationships: not connected', 'Procurement execution: unavailable', 'Exposure and reserve limits: owner approval required'],
    marketing: ['Advertising account: not connected', 'Real ad spend and attribution: not implemented', 'Campaign publication: unavailable'],
  };
  return heading(p.label, subtitles[route]) + panel('Recorded state', empty(`${p.label} data is not connected`, source?.body || 'This page has no authenticated business feed. Current records, counts, and outcomes are unknown.', button('mode-demo', 'Explore sample workspace', 'button primary')) + list(source?.facts || statements[route] || ['No live data source connected']), { subtitle: `Repository checkpoint · ${checkpoint.reviewedOn}` });
}

function recordPage(state) {
  const { route } = state;
  let rows, columns, cells, options, key = 'status', filterLabel = 'Status';
  if (route === 'products') {
    rows = products; columns = ['Product', 'Category', 'Price', 'Available', 'Status']; key = 'category'; options = [...new Set(products.map(p => p.category))]; filterLabel = 'Category';
    cells = p => [productName(p), esc(p.category), money(p.price), p.stock - p.reserved, badge(p.status)];
  } else if (route === 'orders') {
    rows = orders; columns = ['Order', 'Customer', 'Date', 'Status', 'Total', 'Details']; options = [...new Set(orders.map(o => o.status))]; cells = o => orderRows([o])[0];
  } else if (route === 'inventory') {
    rows = products; columns = ['Product', 'On hand', 'Reserved', 'Available', 'Status']; options = [...new Set(products.map(p => p.status))]; cells = p => [productName(p), p.stock, p.reserved, `<strong>${p.stock - p.reserved}</strong>`, badge(p.status)];
  } else if (route === 'customers') {
    rows = customers; columns = ['Customer', 'Example orders', 'Example spend', 'Last order', 'Segment']; key = 'segment'; filterLabel = 'Segment'; options = ['New', 'Returning'];
    cells = c => [`<div class="person-name">${avatar(c.name)}${recordButton(c.id, c.name)}</div>`, c.orders, money(c.total), dateLabel(c.lastOrder), badge(c.segment)];
  } else if (route === 'suppliers') {
    rows = suppliers; columns = ['Supplier', 'Products', 'Example lead time', 'Status', 'Details']; options = ['Sample partner', 'Review needed']; cells = s => [recordButton(s.id, s.name), s.products, `${s.lead} days`, badge(s.status), button('detail', 'View', 'text-button', `data-id="${s.id}" aria-label="View ${esc(s.name)}"`)];
  } else if (route === 'approvals') {
    rows = approvals; columns = ['Request', 'Agent', 'Type', 'Example amount', 'Status', 'Review']; options = ['Pending review', 'Needs information']; cells = a => [recordButton(a.id, a.title), esc(a.agent), esc(a.kind), money(a.amount), badge(a.status), button('detail', 'Review', 'text-button', `data-id="${a.id}" aria-label="Review ${esc(a.title)}"`)];
  }
  const result = filtered(rows, state.query, state.filter, key);
  let html = heading(pages.find(p => p.id === route).label, subtitles[route], exportButton());
  if (route === 'inventory') html += kpis([{ label: 'On hand', value: products.reduce((n, p) => n + p.stock, 0), note: 'Example units' }, { label: 'Reserved', value: products.reduce((n, p) => n + p.reserved, 0), note: 'Example reservations' }, { label: 'Low stock', value: products.filter(p => p.status === 'Low stock').length, note: 'Example product' }, { label: 'Out of stock', value: products.filter(p => p.stock === 0).length, note: 'Example product' }]);
  if (route === 'approvals') html += `<div class="notice">${icon('shield')}<p><strong>Review the experience.</strong> These requests are examples. Approval, rejection, and provider dispatch require the authenticated HOTL cockpit and are unavailable here.</p></div>`;
  html += `<section class="panel records-panel">${toolbar(state, options, filterLabel)}${table(columns, result.map(cells), `Sample ${route}`)}<div class="table-footer">${result.length} of ${rows.length} example ${route === 'inventory' ? 'products' : route} · ${route === 'orders' ? 'Recent examples, not the full chart dataset' : 'Read-only preview'}</div></section>${sampleNote(route === 'customers' ? 'All names are fictional. No customer profiles, addresses, or payment details are loaded.' : undefined)}`;
  return html;
}

function agentPage(state) {
  const result = filtered(agents, state.query, state.filter);
  return heading('Your AI team', subtitles.agents) + `<div class="notice">${icon('bot')}<p><strong>Example workflows.</strong> These statuses illustrate the interface. No agent runs or model calls are connected to this Site.</p></div>${toolbar(state, [...new Set(agents.map(a => a.status))])}<div class="agent-grid">${result.map(a => `<article class="panel agent-card"><div class="agent-card-head"><span class="round-icon large">${icon(a.icon)}</span>${badge(a.status)}</div><h2>${esc(a.name)}</h2><p class="agent-role">${esc(a.role)}</p><p>${esc(a.task)}</p><div class="agent-card-foot"><span>Sample workflow</span>${button('detail', 'View workflow', 'text-button', `data-id="AGENT:${a.id}"`)}</div></article>`).join('') || empty('No matching agents', 'Clear the filters to see all sample roles.')}</div>`;
}

function financePage(state) {
  const m = metrics(state.days);
  return heading('Finance', subtitles.finance, periodSelect(state) + exportButton()) + kpis([
    { label: 'Revenue', value: money(m.revenue, false), note: 'Example gross revenue' },
    { label: 'Variable costs', value: money(m.revenue - m.contribution, false), note: 'Product, fulfillment, fees, and marketing' },
    { label: 'Contribution', value: money(m.contribution, false), note: 'Example revenue minus variable costs' },
    { label: 'Contribution margin', value: `${(m.contribution / m.revenue * 100).toFixed(1)}%`, note: 'Illustrative only' },
  ]) + `<div class="dashboard-grid">${panel('Contribution breakdown', table(['Line item', 'Example amount', 'Share of revenue'], [['Revenue', money(m.revenue), '100%'], ...m.costs.map(([name, amount]) => [esc(name), money(amount), `${(amount / m.revenue * 100).toFixed(1)}%`]), ['<strong>Contribution</strong>', `<strong>${money(m.contribution)}</strong>`, '32.4%']], 'Sample contribution breakdown'), { subtitle: 'Illustrative economics · not a settled business ledger' })}${panel('Financial authority', list(['Actual capital: unknown', 'Protected reserve: unknown', 'Actual pilot currency: unknown', 'Owner-approved spend limits: unknown']) + link('gate-a', 'Review business requirements', 'button full'), { subtitle: 'Recorded project state' })}</div>${sampleNote('No bank, payout, refund, payment, or real ledger connection. Example USD values do not authorize any action.')}`;
}

function integrationsPage(state) {
  const rows = filtered(integrations, state.query, state.filter, 'category');
  return heading('Integrations', subtitles.integrations) + `<div class="notice">${icon('lock')}<p><strong>No live connections.</strong> Provider credentials belong in the protected HOTL services. This interface displays setup requirements only.</p></div>${toolbar(state, [...new Set(integrations.map(i => i.category))], 'Category')}<div class="integration-grid">${rows.map(i => `<article class="panel integration-card"><div class="integration-top"><span class="product-mark ${i.tone}">${esc(i.mark)}</span>${badge(i.status)}</div><h2>${esc(i.name)}</h2><p>${esc(i.description)}</p><div class="integration-bottom"><span>${esc(i.category)}</span>${button('detail', 'View requirements', 'text-button', `data-id="INTEGRATION:${i.id}"`)}</div></article>`).join('') || empty('No matching integrations', 'Clear the filters to see setup requirements.')}</div>`;
}

function readinessPage(route) {
  const gate = gates.find(g => g.id === route);
  if (gate) return heading(`${gate.label} · ${gate.name}`, gate.description, link('readiness', 'All readiness gates')) + `<div class="notice">${icon('info')}<p><strong>${esc(gate.status)}.</strong> ${esc(gate.note)}</p></div>${panel('What is required', list(gate.items), { subtitle: `Recorded checkpoint · ${checkpoint.reviewedOn}` })}<div class="boundary-note">${icon('lock')}<p>Completing or checking a box in this Site cannot authorize business. Evidence and approvals must be recorded through the authenticated HOTL services.</p></div>`;
  return heading('Launch readiness', subtitles.readiness) + `<div class="notice">${icon('info')}<p><strong>Setup required.</strong> This is the recorded project checkpoint from ${checkpoint.reviewedOn}. No new external probe or provider request has run.</p></div><div class="readiness-board">${gates.map((g, i) => `<article class="panel gate-card"><div class="gate-number">0${i + 1}</div><div class="gate-content"><div class="gate-title"><span>${esc(g.label)}</span>${badge(g.status)}</div><h2>${esc(g.name)}</h2><p>${esc(g.description)}</p>${list(g.items.slice(0, 3))}${link(g.id, 'Review requirements', 'button')}</div></article>`).join('')}</div>${panel('What this checkpoint means', facts([['Business environment', 'Local simulation'], ['External Shopify proof', 'Not recorded'], ['Gate C settings missing', '19 at the recorded preflight'], ['Live actions from this Site', 'Disabled']]))}`;
}

function guardrailsPage() {
  return heading('Guardrails', subtitles.guardrails) + `<div class="notice">${icon('shield')}<p><strong>Read-only safety overview.</strong> This Site cannot evaluate or grant business authorization.</p></div>${panel('Policy boundaries', table(['Control', 'Authority', 'Recorded state'], [
    ['Spend and exposure ceilings', 'Protected guardrail service', badge('Owner input required')], ['Margin floor and verified costs', 'Protected guardrail service', badge('Owner input required')], ['Refund limits and reserve', 'Protected guardrail service', badge('Owner input required')], ['Audit before success', 'Durable HOTL journal', badge('Locally tested')], ['Idempotency and single-use dispatch', 'Protected guardrail service', badge('Locally tested')], ['Pause / emergency kill', 'Protected services / independent kill service', badge('Externally unverified')],
  ], 'Recorded guardrail responsibilities'))}<div class="two-column">${panel('Every consequential action', list(['Authenticate the actor and workspace', 'Validate current policy and evidence', 'Record the durable audit event', 'Dispatch only under valid single-use authority']))}${panel('Emergency controls', `<p class="panel-copy">Pause is reversible. Kill is a durable one-way latch in a separately hosted service. This Site has no current emergency state or control connection.</p>${facts([['Current pause state', 'Unknown'], ['Current kill state', 'Unknown'], ['Emergency actions here', 'Unavailable']])}${link('gate-b', 'Review infrastructure requirements', 'button full')}`)}</div>`;
}

function autonomyPage() {
  return heading('Autonomy', subtitles.autonomy) + `<div class="notice">${icon('lock')}<p><strong>Production autonomy is not authorized.</strong> The current runtime mode and Constitution version are unknown to this Site.</p></div><div class="two-column">${panel('Business Constitution', facts([['Workspace identity', 'Not connected'], ['Current Constitution version', 'Unknown'], ['Approved pilot country', 'Unknown'], ['Approved category and currency', 'Unknown'], ['Capital and stop thresholds', 'Owner input required']]) + link('gate-a', 'Review the business envelope', 'button full'))}${panel('Owner oversight', `<p class="panel-copy">AI may research, explain, and recommend. A recommendation does not approve a business envelope or grant permission to spend.</p>${list(['Owner approval recorded in the authenticated cockpit', 'Deterministic policy checks for all consequential actions', 'Domain scope and per-agent credentials', 'No automatic expansion of authority'])}`)}</div>${panel('Domain readiness', table(['Domain', 'Hosted state', 'Action authority'], ['Catalog & pricing', 'Inventory & procurement', 'Campaigns & advertising', 'Orders & refunds'].map(domain => [esc(domain), badge('Unverified'), 'Protected guardrail only']), 'Autonomy domain boundaries'))}`;
}

function activityPage(state) {
  const result = filtered(events, state.query, state.filter, 'category');
  return heading('Activity', subtitles.activity, exportButton()) + `<div class="notice">${icon('clock')}<p><strong>Illustrative timeline.</strong> These entries are sample UI content, not audit events, provider receipts, or current telemetry.</p></div>${toolbar(state, [...new Set(events.map(e => e.category))], 'Category')}<section class="panel timeline">${result.map(e => `<article class="timeline-item"><span class="round-icon">${icon(e.icon)}</span><div><div class="timeline-title"><h2>${esc(e.title)}</h2><span>${esc(e.time)} · sample time</span></div><p>${esc(e.detail)}</p><span class="secondary">${esc(e.actor)} · ${esc(e.category)} · ${esc(e.id)}</span></div></article>`).join('') || empty('No matching activity', 'Clear the filters to see the example timeline.')}</section>`;
}

function marketingPage(state) {
  const rows = filtered(campaigns, state.query, state.filter, 'channel');
  return heading('Marketing', subtitles.marketing) + `<div class="notice">${icon('info')}<p><strong>Planning examples only.</strong> No ad budget is approved, no message is sent, and no campaign runs from this Site.</p></div>${toolbar(state, ['Email', 'Search', 'Social'], 'Channel')}${panel('Campaign workspace', table(['Campaign', 'Channel', 'Example audience', 'Status', 'Brief'], rows.map(c => [recordButton(c.id, c.name), esc(c.channel), esc(c.audience), badge(c.status), button('detail', 'Read brief', 'text-button', `data-id="${c.id}"`)]), 'Sample campaigns'))}${panel('Before the first real campaign', list(['Owner-approved pilot and business envelope', 'Verified costs, contribution, and stop thresholds', 'Protected advertising adapter and account authority', 'Attribution and reconciliation evidence']) + link('gate-a', 'Review business requirements', 'button'))}`;
}

function settingsPage(state) {
  return heading('Settings', subtitles.settings) + `<div class="settings-grid">${panel('Appearance', `<div class="setting-row"><div><h3>Color theme</h3><p>Saved only in this browser.</p></div><select data-input="theme" aria-label="Color theme"><option value="light" ${state.theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${state.theme === 'dark' ? 'selected' : ''}>Dark</option></select></div><div class="setting-row"><div><h3>Table density</h3><p>Choose comfortable or compact rows.</p></div><select data-input="density" aria-label="Table density"><option value="comfortable" ${state.density === 'comfortable' ? 'selected' : ''}>Comfortable</option><option value="compact" ${state.density === 'compact' ? 'selected' : ''}>Compact</option></select></div><div class="setting-row"><div><h3>Workspace view</h3><p>Sample business data or recorded project facts.</p></div><select data-input="mode" aria-label="Workspace view"><option value="demo" ${state.mode === 'demo' ? 'selected' : ''}>Demo</option><option value="checkpoint" ${state.mode === 'checkpoint' ? 'selected' : ''}>Checkpoint</option></select></div>${button('reset-preferences', 'Reset display preferences', 'button')}`)}${panel('Workspace information', facts([['Site audience', 'Private owner workspace'], ['HOTL business session', 'Not connected'], ['Business API access', 'Disabled'], ['Credentials stored here', 'None'], ['Checkpoint recorded', checkpoint.reviewedOn], ['Interface updated', '2026-10-08']]) + `<p class="panel-copy">The profile identifies this owner-facing interface, not a verified HOTL business login. Account and sharing settings remain managed by Sites.</p>`)}</div>`;
}

export function renderView(state) {
  const route = state.route;
  if (route === 'dashboard') return dashboard(state);
  if (route === 'readiness' || gates.some(g => g.id === route)) return readinessPage(route);
  if (route === 'integrations') return integrationsPage(state);
  if (route === 'guardrails') return guardrailsPage();
  if (route === 'autonomy') return autonomyPage();
  if (route === 'settings') return settingsPage(state);
  if (state.mode !== 'demo') return checkpointView(route);
  if (['products', 'orders', 'inventory', 'customers', 'suppliers', 'approvals'].includes(route)) return recordPage(state);
  if (route === 'agents') return agentPage(state);
  if (route === 'finance') return financePage(state);
  if (route === 'activity') return activityPage(state);
  if (route === 'marketing') return marketingPage(state);
  return dashboard(state);
}

export function detailView(id, mode) {
  const integration = id.startsWith('INTEGRATION:') ? integrations.find(i => i.id === id.slice(12)) : null;
  if (integration) return { title: integration.name, subtitle: 'Actual setup requirements', content: badge(integration.status) + `<p class="detail-intro">${esc(integration.description)}</p>${list(integration.requirements)}${link(integration.route, 'Review readiness', 'button primary full')}` };
  if (mode !== 'demo') return null;
  const note = `<div class="notice compact">${icon('info')}<p>Illustrative example. No live business record or action.</p></div>`;
  const p = products.find(p => p.id === id);
  if (p) return { title: p.name, subtitle: 'Sample product', content: note + `<div class="product-detail-mark ${p.tone}">${esc(p.mark)}</div>` + facts([['Example SKU', p.sku], ['Category', p.category], ['Example price', money(p.price)], ['Example unit cost', money(p.cost)], ['Available units', p.stock - p.reserved], ['Reserved units', p.reserved], ['Sample supplier', p.supplier], ['Status', p.status]]) + `<p class="panel-copy">Publishing, price changes, and inventory adjustments require the authenticated HOTL guardrail.</p>` };
  const o = orders.find(o => o.id === id);
  if (o) {
    const item = products.find(p => p.id === o.productId);
    return { title: o.id, subtitle: 'Sample order', content: note + badge(o.status) + facts([['Fictional customer', o.customer], ['Example date', o.date], ['Product', item.name], ['Quantity', o.quantity], ['Example total', money(o.total)], ['Payment / fulfillment receipt', 'Not a real transaction']]) + `<h3>Example journey</h3><ol class="steps"><li>Order example created</li><li>Payment step is illustrative</li><li>${esc(o.status)} · sample status</li></ol><p class="panel-copy">No payment, shipment, refund, or customer message can be issued here.</p>` };
  }
  const a = approvals.find(a => a.id === id);
  if (a) return { title: a.title, subtitle: 'Sample approval request', content: note + badge(a.status) + `<p class="detail-intro">${esc(a.summary)}</p>` + facts([['Example request', a.id], ['Agent role', a.agent], ['Illustrative amount', money(a.amount)]]) + '<h3>Required checks</h3>' + list(a.checks) + `<div class="boundary-note">${icon('lock')}<p>Approve, reject, and execute are unavailable in this preview. Use the authenticated HOTL cockpit for real decisions.</p></div>` };
  const c = customers.find(c => c.id === id);
  if (c) return { title: c.name, subtitle: 'Fictional customer', content: note + facts([['Example customer', c.id], ['Segment', c.segment], ['Example orders', c.orders], ['Total of listed examples', money(c.total)]]) + '<h3>Example order history</h3>' + table(['Order', 'Total'], orders.filter(o => o.customer === c.name).map(o => [recordButton(o.id, o.id), money(o.total)]), 'Example customer order history') };
  const s = suppliers.find(s => s.id === id);
  if (s) return { title: s.name, subtitle: 'Fictional supplier', content: note + facts([['Example status', s.status], ['Example lead time', `${s.lead} days`], ['Catalog products', s.products], ['Purchase orders', 'No real supplier orders']]) + list(products.filter(p => p.supplier === s.name).map(p => p.name)) };
  const agent = id.startsWith('AGENT:') ? agents.find(a => a.id === id.slice(6)) : null;
  if (agent) return { title: agent.name, subtitle: 'Sample agent workflow', content: note + badge(agent.status) + `<p class="detail-intro">${esc(agent.description)}</p><h3>Example workflow</h3><ol class="steps">${agent.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol><h3>Context and memory</h3><p class="panel-copy">${esc(agent.context)} Workflow checkpoints are operational state; they do not establish customer-learning memory.</p><h3>Action boundary</h3><p class="panel-copy">Runtime agents use scoped credentials. Financial and public changes must pass the deterministic guardrail. No runtime agent is connected here.</p>` };
  const campaign = campaigns.find(c => c.id === id);
  if (campaign) return { title: campaign.name, subtitle: 'Sample campaign brief', content: note + badge(campaign.status) + `<p class="detail-intro">${esc(campaign.note)}</p>` + facts([['Channel', campaign.channel], ['Example audience', campaign.audience], ['Approved spend', 'None'], ['Publication', 'Unavailable']]) + link('gate-a', 'Review business requirements', 'button full') };
  return null;
}
