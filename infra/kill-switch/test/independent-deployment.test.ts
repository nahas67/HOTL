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
//
// 3. Added 2026-10-10: on that branch every container step failed while authenticating to Docker
//    Hub -- 429 Too Many Requests, then 504 Gateway Timeout, then context deadline exceeded against
//    auth.docker.io -- while every code-level step stayed green. The base images moved to a
//    byte-identical mirror and are pinned by digest, and the container steps gained a bounded
//    retry. Those are exactly the kind of changes that get silently reverted as "unnecessary", so
//    they are asserted here along with the credential rules that keep agent tooling out of builds.
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

// ---------------------------------------------------------------------------------------
// Registry resilience. Added 2026-10-10.
//
// On 2026-10-10 every container step on the repair branch failed on Docker Hub authentication
// -- 429 Too Many Requests, then 504 Gateway Timeout, then context deadline exceeded against
// auth.docker.io -- while every code-level step in the same runs stayed green. The base images
// moved to a mirror and are pinned by digest, and the container steps gained a bounded retry.
// These assertions stop either half of that being quietly undone, and they stop a future edit
// from "simplifying" the mirror back into the outage.
//
// A note on placement: the main workflow's container checks are asserted here because this
// file already reads `.github/workflows/` from the repository root. Those two assertions
// belong in tests/repository-hygiene.test.mjs, which is outside this package's ownership.
// ---------------------------------------------------------------------------------------

/** The exact mirror reference and digest the Dockerfile must use, verified against Docker Hub. */
const NODE_BASE = 'public.ecr.aws/docker/library/node:22-alpine';
const NODE_DIGEST = 'sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402';
const POSTGRES_16_DIGEST = 'sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
const POSTGRES_18_DIGEST = 'sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873';
const GITLEAKS_DIGEST = 'sha256:cdbb7c955abce02001a9f6c9f602fb195b7fadc1e812065883f695d1eeaba854';

const workflowFile = async (name: string) => normalise(await readFile(join(repositoryRoot, '.github', 'workflows', name), 'utf8'));
const scriptFile = async (...parts: string[]) => normalise(await readFile(join(repositoryRoot, ...parts), 'utf8'));

/**
 * These assertions are about YAML and shell line structure, and this repository's working tree
 * uses CRLF. `$` in a multiline regex would otherwise anchor before the `\r`, so every
 * end-of-line assertion would fail for a reason that has nothing to do with the workflow.
 */
function normalise(source: string) {
  return source.replace(/\r\n/g, '\n');
}

describe('container base images are pinned and reachable', () => {
  it('pins every kill-switch build stage by digest from the mirror registry', async () => {
    const dockerfile = normalise(await readFile(join(packageRoot, 'Dockerfile'), 'utf8'));
    const stages = dockerfile.split(/\r?\n/).filter(line => /^FROM\s/.test(line));
    expect(stages, 'the two-stage build must keep both stages').toHaveLength(2);
    for (const line of stages) {
      expect(line, `every stage must be pinned by digest: ${line}`).toMatch(/^FROM\s\S+@sha256:[0-9a-f]{64}\s+AS\s/);
      expect(line, `every stage must use the verified mirror reference: ${line}`)
        .toContain(`${NODE_BASE}@${NODE_DIGEST}`);
    }
    // A bare tag is the exact thing that regressed, so name it rather than trusting the checks above.
    expect(dockerfile).not.toMatch(/^FROM node:22-alpine\s+AS/m);
  });

  it('records in the Dockerfile why the registry differs, so the mirror is not reverted', async () => {
    const dockerfile = normalise(await readFile(join(packageRoot, 'Dockerfile'), 'utf8'));
    expect(dockerfile).toMatch(/auth\.docker\.io/);
    expect(dockerfile).toMatch(/429 Too Many Requests/);
    // The digest comparison is what makes the substitution auditable rather than a leap of faith.
    expect(dockerfile).toMatch(/docker buildx imagetools inspect node:22-alpine/);
    expect(dockerfile).toMatch(/do not replace these references with `node:22-alpine`/i);
  });

  it('pins both disposable Postgres drill images by digest inside the drill scripts', async () => {
    const database = await scriptFile('infra', 'scripts', 'test-database.sh');
    const ledger = await scriptFile('infra', 'scripts', 'test-runtime-ledger.sh');
    expect(database).toContain(`public.ecr.aws/docker/library/postgres:16-alpine@${POSTGRES_16_DIGEST}`);
    expect(ledger).toContain(`public.ecr.aws/docker/library/postgres:18-alpine@${POSTGRES_18_DIGEST}`);
    // The pin has to be what is actually launched, not decoration inside a comment.
    expect(database).toMatch(/^docker run -d --name "\$container".*"\$postgres_image"/m);
    expect(ledger).toMatch(/^\s*"\$postgres_image"\)$/m);
    // A local escape hatch exists for debugging; it must never become the CI path.
    expect(database).toMatch(/HOTL_DRILL_POSTGRES_IMAGE:-/);
    expect(ledger).toMatch(/HOTL_DRILL_POSTGRES_IMAGE:-/);
    const workflow = await workflowFile('ci.yml');
    expect(workflow, 'CI must use the pinned default, never the local override')
      .not.toContain('HOTL_DRILL_POSTGRES_IMAGE');
  });

  it('runs the credential scan from the pinned gitleaks image on both history and working tree', async () => {
    const workflow = await workflowFile('ci.yml');
    expect(workflow).toContain(`ghcr.io/gitleaks/gitleaks:v8.28.0@${GITLEAKS_DIGEST}`);
    expect(workflow).toContain('git /repo --redact --no-banner --config /repo/.gitleaks.toml');
    expect(workflow).toContain('dir /repo --redact --no-banner --config /repo/.gitleaks.toml');
  });

  it('keeps every container check in the main workflow', async () => {
    const workflow = await workflowFile('ci.yml');
    // Both PostgreSQL drills, named as scripts and as announced check labels.
    expect(workflow).toContain('infra/scripts/test-database.sh');
    expect(workflow).toContain('infra/scripts/test-runtime-ledger.sh');
    expect(workflow).toContain("'migration-and-rls-drill'");
    expect(workflow).toContain("'runtime-ledger-drill'");
    expect(workflow).toContain("'credential-scan-git-history'");
    expect(workflow).toContain("'credential-scan-working-tree'");
    // No step may be quietly downgraded to a tolerated failure.
    expect(workflow).not.toMatch(/^\s*continue-on-error:/m);
    expect(workflow).not.toMatch(/if:\s*(always|success\(\)\s*\|\|\s*failure)/);
  });

  it('keeps the kill-switch image build and artifact export in the workflow', async () => {
    const workflow = await workflowFile('kill-switch-ci.yml');
    expect(workflow).toContain('docker build -t hotl-kill-switch:validated');
    expect(workflow).toContain('docker save hotl-kill-switch:validated -o kill-switch-image.tar');
    expect(workflow).toContain("'kill-switch-image-build'");
    expect(workflow).toContain("'kill-switch-image-export'");
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).not.toMatch(/^\s*continue-on-error:/m);
  });
});

