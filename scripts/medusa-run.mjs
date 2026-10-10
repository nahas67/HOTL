// Every command in apps/commerce-core/medusa, launched through the N9 environment scrub.
//
// apps/commerce-core/medusa is an isolated npm project OUTSIDE the pnpm workspace, so the scrubbed
// launcher the rest of the repository shares (`scripts/build-env.mjs`) never sees it: `.github/
// workflows/ci.yml` enters it with `working-directory: apps/commerce-core/medusa` and
// `npm ci && npm test`, and neither npm nor `@medusajs/cli` filters an environment. That step
// therefore ran -- and locally still runs -- with the whole parent environment, credential
// namespaces included, and it executes the guarded-payment refusal matrix, the one thing standing
// between a Medusa refund and an unguarded provider call.
//
// Routing its build and test path through the same fail-closed allowlist used by `pnpm build`
// closes the second way in. It also has to be done in the package's own scripts: the workflow is
// not edited here, so the guarantee lives in the code that runs rather than in the caller that
// asks for it, which is the same reason the Next build is wrapped rather than relying on the root
// launcher.
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolvePackageBin, runScrubbed } from './build-env.mjs';
import { buildEnvironmentFor } from './dev-env.mjs';

// npm and pnpm both run a package script with that package's directory as the working directory.
const packageDir = process.cwd();

// The glob in the original `tsx --test test/*.test.ts` was expanded by the shell that npm invoked.
// Expanding it here keeps the command shell-free: no shell means no PATH lookup and no
// second interpreter between the scrub and the test process.
function testFiles() {
  const dir = resolve(packageDir, 'test');
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.test.ts'))
    .sort()
    .map((name) => `test/${name}`);
  if (files.length === 0) {
    throw new Error(`No *.test.ts files found in ${dir}.`);
  }
  return files;
}

const medusa = () => resolvePackageBin(packageDir, '@medusajs/cli', 'medusa');

// `medusa-config.ts` calls `required()` on six names at module load, so every command that loads
// the config fails without them -- `medusa build` refuses to start, it does not build a degraded
// project. They are re-admitted from the parent environment AFTER the scrub, and only for those
// commands.
//
// This is a deliberate, package-local exception and it is bounded in three ways:
//
//   * The shared allowlist in dev-env.mjs is NOT changed, so no other build in the repository can
//     inherit any of these names.
//   * `test` and `typecheck` are excluded. The guarded-payment suite imports modules directly and
//     never loads medusa-config.ts, so `npm test` -- the only medusa command CI runs -- receives
//     the scrubbed environment and nothing more.
//   * `scripts/dev.mjs` starts medusa with its own `environmentFor('medusa', ...)` allowlist, so
//     the local development launcher remains independent of this list.
//
// The residual risk is that `medusa build` holds this service's own database DSN and two signing
// secrets. That is inherent to the config's fail-closed design, not something this wrapper
// chooses. What this wrapper removes is every credential that belongs to something else: agent
// tooling, the LiteLLM proxy master key, and the provider write keys that AGENTS.md rule 5
// confines to the guardrail service.
const configInputs = [
  'PORT',
  'REDIS_URL',
  'STORE_CORS',
  'ADMIN_CORS',
  'AUTH_CORS',
  'GUARDRAIL_URL',
  'MEDUSA_DATABASE_URL',
  'MEDUSA_JWT_SECRET',
  'MEDUSA_COOKIE_SECRET',
  'MEDUSA_GUARDRAIL_TOKEN',
];

const withConfigInputs = (source) => {
  const env = buildEnvironmentFor(source);
  for (const name of configInputs) {
    if (source[name] !== undefined && env[name] === undefined) env[name] = source[name];
  }
  return env;
};

const commands = {
  build: () => [medusa(), ['build'], withConfigInputs],
  dev: () => [medusa(), ['develop'], withConfigInputs],
  start: () => [medusa(), ['start'], withConfigInputs],
  'db:migrate': () => [medusa(), ['db:migrate'], withConfigInputs],
  // No config inputs: neither of these loads medusa-config.ts.
  typecheck: () => [resolvePackageBin(packageDir, 'typescript', 'tsc'), ['--noEmit'], buildEnvironmentFor],
  test: () => [resolvePackageBin(packageDir, 'tsx', 'tsx'), ['--test', ...testFiles()], buildEnvironmentFor],
};

const [command, ...extraArgs] = process.argv.slice(2);

try {
  if (!existsSync(resolve(packageDir, 'package.json'))) {
    throw new Error(
      `${packageDir} has no package.json. medusa-run.mjs is meant to be run as a package script, ` +
      'which is what gives it the package directory to work in.',
    );
  }
  if (!commands[command]) {
    throw new Error(
      `Unknown medusa command "${command ?? ''}". Known: ${Object.keys(commands).join(', ')}.`,
    );
  }
  const [script, args, environmentFor] = commands[command]();
  process.exit(await runScrubbed(packageDir, script, [...args, ...extraArgs], environmentFor(process.env)));
} catch (error) {
  console.error(`medusa "${command ?? ''}" could not run: ${error.message}`);
  process.exit(1);
}