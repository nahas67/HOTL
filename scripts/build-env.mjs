// Run a build or test command with an environment that cannot carry an agent credential.
//
// N9: on 2026-10-08 a live fine-grained PAT (`GITHUB_MCP_TOKEN`) reached `next build` through
// Turbo and was serialized into `apps/cockpit/.next/cache/turbopack/*.sst` in plaintext.
//
// The scrub must run before Turbo is spawned, because Turbo's strict env mode passes through the
// whole `GITHUB_*` prefix regardless of what `turbo.json` declares. So this process is the parent
// of Turbo, and it hands Turbo an environment in which the credential was never present. Turbo's
// passthrough cannot re-add a variable that its own parent does not have.
//
// Every root script that compiles, builds or tests routes through here. Commands are resolved
// from the workspace's own dependency manifests and executed as Node scripts with an explicit
// argv, so nothing depends on a shell, a `.cmd` shim, or PATH ordering.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnvironmentFor } from './dev-env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Resolve the executable of a direct dependency by reading its manifest `bin` field.
// `require.resolve` is not usable here: `eslint` and `@playwright/test` both declare an `exports`
// map that does not expose their bin files as subpaths.
function binOf(packageName, binName) {
  const manifest = resolve(root, 'node_modules', packageName, 'package.json');
  if (!existsSync(manifest)) {
    throw new Error(
      `Cannot find ${packageName}. Run "pnpm install" before the build and test scripts.`,
    );
  }
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
  const relative = typeof bin === 'string' ? bin : bin?.[binName];
  if (!relative) throw new Error(`${packageName} does not expose a "${binName}" executable.`);
  const executable = resolve(root, 'node_modules', packageName, relative);
  if (!existsSync(executable)) throw new Error(`Missing executable for ${packageName}.`);
  return executable;
}

// Each preset is an ordered list of steps. A step is either a Node script to run, or -- when
// `script` is null -- arguments for node itself. Extra arguments from the command line are
// forwarded to every step, which preserves `pnpm build --force` and `pnpm test:e2e --grep`.
export const presets = {
  build: () => [[binOf('turbo', 'turbo'), ['run', 'build']]],
  lint: () => [[binOf('eslint', 'eslint'), ['.']]],
  typecheck: () => [[binOf('turbo', 'turbo'), ['run', 'typecheck']]],
  'test:e2e': () => [[binOf('@playwright/test', 'playwright'), ['test']]],
  test: () => [
    // Root tests run first, then every workspace package's own suite. The original script chained
    // these with `&&`; the launcher preserves that by stopping at the first non-zero exit.
    [null, ['--test', 'tests/*.test.mjs']],
    [binOf('turbo', 'turbo'), ['run', 'test', '--concurrency=2']],
  ],
};

export function spawnStep(script, args, env, stdio = 'inherit') {
  return spawn(process.execPath, script ? [script, ...args] : args, {
    cwd: root,
    env,
    stdio,
    windowsHide: true,
  });
}

export function exitCode(child) {
  return new Promise((settle, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => settle(signal ? 1 : code ?? 1));
  });
}

export async function runPreset(name, extraArgs, source) {
  const preset = presets[name];
  if (!preset) {
    console.error(`Unknown build/test step "${name}". Known: ${Object.keys(presets).join(', ')}.`);
    return 2;
  }
  const env = buildEnvironmentFor(source);
  for (const [script, args] of preset()) {
    const code = await exitCode(spawnStep(script, [...args, ...extraArgs], env));
    if (code !== 0) return code;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [name, ...extraArgs] = process.argv.slice(2);
  process.exit(await runPreset(name, extraArgs, process.env));
}