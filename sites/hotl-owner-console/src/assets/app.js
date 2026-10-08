import { groups, pages, gates, checkpoint, normalizeRoute, searchWorkspace, report } from './data.js';
import { esc, icon, button, badge, list, link } from './ui.js';
import { renderView, detailView } from './views.js';

const preferenceKey = 'hotl-owner-ui-preferences-v2';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}') || {}; } catch { /* Preferences may be unavailable in private browsing. */ }
const state = {
  route: normalizeRoute(location.hash), mode: saved.mode === 'checkpoint' ? 'checkpoint' : 'demo',
  theme: saved.theme === 'dark' ? 'dark' : 'light', density: saved.density === 'compact' ? 'compact' : 'comfortable',
  days: 30, chart: 'revenue', query: '', filter: 'All',
};
const main = document.querySelector('#main-content');
const searchDialog = document.querySelector('#search-dialog');
const detailDialog = document.querySelector('#detail-dialog');
const mobileDialog = document.querySelector('#mobile-dialog');
let toastTimer;
function savePreferences() {
  try { localStorage.setItem(preferenceKey, JSON.stringify({ theme: state.theme, density: state.density, mode: state.mode })); } catch { /* Keep preferences in memory when storage is unavailable. */ }
}
function announce(message) { document.querySelector('#announcement').textContent = message; }
function toast(message) {
  const element = document.querySelector('#toast');
  clearTimeout(toastTimer); element.textContent = message; element.hidden = false;
  toastTimer = setTimeout(() => { element.hidden = true; }, 3500);
}
function renderNav() {
  const selected = state.route.startsWith('gate-') ? 'readiness' : state.route;
  const html = groups.map(([group, rows]) => `<div class="nav-group"><p>${esc(group)}</p>${rows.map(([id, label, symbol]) => `<a href="#${id}" class="nav-item ${selected === id ? 'selected' : ''}" ${selected === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${esc(label)}</span>${id === 'approvals' && state.mode === 'demo' ? '<span class="nav-count" aria-label="3 sample requests">3</span>' : ''}</a>`).join('')}</div>`).join('');
  document.querySelector('#desktop-nav').innerHTML = html;
  document.querySelector('#mobile-nav').innerHTML = html;
}
function shell() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.density = state.density;
  const label = pages.find(p => p.id === state.route)?.label || gates.find(g => g.id === state.route)?.label || 'Dashboard';
  document.title = `${label} · HOTL`;
  document.querySelector('#breadcrumb').textContent = label;
  document.querySelector('#private-label').innerHTML = `${icon('lock')}Private workspace`;
  document.querySelector('#mobile-menu').innerHTML = icon('menu');
  document.querySelector('#open-search').innerHTML = `${icon('search')}<span>Search workspace</span><kbd>Ctrl K</kbd>`;
  document.querySelector('#notifications').innerHTML = icon('bell') + '<span class="notification-dot"></span>';
  const toggle = document.querySelector('#theme-toggle');
  toggle.innerHTML = icon(state.theme === 'light' ? 'sun' : 'moon');
  toggle.setAttribute('aria-label', `Switch to ${state.theme === 'light' ? 'dark' : 'light'} theme`);
  const demo = state.mode === 'demo';
  document.querySelector('#mode-banner').innerHTML = `<div class="mode-description">${icon('info')}<p><strong>${demo ? 'DEMO WORKSPACE' : 'RECORDED CHECKPOINT'}</strong><span>${demo ? 'Sample data only. No commerce actions.' : `Recorded ${checkpoint.reviewedOn}. No live data or actions.`}</span></p></div><div class="mode-switch" aria-label="Data view">${button('mode-demo', 'Demo', demo ? 'active' : '', `aria-pressed="${demo}"`)}${button('mode-checkpoint', 'Checkpoint', !demo ? 'active' : '', `aria-pressed="${!demo}"`)}</div>`;
  document.querySelector('#footer-mode').textContent = demo ? 'Design preview · Data is illustrative' : `Repository checkpoint · ${checkpoint.reviewedOn}`;
  document.querySelectorAll('[data-action="close-dialog"]').forEach(el => { el.innerHTML = icon('close'); });
  renderNav();
}
function render(preserveFocus = false) {
  const active = document.activeElement;
  const input = preserveFocus && active?.dataset.input;
  const selection = input === 'query' ? active.selectionStart : null;
  main.innerHTML = renderView(state);
  shell();
  if (input) {
    const replacement = main.querySelector(`[data-input="${input}"]`);
    replacement?.focus({ preventScroll: true });
    if (selection !== null) replacement?.setSelectionRange(selection, selection);
  }
}
function closeDialogs() { [searchDialog, detailDialog, mobileDialog].forEach(d => { if (d.open) d.close(); }); }
function navigate(route, detail) {
  closeDialogs();
  const normalized = normalizeRoute(route);
  if (state.route !== normalized) {
    location.hash = normalized;
    // Detail is opened by the hash handler after the matching page is rendered.
    pendingDetail = detail || null;
  } else if (detail) openDetail(detail);
}
let pendingDetail = null;
function openDetail(id) {
  const detail = detailView(id, state.mode);
  if (!detail) return;
  document.querySelector('#detail-title').textContent = detail.title;
  document.querySelector('#detail-subtitle').textContent = detail.subtitle;
  document.querySelector('#detail-body').innerHTML = detail.content;
  if (!detailDialog.open) detailDialog.showModal();
}
function renderSearch() {
  const query = document.querySelector('#global-search').value;
  const rows = searchWorkspace(query, state.mode);
  document.querySelector('#search-results').innerHTML = rows.length ? rows.map(r => `<button type="button" class="search-result" data-action="search-result" data-route="${r.route}" ${r.detail ? `data-id="${r.detail}"` : ''}>${icon(r.icon)}<span><strong>${esc(r.title)}</strong><span>${esc(r.subtitle)}</span></span>${icon('chevron')}</button>`).join('') : '<div class="search-empty">No results. Try a page name, product, or order number.</div>';
}
function openSearch() {
  closeDialogs();
  document.querySelector('#global-search').value = '';
  document.querySelector('#global-search').placeholder = state.mode === 'demo' ? 'Search pages, products, or orders' : 'Search workspace pages';
  renderSearch(); searchDialog.showModal(); document.querySelector('#global-search').focus();
}
function setMode(mode) {
  state.mode = mode === 'checkpoint' ? 'checkpoint' : 'demo';
  state.query = ''; state.filter = 'All'; closeDialogs(); savePreferences(); render();
  announce(state.mode === 'demo' ? 'Demo view. All business data is illustrative.' : 'Recorded checkpoint view. Live metrics are unknown.');
}
function exportReport() {
  const data = report(state.mode, state.route, state.days);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url;
  anchor.download = `HOTL-${state.mode === 'demo' ? 'SAMPLE' : 'CHECKPOINT'}-${state.route}.json`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(state.mode === 'demo' ? 'Sample report exported. It contains no real business records.' : 'Recorded checkpoint exported. It contains no live telemetry.');
}
function showNotices() {
  closeDialogs();
  document.querySelector('#detail-title').textContent = 'Launch readiness notices';
  document.querySelector('#detail-subtitle').textContent = `Recorded checkpoint · ${checkpoint.reviewedOn}`;
  document.querySelector('#detail-body').innerHTML = `<p class="detail-intro">These are recorded setup requirements, not live notifications.</p>${gates.map(g => `<section class="notice-item">${badge(g.status)}<h3>${esc(g.name)}</h3><p>${esc(g.description)}</p>${link(g.id, 'Review requirements', 'text-button')}</section>`).join('')}`;
  detailDialog.showModal();
}
window.addEventListener('hashchange', () => {
  if (location.hash === '#main-content') return;
  state.route = normalizeRoute(location.hash); state.query = ''; state.filter = 'All';
  closeDialogs(); render(); window.scrollTo({ top: 0 });
  main.querySelector('h1')?.focus({ preventScroll: true });
  if (pendingDetail) { const detail = pendingDetail; pendingDetail = null; openDetail(detail); }
});

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) {
    if (event.target.closest('a[href^="#"]') && event.target.closest('dialog')) closeDialogs();
    return;
  }
  const action = target.dataset.action;
  if (action === 'theme') { state.theme = state.theme === 'light' ? 'dark' : 'light'; savePreferences(); shell(); if (state.route === 'settings') render(); }
  else if (action === 'mode-demo') setMode('demo');
  else if (action === 'mode-checkpoint') setMode('checkpoint');
  else if (action === 'search') openSearch();
  else if (action === 'close-dialog') target.closest('dialog').close();
  else if (action === 'menu') { closeDialogs(); mobileDialog.showModal(); }
  else if (action === 'detail') openDetail(target.dataset.id);
  else if (action === 'search-result') navigate(target.dataset.route, target.dataset.id);
  else if (action === 'chart') { state.chart = target.dataset.kind === 'orders' ? 'orders' : 'revenue'; render(); main.querySelector(`[data-kind="${state.chart}"]`)?.focus({ preventScroll: true }); }
  else if (action === 'clear-filters') { state.query = ''; state.filter = 'All'; render(); main.querySelector('[data-input="query"]')?.focus(); }
  else if (action === 'export') exportReport();
  else if (action === 'notices') showNotices();
  else if (action === 'reset-preferences') { state.theme = 'light'; state.density = 'comfortable'; setMode('demo'); toast('Display preferences reset in this browser.'); }
});
document.addEventListener('input', event => {
  if (event.target.id === 'global-search') renderSearch();
  if (event.target.dataset.input === 'query') { state.query = event.target.value; render(true); }
});
document.addEventListener('change', event => {
  const key = event.target.dataset.input, value = event.target.value;
  if (key === 'mode') { setMode(value); return; }
  if (key === 'filter') state.filter = value;
  else if (key === 'period') state.days = [7, 14, 30].includes(Number(value)) ? Number(value) : 30;
  else if (key === 'theme') state.theme = value === 'dark' ? 'dark' : 'light';
  else if (key === 'density') state.density = value === 'compact' ? 'compact' : 'comfortable';
  else return;
  savePreferences(); render(true);
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
});
[searchDialog, detailDialog, mobileDialog].forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
render();
