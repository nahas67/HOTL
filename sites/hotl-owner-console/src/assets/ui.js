import { money, dateLabel, metrics } from './data.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  bot: '<rect x="4" y="7" width="16" height="13" rx="4"/><path d="M12 3v4M1 12v4m22-4v4M8 16h8"/><path d="M8 11v1m8-1v1"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r=".8"/>',
  box: '<path d="m12 3 9 5v9l-9 5-9-5V8zm0 10v9M3 8l9 5 9-5M7 5.8l9 5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v4zm14-9a4 4 0 0 1 4 4v5M16 4a3 3 0 0 1 0 6"/>',
  truck: '<path d="M1 5h13v12H1zm13 4h5l4 4v4h-9"/><circle cx="5" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  chart: '<path d="M3 21h18M5 17V9h3v8zm6 0V4h3v13zm6 0V1h3v16z"/>',
  wallet: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 8h18m-6 5h6v4h-6z"/>',
  link: '<path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 2 2-2a4 4 0 0 0-6-6l-2 2" transform="translate(3 2)"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4m-2-2h4"/>',
  shield: '<path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6z"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
  rocket: '<path d="M9 15c-4-7 2-12 12-12 0 10-5 16-12 12zm0 0-3 3m0-10H3v7h4m9 2v4H9v-4"/><circle cx="16" cy="8" r="2"/>',
  settings: '<path d="m9 3 1-2h4l1 2 3 2 3 1 1 4-2 2v3l1 3-3 3-3-1h-3l-2 2-4-1-1-3-2-3-2-1v-4l2-1 2-3z" transform="translate(1 1) scale(.9)"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 8 3 8 3 10H3c0-2 3-2 3-10m4 13h4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 15v6h16v-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4zM7 8h10M7 12h7"/>',
  file: '<path d="M5 2h9l5 5v15H5zm9 0v6h5M8 12h8M8 16h8"/>',
  server: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6v1m0 10v1"/>',
};
export const icon = (name, cls = '') => `<svg class="icon ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.box}</svg>`;
export function badge(value) {
  const tone = /Active|Delivered|Shipped|Reconciled|Brief ready|Sample partner/i.test(value) ? 'green' : /Pending|Processing|Awaiting|Draft ready/i.test(value) ? 'blue' : /Required|Low stock|Needs|Review needed|On hold/i.test(value) ? 'amber' : /Out of stock|Unavailable|Not connected|Unverified|Blocked/i.test(value) ? 'red' : 'neutral';
  return `<span class="badge ${tone}">${esc(value)}</span>`;
}
export const link = (route, label, cls = 'button') => `<a class="${cls}" href="#${esc(route)}">${esc(label)}</a>`;
export const button = (action, label, cls = 'button', extra = '') => `<button type="button" class="${cls}" data-action="${esc(action)}" ${extra}>${label}</button>`;
export const panel = (title, content, options = {}) => `<section class="panel ${options.className || ''}"><div class="panel-head"><div><h2>${esc(title)}</h2>${options.subtitle ? `<p>${esc(options.subtitle)}</p>` : ''}</div>${options.action || ''}</div>${content}</section>`;
export const heading = (title, sub, actions = '') => `<div class="page-heading"><div><h1 tabindex="-1">${esc(title)}</h1><p>${esc(sub)}</p></div><div class="heading-actions">${actions}</div></div>`;
export const sampleNote = (text = 'Illustrative sample data · USD is an example currency, not an approved pilot choice.') => `<p class="data-note">${icon('info')}${esc(text)}</p>`;
export const empty = (title, text, action = '') => `<div class="empty"><div class="empty-icon">${icon('link')}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
export const facts = items => `<dl class="facts">${items.map(([name, value]) => `<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
export const list = items => `<ul class="check-list">${items.map(text => `<li>${icon('info')}<span>${esc(text)}</span></li>`).join('')}</ul>`;
export function table(columns, rows, label = 'Records') {
  return `<div class="table-scroll" role="region" aria-label="${esc(label)}" tabindex="0"><table><caption class="sr-only">${esc(label)}</caption><thead><tr>${columns.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(cells => `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}"><div class="table-empty">No matching records. Try another search or clear the filters.</div></td></tr>`}</tbody></table></div>`;
}
export function toolbar(state, options = [], filterLabel = 'Status') {
  return `<div class="table-toolbar"><label class="field-search">${icon('search')}<input type="search" data-input="query" aria-label="Search records" placeholder="Search records" value="${esc(state.query)}"></label><label class="select-label"><span>${esc(filterLabel)}</span><select data-input="filter" aria-label="${esc(filterLabel)}">${['All', ...options].map(v => `<option ${state.filter === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>${button('clear-filters', 'Clear filters', 'text-button')}</div>`;
}
export const recordButton = (id, text) => button('detail', esc(text), 'record-link', `data-id="${esc(id)}"`);
export const productName = p => `<div class="product-name"><span class="product-mark ${p.tone}">${esc(p.mark)}</span><div>${recordButton(p.id, p.name)}<span class="secondary">${esc(p.sku)}</span></div></div>`;
export const avatar = name => `<span class="avatar">${esc(name.split(' ').map(s => s[0]).slice(0, 2).join(''))}</span>`;
export function kpis(items) {
  return `<div class="kpi-band">${items.map(({ label, value, note, positive }) => `<article class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div><div class="kpi-note ${positive ? 'positive' : ''}">${esc(note)}</div></article>`).join('')}</div>`;
}
export function performanceChart(days, kind = 'revenue') {
  const { rows } = metrics(days);
  const key = kind === 'orders' ? 'orders' : 'revenue';
  const previousKey = kind === 'orders' ? 'previousOrders' : 'previous';
  const maximum = Math.ceil(Math.max(...rows.map(r => Math.max(r[key], r[previousKey]))) / (kind === 'orders' ? 4 : 40000)) * (kind === 'orders' ? 4 : 40000);
  const left = 52, top = 12, width = 708, height = 193;
  const points = field => rows.map((r, i) => [left + (i / (rows.length - 1)) * width, top + height - (r[field] / maximum) * height]);
  const path = p => p.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const current = path(points(key)), previous = path(points(previousKey));
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const y = top + i * height / 4;
    const label = kind === 'orders' ? maximum * (1 - i / 4) : money(maximum * (1 - i / 4), false);
    return `<line class="chart-grid" x1="${left}" x2="${left + width}" y1="${y}" y2="${y}"/><text class="chart-text" x="${left - 10}" y="${y + 4}" text-anchor="end">${esc(label)}</text>`;
  }).join('');
  const labels = [0, Math.floor((rows.length - 1) / 4), Math.floor((rows.length - 1) / 2), Math.floor((rows.length - 1) * .75), rows.length - 1].map(i => `<text class="chart-text" x="${left + i / (rows.length - 1) * width}" y="238" text-anchor="middle">${dateLabel(rows[i].date)}</text>`).join('');
  return `<svg class="performance-chart" viewBox="0 0 790 252" role="img" aria-label="Illustrative daily ${kind} for ${days} days; current and previous example periods. Exact totals are above."><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#388264" stop-opacity=".16"/><stop offset="100%" stop-color="#388264" stop-opacity="0"/></linearGradient></defs>${ticks}<path d="${current} L${left + width},${top + height} L${left},${top + height} Z" fill="url(#chart-fill)"/><path d="${previous}" class="chart-previous"/><path d="${current}" class="chart-current"/>${points(key).map(([x, y], i) => `<circle class="chart-point" cx="${x}" cy="${y}" r="4" tabindex="0"><title>${dateLabel(rows[i].date)}: ${kind === 'orders' ? rows[i][key] + ' sample orders' : money(rows[i][key]) + ' sample revenue'}</title></circle>`).join('')}${labels}</svg>`;
}
export const percent = (value, previous) => `${value >= previous ? '+' : ''}${((value - previous) / previous * 100).toFixed(1)}% vs previous example period`;
