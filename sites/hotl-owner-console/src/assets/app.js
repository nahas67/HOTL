import { checkpoint, navigation } from "./checkpoint.js";

const root = document.querySelector("#section-content");
const navButtons = [...document.querySelectorAll("[data-section]")];
const breadcrumb = document.querySelector("#breadcrumb-current");
const themeToggle = document.querySelector("#theme-toggle");

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function badge(text, tone = "amber") {
  const result = node("span", `badge badge-${tone}`, text);
  return result;
}

function factList(facts) {
  const list = node("ul", "fact-list");
  for (const fact of facts) {
    const item = node("li", "fact-item");
    item.append(node("span", "fact-mark", "—"), node("span", "", fact));
    list.append(item);
  }
  return list;
}

function pageHeading(eyebrow, title, intro) {
  const heading = node("div", "page-heading");
  heading.append(node("div", "eyebrow", eyebrow), node("h1", "", title), node("p", "page-intro", intro));
  return heading;
}

function statCard(label, value, note, tone = "neutral", mark = "—") {
  const card = node("article", `stat-card stat-${tone}`);
  const top = node("div", "stat-top");
  top.append(node("span", "stat-label", label), node("span", "stat-mark", mark));
  card.append(top, node("div", "stat-value", value), node("div", "stat-note", note));
  return card;
}

function panel(title, subtitle, content, extraClass = "") {
  const section = node("section", `panel ${extraClass}`.trim());
  const header = node("div", "panel-header");
  header.append(node("h2", "panel-title", title));
  if (subtitle) header.append(node("p", "panel-subtitle", subtitle));
  section.append(header, content);
  return section;
}

function factPanel(title, subtitle, facts, tone = "neutral") {
  const body = node("div", "panel-body");
  body.append(badge(tone === "red" ? "BLOCKED" : tone === "amber" ? "NOT CONNECTED" : "REPOSITORY FACT", tone), factList(facts));
  return panel(title, subtitle, body);
}

function renderOverview() {
  const section = checkpoint.sections.overview;
  root.append(pageHeading(section.eyebrow, section.title, section.intro));

  const metrics = node("div", "metric-grid");
  metrics.append(
    statCard("BUSINESS MODE", "Simulation", "Default local mode; not a live environment probe", "amber", "S"),
    statCard("GATE A", "Owner input", "Risk envelope remains unapproved", "amber", "A"),
    statCard("GATE C", "Blocked", "19 staging settings missing; store not set up", "red", "C"),
    statCard("LIVE ACTIONS", "Disabled", "No spend, supplier, payment, or provider writes", "neutral", "×"),
  );
  root.append(metrics);

  const columns = node("div", "overview-columns");
  const priorities = node("div", "priority-list");
  const items = [
    { number: "01", tone: "amber", title: "Approve the business envelope", text: "AI may recommend a pilot. Country, product, economics, capital, reserve, exposure caps, refund limits, and stop rules still require owner approval." },
    { number: "02", tone: "red", title: "Provision isolated Shopify staging", text: "The development store, app, trusted HTTPS callback and webhook URLs, and staging services are not set up. No external probes ran." },
    { number: "03", tone: "blue", title: "Connect status only after identity review", text: "A future hosted cockpit needs a narrow, authenticated read API with freshness and tenant binding. It must not proxy general backend requests." },
  ];
  for (const item of items) {
    const row = node("article", "priority-row");
    row.append(node("span", `priority-number priority-${item.tone}`, item.number));
    const text = node("div", "priority-copy");
    text.append(node("h3", "", item.title), node("p", "", item.text));
    row.append(text, node("span", "priority-chevron", "›"));
    priorities.append(row);
  }
  columns.append(panel("Owner attention", "The next unresolved decisions and prerequisites", priorities));

  const right = node("div", "overview-right");
  const health = node("div", "health-card");
  health.append(node("div", "health-kicker", "SERVICE HEALTH"), node("div", "health-value", "Unknown"), node("p", "health-copy", "The Site does not poll HOTL services. Unknown means no telemetry was received—not that a service is healthy or down."));
  const signal = node("div", "health-signal");
  signal.append(node("span", "status-led led-neutral"), node("span", "", "No live signal"));
  health.append(signal);
  right.append(health);

  const architecture = node("div", "architecture-card");
  architecture.append(node("div", "health-kicker", "BOUNDARY CHECK"));
  const flow = node("div", "boundary-flow");
  for (const [index, label] of ["Private Site", "HOTL auth", "Guardrail", "Provider"].entries()) {
    const step = node("div", `flow-step ${index === 2 ? "flow-authority" : ""}`);
    step.append(node("span", "flow-index", `0${index + 1}`), node("span", "flow-label", label));
    flow.append(step);
    if (index < 3) flow.append(node("span", "flow-connector", "· · ·"));
  }
  architecture.append(flow, node("p", "architecture-note", "Only the deterministic guardrail authorizes consequential mutations. This Site stops before the first step."));
  right.append(architecture);
  columns.append(right);
  root.append(columns);

  const sectionStrip = node("div", "gate-strip");
  sectionStrip.append(
    compactGate("GATE A", checkpoint.gateA.status, "Risk envelope · owner decision", "amber"),
    compactGate("GATE C", checkpoint.gateC.status, "Shopify staging · prerequisites missing", "red"),
  );
  root.append(sectionStrip);
}

