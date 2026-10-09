import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { readFile, unlink } from "node:fs/promises";
import { environmentFor, isolatedTestEnvironment } from './dev-env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const tsx = require.resolve("tsx/cli");
const testInstance = process.env.HOTL_TEST_INSTANCE_DIR;
const testRoot = testInstance ? resolve(testInstance) : undefined;
if (testRoot) {
  const location = relative(resolve(root, '.data'), testRoot);
  if (!location || location.startsWith('..') || isAbsolute(location) || !/^e2e-[a-z0-9-]+$/i.test(location))
    throw new Error('Browser test state must use a distinct .data/e2e-<id> directory.');
}
try {
  if (!testRoot)
  process.loadEnvFile(resolve(root, ".env"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const source = testRoot ? isolatedTestEnvironment(process.env) : process.env;
const env = {
  ...source,
  HOTL_MODE: source.HOTL_MODE ?? "simulation",
  HOTL_INTERNAL_TOKEN:
    source.HOTL_INTERNAL_TOKEN ?? "hotl-local-development-token",
  KILL_SWITCH_READ_TOKEN:
    source.KILL_SWITCH_READ_TOKEN ?? "hotl-demo-kill-read-token",
  KILL_SWITCH_OWNER_TOKEN:
    source.KILL_SWITCH_OWNER_TOKEN ?? "hotl-demo-kill-owner-token",
  KILL_SWITCH_DEMO_PASSWORD:
    source.KILL_SWITCH_DEMO_PASSWORD ?? "confirm-local-stop",
  KILL_SWITCH_PORT: testRoot ? '14200' : source.KILL_SWITCH_PORT ?? '4200',
  KILL_SWITCH_URL: testRoot ? 'http://127.0.0.1:14200' : source.KILL_SWITCH_URL ?? 'http://127.0.0.1:4200',
  KILL_SWITCH_JOURNAL: testRoot ? resolve(testRoot, 'kill-events.jsonl') : resolve(root, "infra/kill-switch/data/events.jsonl"),
  GUARDRAIL_STATE_PATH: testRoot ? resolve(testRoot, 'guardrail-state.json') : resolve(root, "data/guardrail-state.json"),
  CONNECTOR_KEY_PATH: testRoot ? resolve(testRoot, 'connectors.key') : resolve(root, '.secrets/connectors.key'),
  ORCHESTRATOR_STATE_PATH: testRoot ? resolve(testRoot, 'orchestrator-checkpoints.json') : resolve(root, "data/orchestrator-checkpoints.json"),
  NEXT_TELEMETRY_DISABLED: "1",
};
if (env.HOTL_MODE !== "simulation")
  throw new Error(
    "The local demo launcher is simulation-only. Use the deployment runbooks for other environments.",
  );
// A killed development process cannot release its lock. Confirm the recorded
// process is gone before removing just that lock; preserve the one-way journal.
const killLock = `${env.KILL_SWITCH_JOURNAL}.lock`;
try {
  const recorded = await readFile(killLock, "utf8");
  const pid = Number(recorded);
  if (!Number.isInteger(pid) || pid <= 0)
    throw new Error(
      "Invalid emergency-stop lock. Follow the recovery runbook.",
    );
  try {
    process.kill(pid, 0);
    throw new Error(`Emergency-stop process ${pid} is already running.`);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
    if ((await readFile(killLock, "utf8")) !== recorded)
      throw new Error("Emergency-stop lock changed during recovery.");
    await unlink(killLock);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const children = [];
const recentOutput = new Map();
let stopping = false;
function start(label, args, cwd = root) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: environmentFor(label, env),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Keep the tail of each child's own output. When one exits, dev.mjs tears down the whole
  // stack and every later check fails with ECONNREFUSED, which reads as a cascade of unrelated
  // failures. On 2026-09-10 that hid an orchestrator crash for five rounds because the child's
  // real error was never surfaced next to the teardown notice.
  recentOutput.set(label, []);
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      const text = String(data);
      const lines = recentOutput.get(label);
      for (const line of text.split(/\r?\n/)) if (line.trim()) lines.push(line);
      if (lines.length > 40) lines.splice(0, lines.length - 40);
      process.stdout.write(`[${label}] ${text}`);
    });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => process.stdout.write(`[${label}] ${data}`));
  child.on("exit", (code, signal) => {
    if (!stopping && (code || signal)) {
      console.error(`\n========== ${label} EXITED (${code ?? signal}) ==========`);
      console.error("Last output from this service -- this is the cause, not the ECONNREFUSED");
      console.error("errors that follow from the teardown:");
      for (const line of recentOutput.get(label) ?? []) console.error(`  ${line}`);
      console.error(`===========================================================\n`);
      stop(code ?? 1);
    }
  });
  children.push(child);
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500).unref();
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
start("kill-switch", [tsx, "infra/kill-switch/src/index.ts"]);
start("guardrails", [tsx, "apps/guardrail-service/src/index.ts"]);
start("commerce", [tsx, "apps/commerce-core/src/server.ts"]);
start("orchestrator", [tsx, "apps/orchestrator/src/server.ts"]);
for (const [name, port] of [
  ["cockpit", "3000"],
  ["storefront", "3001"],
]) {
  const app = resolve(root, "apps", name);
  const appRequire = createRequire(resolve(app, "package.json"));
  const next = appRequire.resolve("next/dist/bin/next");
  start(name, [next, "dev", "--hostname", "127.0.0.1", "--port", port], app);
}
console.log(
  "\nHOTL simulation starting. Cockpit: http://127.0.0.1:3000 · Storefront: http://127.0.0.1:3001\n",
);
