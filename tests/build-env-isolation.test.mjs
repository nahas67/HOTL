// N9 build/test credential isolation.
//
// On 2026-10-08 a live fine-grained GitHub PAT was serialized to disk in plaintext by the Next.js
// build: `apps/cockpit/.next/cache/turbopack/v16.3.4-299180d3/00000270.sst`. Reproduced on
// 2026-10-10 with a synthetic canary against the then-unmodified build: 2 occurrences in
// apps/cockpit, 2 in apps/storefront.
//
// These tests use a generated canary only. A real credential is never read, logged or printed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildEnvironmentFor } from '../scripts/dev-env.mjs';
import { presets, spawnStep, exitCode } from '../scripts/build-env.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const canary = `CANARY_DO_NOT_LOG_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

// Everything in this namespace is a credential or a provider/agent control plane. None of it may
// reach a compiler, a bundler, a test runner, or anything they spawn.
const credentials = {
  GITHUB_MCP_TOKEN: canary,
  GITHUB_PAT: canary,
  GITHUB_TOKEN: canary,
  GITHUB_APP_PRIVATE_KEY: canary,
  MCP_TOKEN: canary,
  ANTHROPIC_API_KEY: canary,
  OPENAI_API_KEY: canary,
  DEEPSEEK_API_KEY: canary,
  SUPABASE_SERVICE_ROLE_KEY: canary,
  LITELLM_MASTER_KEY: canary,
  LITELLM_ORCHESTRATOR_KEY: canary,
  STRIPE_SECRET_KEY: canary,
  STRIPE_WEBHOOK_SECRET: canary,
  SHOPIFY_CLIENT_SECRET: canary,
  KILL_SWITCH_OWNER_TOKEN: canary,
  KILL_SWITCH_READ_TOKEN: canary,
  KILL_SWITCH_DEMO_PASSWORD: canary,
  GUARDRAIL_DATABASE_URL: canary,
  HOTL_INTERNAL_TOKEN: canary,
  CONNECTOR_ENCRYPTION_KEY: canary,
  AGENT_JWT_SECRET: canary,
  AGENT_JWT_MASTER_ORCHESTRATOR: canary,
  TURBO_TOKEN: canary,
  AWS_SECRET_ACCESS_KEY: canary,
  VERCEL_TOKEN: canary,
};

test('no agent or provider credential survives into a build environment', () => {
  const env = buildEnvironmentFor({ ...credentials, CI: 'true' });
  for (const name of Object.keys(credentials)) {
    assert.equal(env[name], undefined, `${name} must not reach a build or test process`);
  }
});

test('the whole GITHUB_ namespace is blocked, including GITHUB_TOKEN', () => {
  // Blocking GITHUB_TOKEN does not break CI. `actions/checkout` reads `${{ github.token }}` from
  // the Actions expression context -- its `token` input defaults to exactly that -- and it is the
  // first step of the job, ahead of every process this covers. Actions does not expose a
  // GITHUB_TOKEN environment variable to `run:` steps unless a step maps the context into `env:`,
  // which .github/workflows/ci.yml never does.
  const env = buildEnvironmentFor({
    GITHUB_TOKEN: canary,
    GITHUB_ACTIONS: 'true',
    GITHUB_RUN_ID: '1',
    GITHUB_REPOSITORY: 'hotl/commerce',
    CI: 'true',
  });
  assert.deepEqual(Object.keys(env), ['CI']);
});

test('legitimate build and CI variables survive the scrub', () => {
  const source = {
    Path: 'C:\\Windows\\system32',
    SYSTEMROOT: 'C:\\Windows',
    TEMP: 'C:\\Temp',
    COMSPEC: 'C:\\Windows\\system32\\cmd.exe',
    CI: 'true',
    NODE_ENV: 'production',
    NODE_OPTIONS: '--max-old-space-size=4096',
    TURBO_FORCE: 'true',
    TURBO_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    NEXT_TELEMETRY_DISABLED: '1',
    HOTL_MODE: 'simulation',
    HOTL_PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
    GUARDRAIL_SERVICE_URL: 'http://127.0.0.1:4100',
    GUARDRAIL_AUTHORIZATION_VERSION: '3',
    KILL_SWITCH_URL: 'http://127.0.0.1:4200',
    KILL_SWITCH_JOURNAL: 'C:\\repo\\events.jsonl',
    KILL_SWITCH_PORT: '4200',
  };
  assert.deepEqual(buildEnvironmentFor(source), source);
});

test('pnpm plumbing survives but a registry credential stored in .npmrc does not', () => {
  const env = buildEnvironmentFor({
    npm_config_user_agent: 'pnpm/10.17.1',
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_cache_dir: 'C:\\pnpm-cache',
    'npm_config_//registry.npmjs.org/:_authToken': canary,
    NPM_CONFIG__AUTH: canary,
  });
  assert.deepEqual(env, {
    npm_config_user_agent: 'pnpm/10.17.1',
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_cache_dir: 'C:\\pnpm-cache',
  });
});

test('a real spawned process inherits the scrubbed environment, not the canary', async () => {
  // Proves the object handed to spawn() is what a compiler would actually see, not just that a
  // helper returns a filtered object.
  const child = spawnStep(
    null,
    ['-e', 'process.stdout.write(JSON.stringify(process.env))'],
    { ...buildEnvironmentFor({ ...process.env, GITHUB_MCP_TOKEN: canary, CI: 'true' }) },
    ['ignore', 'pipe', 'ignore'],
  );
  const chunks = [];
  child.stdout.on('data', (data) => chunks.push(data));
  const code = await exitCode(child);
  assert.equal(code, 0);
  const seen = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(seen.GITHUB_MCP_TOKEN, undefined);
  assert.equal(seen.CI, 'true');
  assert.ok(seen.Path || seen.PATH, 'the executable search path must survive');
});

test('every root script that builds, lints, typechecks or tests routes through the scrubbed launcher', () => {
  const scripts = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')).scripts;
  for (const name of ['build', 'lint', 'typecheck', 'test', 'test:e2e']) {
    const [command, preset] = scripts[name].split(' ');
    assert.equal(command, 'node', `${name} must run through the scrubbed launcher`);
    assert.equal(scripts[name], `node scripts/build-env.mjs ${name}`, `${name} must not bypass the scrub`);
    assert.ok(presets[name], `${name} must be a known launcher preset`);
  }
});

test('the launcher resolves commands explicitly instead of through a shell', () => {
  const source = readFileSync(resolve(repoRoot, 'scripts', 'build-env.mjs'), 'utf8');
  assert.ok(!/shell\s*:\s*true/.test(source), 'a shell would reintroduce PATH-based command resolution');
  // The scrub has to happen in the parent of Turbo; Turbo cannot filter a variable it already has.
  assert.match(source, /import \{ buildEnvironmentFor \} from '\.\/dev-env\.mjs'/);
});