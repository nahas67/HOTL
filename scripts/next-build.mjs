// The Next.js production build, launched through the N9 environment scrub.
//
// `apps/cockpit` and `apps/storefront` both point their `build` script at this file. It exists
// because the root `pnpm build` scrub is not enough on its own:
//
//   * `pnpm --filter @hotl/cockpit build`, `turbo run build --filter=@hotl/cockpit` and a bare
//     `next build` inside `apps/cockpit` enter the build WITHOUT `scripts/build-env.mjs` in the
//     process tree. Any of them would hand `next` the developer's full environment, and Turbopack
//     serialises whatever it is given into `.next/cache/turbopack/*.sst` in plaintext -- which is
//     exactly how the disclosed `GITHUB_MCP_TOKEN` reached disk on 2026-10-08.
//
// So the scrub is applied here, in the process that actually spawns Next, rather than only in the
// root launcher. Every way into the Next build now converges on the one allowlist in
// `scripts/dev-env.mjs`; there is no longer a path that reaches the bundler unsanitised.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolvePackageBin, runScrubbed } from './build-env.mjs';

// npm and pnpm both run a package script with that package's own directory as the working
// directory, so this is the app that asked for the build and the only place its `next` may be
// resolved from. Resolving from the repository root instead would pick up whatever version the
// workspace root happens to link, which need not be the version the app declares.
const packageDir = process.cwd();

try {
  if (!existsSync(resolve(packageDir, 'package.json'))) {
    throw new Error(
      `${packageDir} has no package.json. next-build.mjs is meant to be run as a package "build" ` +
      'script, which is what gives it the package directory to build.',
    );
  }

  // `next`'s own manifest declares `bin: { next: "./dist/bin/next" }`, so this resolves
  // <packageDir>/node_modules/next/dist/bin/next. Reading the manifest rather than trusting PATH
  // matters twice over: the PATH entry would be a `.cmd` shim on Windows, and an arbitrary
  // `next` earlier in PATH could be an entirely different program. A missing install produces a
  // named, actionable error instead of a confusing child-process failure.
  const next = resolvePackageBin(packageDir, 'next', 'next');

  // `next build` first, then whatever the caller appended -- `pnpm build -- --profile` reaches
  // here as `process.argv.slice(2)` and is forwarded verbatim.
  process.exit(await runScrubbed(packageDir, next, ['build', ...process.argv.slice(2)]));
} catch (error) {
  console.error(`next build could not run: ${error.message}`);
  process.exit(1);
}