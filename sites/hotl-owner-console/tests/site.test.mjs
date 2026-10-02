import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkpoint, navigation } from "../src/assets/checkpoint.js";

const root = new URL("../", import.meta.url);

test("all requested cockpit sections are represented without invented telemetry", () => {
  assert.deepEqual(navigation.map(({ id }) => id), [
    "overview", "agents", "approvals", "products", "orders", "finance",
    "integrations", "autonomy", "guardrails", "activity", "gate-a", "gate-c",
  ]);
  assert.equal(checkpoint.liveConnection, false);
  assert.equal(checkpoint.commerceActionsEnabled, false);
  assert.equal(checkpoint.gateC.missingConfiguration, 19);
  assert.match(checkpoint.sections.approvals.body, /cannot read, submit, approve, or reject/);
  assert.match(checkpoint.sections.agents.body, /active runs, decisions, and service health are unknown/);
});

test("Gate A keeps owner-controlled values unknown while allowing AI research only", () => {
  assert.equal(checkpoint.gateA.status, "OWNER INPUT REQUIRED");
  assert.match(checkpoint.gateA.summary, /cannot approve the business/);
  assert.ok(checkpoint.gateA.unknowns.includes("Capital and protected reserve"));
  assert.ok(checkpoint.gateA.unknowns.includes("Business stop and escalation thresholds"));
});

test("static hosting package has no business database, secrets, or external backend binding", async () => {
  const manifest = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.static, { directory: "dist" });
  assert.equal(Object.hasOwn(manifest, "d1"), false);
  assert.equal(Object.hasOwn(manifest, "r2"), false);
});

test("document security policy blocks external connections and mutation forms", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../src/assets/app.js", import.meta.url), "utf8");
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.doesNotMatch(html, /<form\b|https?:\/\//i);
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/);
});

test("build emits every local asset referenced by the page", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  for (const asset of ["/assets/styles.css", "/assets/app.js", "/assets/favicon.svg"]) {
    const path = new URL(`../dist${asset}`, import.meta.url);
    await readFile(path);
    assert.ok(html.includes(asset), `${asset} must be linked by the built page`);
  }
  await readFile(new URL("../dist/assets/checkpoint.js", import.meta.url));
});