function compactGate(kicker, status, summary, tone) {
  const card = node("article", `compact-gate compact-${tone}`);
  const heading = node("div", "compact-gate-head");
  heading.append(node("span", "gate-kicker", kicker), badge(status, tone));
  card.append(heading, node("p", "", summary));
  return card;
}

function renderSimple(id) {
  const section = checkpoint.sections[id];
  root.append(pageHeading("OWNER CONTROL / READ ONLY", section.title, section.body));
  const width = node("div", "detail-grid");
  const detail = node("div", "detail-main");
  detail.append(factPanel("Recorded state", "Repository evidence only · no live request made", section.facts));
  width.append(detail);
  const note = node("aside", "detail-aside");
  note.append(node("div", "aside-icon", "i"), node("h2", "", "What this means"), node("p", "", "This screen does not read a connected service. Treat every current count and health value as unknown until a protected, authenticated source is attached and its timestamp is visible."), badge("SNAPSHOT · 03 OCT 2026", "blue"));
  width.append(note);
  root.append(width);
}

function renderGateA() {
  const gate = checkpoint.gateA;
  root.append(pageHeading("READINESS GATE / A", "The business envelope is not approved.", gate.summary));
  const top = node("div", "gate-status-card gate-status-amber");
  top.append(node("span", "status-led led-amber"), node("div", "", gate.status), badge("NO SPENDING AUTHORITY", "red"));
  root.append(top);
  const columns = node("div", "gate-detail-columns");
  const unknowns = node("div", "unknown-list");
  for (const item of gate.unknowns) {
    const row = node("div", "unknown-row");
    row.append(node("span", "unknown-icon", "?"), node("span", "", item), badge("UNKNOWN", "amber"));
    unknowns.append(row);
  }
  columns.append(panel("Still requires owner authority", "AI research is a recommendation, not approval", unknowns));
  const aside = node("aside", "callout-card");
  aside.append(node("div", "callout-kicker", "SAFE NEXT STEP"), node("h2", "", "Review the AI recommendation"), node("p", "", "The dated research recommendation can help select a candidate, but it does not establish legal suitability, supplier truth, verified economics, capital, risk ceilings, or owner consent."), node("p", "callout-foot", "Record and approve the final envelope in the authenticated HOTL cockpit."));
  columns.append(aside);
  root.append(columns);
}

function renderGateC() {
  const gate = checkpoint.gateC;
  root.append(pageHeading("READINESS GATE / C", "Shopify staging is not set up.", gate.summary));
  const stats = node("div", "metric-grid gate-metrics");
  stats.append(
    statCard("PREFLIGHT", "Blocked", `${gate.missingConfiguration} required settings are missing`, "red", "!"),
    statCard("DEVELOPMENT STORE", "Not set up", "No authorized test merchant", "amber", "S"),
    statCard("PUBLIC HTTPS", "Unavailable", "No trusted OAuth/webhook endpoints", "amber", "↗"),
    statCard("EXTERNAL PROOF", "Not run", "No active probe or Shopify request", "neutral", "—"),
  );
  root.append(stats);
  const checks = node("div", "check-list");
  for (const check of gate.checks) {
    const row = node("div", "check-row");
    const icon = node("span", "check-icon", check.includes("blocked") || check.includes("not set up") || check.includes("unavailable") ? "×" : "—");
    icon.setAttribute("aria-hidden", "true");
    row.append(icon, node("span", "", check));
    checks.append(row);
  }
  root.append(panel("Staging evidence checklist", "Local implementation is not proof of a provider interaction", checks));
  const stop = node("div", "stop-note");
  stop.append(node("span", "stop-mark", "!"), node("p", "", "No live Shopify OAuth, webhook registration, token rotation, product mutation, supplier order, advertising spend, or payment action is enabled by this deployment."));
  root.append(stop);
}

function render(id) {
  const nav = navigation.find((item) => item.id === id) ?? navigation[0];
  breadcrumb.textContent = nav.label;
  root.replaceChildren();
  if (id === "overview") renderOverview();
  else if (id === "gate-a") renderGateA();
  else if (id === "gate-c") renderGateC();
  else renderSimple(id);
  for (const button of navButtons) {
    const active = button.dataset.section === id;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  document.title = `HOTL · ${nav.label}`;
  document.querySelector("#main-content").focus({ preventScroll: true });
}

for (const button of navButtons) {
  button.addEventListener("click", () => render(button.dataset.section));
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute("aria-label", `Switch to ${theme === "light" ? "dark" : "light"} theme`);
  themeToggle.querySelector("span").textContent = theme === "light" ? "◑" : "◐";
  try { localStorage.setItem("hotl-sites-theme", theme); } catch { /* Theme remains usable without browser storage. */ }
}

let initialTheme = "dark";
try {
  const savedTheme = localStorage.getItem("hotl-sites-theme");
  if (savedTheme === "light" || savedTheme === "dark") initialTheme = savedTheme;
  else if (window.matchMedia("(prefers-color-scheme: light)").matches) initialTheme = "light";
} catch { /* Use the dark operator theme when browser storage is unavailable. */ }
setTheme(initialTheme);
themeToggle.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));

render("overview");