describe('container steps retry within a finite budget', () => {
  for (const name of ['ci.yml', 'kill-switch-ci.yml']) {
    it(`${name} bounds its retries and can never turn a failure into a pass`, async () => {
      const workflow = await workflowFile(name);

      const attempts = workflow.match(/^\s*attempts=(\d+)\s*$/m);
      expect(attempts, `${name} must declare a numeric attempt budget`).not.toBeNull();
      const budget = Number(attempts![1]);
      expect(budget, 'the retry budget must be more than zero and small and finite')
        .toBeGreaterThan(0);
      expect(budget).toBeLessThanOrEqual(5);

      // The budget is spent *before* the loop can sleep again, which is what makes it finite.
      expect(workflow).toContain('if [[ "$attempt" -ge "$attempts" ]]');
      expect(workflow).toContain('backoff=$(( base_sleep * attempt ))');
      expect(workflow).toContain('sleep "$backoff"');

      // Both non-success exits propagate the failing command's own status rather than a zero.
      const propagations = workflow.match(/return "\$status"/g) ?? [];
      expect(propagations, 'exhausted budget and non-transient failure must both propagate')
        .toHaveLength(2);

      // A genuine failure is not transient and must not be retried at all.
      expect(workflow).toMatch(/if ! grep -Eqi "\$transient" "\$log"; then/);

      // Nothing that would swallow a failure.
      expect(workflow).not.toMatch(/^\s*continue-on-error:/m);
      expect(workflow).not.toMatch(/\|\|\s*true\b/);
    });
  }
});

describe('build processes cannot inherit agent credentials', () => {
  it('declares no credential-carrying ARG or ENV in the Dockerfile', async () => {
    const dockerfile = normalise(await readFile(join(packageRoot, 'Dockerfile'), 'utf8'));
    const declarations = dockerfile.split(/\r?\n/).filter(line => /^\s*(ARG|ENV)\s/.test(line));
    expect(declarations.length, 'the runtime stage still pins its environment').toBeGreaterThan(0);
    for (const line of declarations) {
      expect(line, `no ARG/ENV may carry a credential into an image layer: ${line}`)
        .not.toMatch(/token|secret|passw|credential|api[_-]?key|\bpat\b|private[_-]?key/i);
    }
  });

  it('passes no build argument or build secret to the image build', async () => {
    const workflow = await workflowFile('kill-switch-ci.yml');
    expect(workflow, 'no value may be smuggled into a layer through a build argument')
      .not.toMatch(/--build-arg/);
    expect(workflow, 'no value may be smuggled into a layer through a build secret')
      .not.toMatch(/--secret\b/);
  });

  it('starts the image build with agent-tooling credentials removed from its environment', async () => {
    const workflow = await workflowFile('kill-switch-ci.yml');
    expect(workflow).toMatch(/env -u GITHUB_MCP_TOKEN/);
    expect(workflow, 'the scrubbed environment must wrap the build itself')
      .toMatch(/env -u [A-Z_]+[^\n]*\\\n\s+-u [A-Z_]+[^\n]*\\\n\s+docker build/);
  });

  it('forces agent-tooling credentials empty for every step of both workflows', async () => {
    for (const name of ['ci.yml', 'kill-switch-ci.yml']) {
      const workflow = await workflowFile(name);
      for (const variable of ['GITHUB_MCP_TOKEN', 'MCP_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY']) {
        expect(workflow, `${name} must blank ${variable} at job level`)
          .toMatch(new RegExp(`^\\s+${variable}: ''$`, 'm'));
      }
      // GITHUB_TOKEN is scoped by `permissions: contents: read` and is used by checkout; blanking
      // it would be theatre that breaks the checkout and hides the real control.
      expect(workflow).not.toMatch(/^\s*GITHUB_TOKEN:\s*''$/m);
    }
  });
});
