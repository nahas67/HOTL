// Independent-deployment safety for the emergency plane.
//
// Two defects are asserted here.
//
// 1. `src/index.ts` defaulted an unset `HOTL_MODE` to `simulation`, and simulation mode's owner
//    token, read token and reauthentication password are the demo values tracked in this
//    repository. An operator who simply omitted one environment variable therefore started a
//    write-capable emergency control with published credentials. An unset mode must fail closed.
//    The container path must stay safe: `Dockerfile` pins `HOTL_MODE=live`, and that is asserted
//    here too so the fail-closed change can never quietly strand a real deployment.
//
// 2. `.github/workflows/kill-switch-ci.yml` ran only on pull requests, so the Dockerfile and
//    compose path were never re-validated after a merge to `main`.
import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(fileURLToPath(import.meta.url), '../..');
const repositoryRoot = resolve(packageRoot, '../..');
const entrypoint = join(packageRoot, 'src', 'index.ts');

const children: ChildProcess[] = [];
const directories: string[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

const delay = (ms: number) => new Promise(done => setTimeout(done, ms));

async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-kill-deployment-'));
  directories.push(directory);
  return directory;
}

/** Ask the OS for an unused loopback port so a listener is unambiguous evidence. */
async function freePort() {
  const probe = createServer();
  await new Promise<void>(done => probe.listen(0, '127.0.0.1', done));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(done => probe.close(() => done()));
  return port;
}

/** The ambient environment minus every variable that could carry emergency authority or a mode. */
function operatorEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (/^(HOTL_|KILL_|KILL_HOOK_|NODE_OPTIONS)/.test(name)) continue;
    env[name] = value;
  }
  return { ...env, ...overrides };
}

type Launched = { child: ChildProcess; exit: Promise<number | null>; text: () => string };

function launch(env: NodeJS.ProcessEnv): Launched {
  const child = spawn(process.execPath, ['--import', 'tsx', entrypoint], {
    cwd: packageRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout?.on('data', chunk => { output += String(chunk); });
  child.stderr?.on('data', chunk => { output += String(chunk); });
  return { child, exit: new Promise(done => child.once('exit', code => done(code))), text: () => output };
}

async function waitForBanner(started: Launched) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (started.text().includes('listening on')) return;
    if (started.child.exitCode !== null) return;
    await delay(100);
  }
}

/** Minimal indentation-aware readers for the one workflow file this package owns. */
function block(lines: string[], key: string, pattern: RegExp) {
  const start = lines.findIndex(line => pattern.test(line));
  if (start < 0) return [];
  const indent = lines[start].search(/\S/);
  if (indent < 0) return [];
  const out: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    if (lines[index].trim() === '') continue;
    if (lines[index].search(/\S/) <= indent) break;
    out.push(lines[index]);
  }
  return out;
}
const topLevel = (source: string, key: string) => block(source.split(/\r?\n/), key, new RegExp(`^${key}:`));
const nested = (lines: string[], key: string) => block(lines, key, new RegExp(`^\\s+${key}:`));
const scalarList = (lines: string[]) =>
  lines.map(line => line.trim()).filter(line => line.startsWith('- ')).map(line => line.slice(2).trim().replace(/^['"]|['"]$/g, ''));
/** Read a mapping key's scalar entries in either flow (`[a, b]`) or block (`- a`) style. */
function valuesFor(lines: string[], key: string) {
  const index = lines.findIndex(line => new RegExp(`^\\s+${key}\\s*:`).test(line));
  if (index < 0) return [];
  const inline = lines[index].match(/\[([^\]]*)\]/);
  if (inline) return inline[1].split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  return scalarList(nested(lines, key));
}

describe('independent emergency-plane deployment', () => {
  it('refuses to start when HOTL_MODE is unset instead of silently simulating with published demo credentials', async () => {
    const directory = await workspace();
    const port = await freePort();
    const journal = join(directory, 'events.jsonl');
    const started = launch(operatorEnvironment({
      KILL_SWITCH_JOURNAL: journal, KILL_SWITCH_PORT: String(port), KILL_SWITCH_HOST: '127.0.0.1',
    }));
    const code = await Promise.race([started.exit, delay(25_000).then(() => 'STILL_RUNNING' as const)]);
    expect(code, `an unset HOTL_MODE must stop startup, not serve. Output: ${started.text()}`).not.toBe('STILL_RUNNING');
    if (code === 'STILL_RUNNING') return;
    expect(code).not.toBe(0);
    // The operator is told which variable is missing instead of inheriting a demo mode.
    expect(started.text()).toMatch(/HOTL_MODE/);
    expect(started.text()).not.toContain('listening on');
    // Nothing may have become reachable, and no emergency journal may have been created.
    await expect(fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) })).rejects.toThrow();
    await expect(stat(journal)).rejects.toThrow();
    await expect(stat(`${journal}.lock`)).rejects.toThrow();
  }, 40_000);

  it('still starts a local simulation when simulation is requested explicitly', async () => {
    const directory = await workspace();
    const port = await freePort();
    const started = launch(operatorEnvironment({
      HOTL_MODE: 'simulation', KILL_SWITCH_JOURNAL: join(directory, 'events.jsonl'),
      KILL_SWITCH_PORT: String(port), KILL_SWITCH_HOST: '127.0.0.1',
    }));
    await waitForBanner(started);
    expect(started.text(), `local development must still start. Output: ${started.text()}`).toContain('listening on');
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(5000) });
    expect(((await response.json()) as { mode?: string }).mode).toBe('simulation');
    expect(started.child.exitCode, 'the local simulation must keep running').toBeNull();
  }, 40_000);

  it('rejects any mode other than an explicit simulation or live', async () => {
    const directory = await workspace();
    const started = launch(operatorEnvironment({
      HOTL_MODE: 'Live', KILL_SWITCH_JOURNAL: join(directory, 'events.jsonl'), KILL_SWITCH_PORT: '0',
    }));
    const code = await Promise.race([started.exit, delay(25_000).then(() => 'STILL_RUNNING' as const)]);
    expect(code, 'a mode that is not exactly live or simulation must stop startup').not.toBe('STILL_RUNNING');
    if (code === 'STILL_RUNNING') return;
    expect(code).not.toBe(0);
    expect(started.text()).toMatch(/HOTL_MODE/);
  }, 40_000);

  it('keeps the container and the deployment template pinned to live mode', async () => {
    const dockerfile = await readFile(join(packageRoot, 'Dockerfile'), 'utf8');
    const runtimeEnv = dockerfile.split(/\r?\n/).find(line => /^ENV\s/.test(line)) ?? '';
    // The container is the only real deployment path; failing closed must not strand it.
    expect(runtimeEnv, 'the runtime stage must pin a mode').toMatch(/\bHOTL_MODE=live\b/);
    expect(runtimeEnv).not.toMatch(/\bHOTL_MODE=simulation\b/);
    expect(dockerfile).toMatch(/^CMD \["node", "dist\/index\.js"\]$/m);
    const template = await readFile(join(packageRoot, '.env.example'), 'utf8');
    expect(template, 'the deployment template must pin live mode').toMatch(/^HOTL_MODE=live$/m);
  });

  it('rebuilds the kill-switch image on main so the Dockerfile path is validated after merge', async () => {
    const workflow = await readFile(join(repositoryRoot, '.github', 'workflows', 'kill-switch-ci.yml'), 'utf8');
    const triggers = topLevel(workflow, 'on');
    const push = nested(triggers, 'push');
    expect(valuesFor(push, 'branches'), 'no push trigger on main').toContain('main');
    const pushPaths = valuesFor(push, 'paths');
    expect(pushPaths, 'a push trigger must cover the package it builds').toContain('infra/kill-switch/**');
    expect(pushPaths).toContain('.github/workflows/kill-switch-ci.yml');
    // Adding the push trigger must not cost the existing pull-request coverage.
    expect(valuesFor(nested(triggers, 'pull_request'), 'paths')).toContain('infra/kill-switch/**');
    // Adding the push trigger must not cost the existing manual dispatch route.
    expect(triggers.some(line => /^\s+workflow_dispatch:/.test(line))).toBe(true);
  });

  it('keeps the kill-switch workflow free of deployment steps and secrets', async () => {
    const workflow = await readFile(join(repositoryRoot, '.github', 'workflows', 'kill-switch-ci.yml'), 'utf8');
    expect(workflow).toContain('docker build');
    expect(workflow).toContain('docker save');
    expect(workflow).not.toMatch(/docker\s+(login|push)/);
    expect(workflow).not.toMatch(/\bsecrets\./);
    expect(workflow).not.toMatch(/\b(aws|gcloud|az|doctl|kubectl|helm|flyctl|railway|heroku|terraform)\b/);
    expect(workflow).toMatch(/permissions:\s*\n\s+contents: read/);
  });
});