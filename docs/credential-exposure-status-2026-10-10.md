# Credential exposure status — 2026-10-10

Independent re-verification of the 2026-10-08 local credential-exposure finding, plus a
review of the CI hardening added on 2026-10-10. Written by the security reviewer.

No credential value, prefix, or token string appears in this document. Findings are
identified by file path, line, variable name, and type only.

## Verdict

| Question | Answer |
| --- | --- |
| Is the disclosed PAT currently readable from any tracked file, git history, or the on-disk build cache? | **No.** Verified clean. |
| Is `.next/` or any build cache tracked in git? | **No.** Zero tracked build-cache paths; all are ignored. |
| Does a build cache exist on disk right now that could re-absorb a secret? | **Yes** — `apps/cockpit/.next`, 458.1 MB / 1,995 files, written continuously. |
| Can a CI workflow or build step serialize an environment secret into a build artifact? | **No, in CI.** Verified independently (see below). |
| Can any workflow pass a secret into a `docker build` arg or image layer? | **No.** Zero `--build-arg` / `--secret` / `--build-context` in the repository. |
| Can the exposure recur **locally**? | **Yes.** The build path has no environment allowlist. Root cause now established. |
| Has the exposed PAT been revoked or scoped? | **Unknown — outstanding.** No rotation evidence exists in this repository. |

**Overall: contained, but not closed.** Repository exposure is clean today. Two owner
actions remain open (§7), and one unmitigated local path can recreate the finding (§5.2).

---

## 1. Build cache state on disk, right now

| Path | Size | Files | Created | Last write |
| --- | --- | --- | --- | --- |
| `apps/cockpit/.next` | 458.1 MB | 1,995 | 2026-10-08 23:29 | 2026-10-10 05:19 |
| `apps/cockpit/.next/cache/turbopack` (production build cache) | — | 200 | 2026-10-08 23:29 | 2026-10-08 23:29 |
| `apps/cockpit/.next/dev/cache/turbopack` (dev cache) | — | 103 | 2026-10-08 23:29 | 2026-10-10 05:21 |
| `apps/storefront/.next` | 112.0 MB | 344 | 2026-10-08 23:29 | 2026-10-09 02:06 |

`.next/` was being written while this review ran. A `next dev` stack was live in this
workspace throughout, launched by `node scripts/dev.mjs` (pid 26044, child pids 21176 /
22252 running Next.js), started by another agent with
`HOTL_TEST_INSTANCE_DIR=.data/e2e-cockpit-audit`.

### Scan result

Both caches were scanned with counts-only pattern matching, so no matched value was ever
emitted. Patterns covered: the disclosed PAT shapes (fine-grained and classic), private-key
headers, JWTs, bearer literals, and the literal variable names named in the 2026-10-08
finding.

- `GITHUB_MCP_TOKEN` — **absent** from every file in both caches.
- Fine-grained and classic PAT shapes — **absent**.
- Private keys, JWTs, bearer literals — **absent**.
- `.turbo/` caches for all nine packages — **absent** for all five agent-credential names.

Matches that did appear are explained and are not credentials:

- `AKIA…`-shaped strings, 11 occurrences each, inside
  `apps/cockpit/.next/standalone/node_modules/.pnpm/next@16.3.4_…/next/dist/compiled/@edge-runtime/primitives/load.js`
  and `…/compiled/edge-runtime/index.js`. These are constants inside Next.js's own vendored
  edge-runtime bundle, i.e. `node_modules` code the repository does not control.
- Long base64-ish runs in `.sst` caches, `.js` and `.js.map` files: minified vendor source
  and source-map payloads for `next`, `react-dom`, `zod`, `recharts` and `@supabase/auth-js`.
  Verified by classification, not assumption — see §4.

## 2. Tracking and ignore status — re-verified

```
tracked build-cache paths (git ls-files | rg '\.next|turbopack|\.turbo|cache/'): 0
apps/cockpit/.next/                  IGNORED  (.gitignore:2)
apps/storefront/.next/               IGNORED  (.gitignore:2)
apps/cockpit/.next/cache/turbopack   IGNORED  (.gitignore:2)
.turbo/                              IGNORED  (.gitignore:4)
artifacts/                           IGNORED  (.gitignore:18)
```

Total tracked files: 320. No real `.env`, `.env.local`, or `.env.production` file exists
anywhere in the workspace outside `node_modules`. `tests/repository-hygiene.test.mjs:48`
already enforces this as a test (it asserts `.env*`, `.next/`, `*.pem`, `*.key`, `*.p12`,
`*.pfx`, `*.sqlite`, `artifacts/`, `*.zip` stay ignored, and that no real `.env` is
tracked), so this is a regression-guarded property, not just a convention.

Note: `.gitignore` covers `.next/` but does **not** cover `apps/cockpit/out/` or
`apps/cockpit/.vercel/`. Neither directory exists, and the project uses
`output: 'standalone'` rather than static export, so this is latent rather than active.

## 3. CI hardening — independent verification

The 2026-10-10 change added job-level `env:` blocks. I verified the change rather than
assuming it correct. Both workflows were parsed with PyYAML 6.0.3.

### 3.1 It is correct

| Property | `ci.yml` | `kill-switch-ci.yml` | Verdict |
| --- | --- | --- | --- |
| YAML parses | yes | yes | **Valid** |
| `GITHUB_MCP_TOKEN` | `''` (empty string) | `''` | **Genuinely blanked** |
| `MCP_TOKEN` | `''` | `''` | **Genuinely blanked** |
| `ANTHROPIC_API_KEY` | `''` | `''` | **Genuinely blanked** |
| `OPENAI_API_KEY` | `''` | `''` | **Genuinely blanked** |
| `DEEPSEEK_API_KEY` | `''` | `''` | **Genuinely blanked** |
| Step-level `env:` overrides | none | none | Job block cannot be silently overridden |
| `GITHUB_TOKEN` blanked | no | no | **Correctly left alone** |
| `${{ secrets.* }}` occurrences | 0 | 0 | No secret is ever expanded |
| `${{ github.token }}` / `${{ vars.* }}` | 0 / 0 | 0 / 0 | Not used |
| `permissions` | `contents: read` | `contents: read` | Correctly minimal |

"Blanked rather than merely absent" was checked explicitly: each value is a true empty
string, not a null or a missing key. That distinction matters — a build tool reading
`process.env.X` receives `''` instead of `undefined`, so a truthiness check on the variable
cannot be used to smuggle a value through.

`GITHUB_TOKEN` is correctly excluded. GitHub Actions never injects it into a step's
environment automatically; it is reachable only through the `secrets` context, which these
workflows never use. Blanking it would have been inert at best and misleading at worst.
`kill-switch-ci.yml` additionally removes it from the image-build process with `env -u`,
which is harmless defence in depth.

`permissions: contents: read` is already applied at workflow level, so the Actions token is
read-only even if it were somehow reached.

### 3.2 The retry wrapper is behaviourally correct

`run_container_check` was extracted from both workflows and syntax-checked with
`bash -n` (Git for Windows bash 5.x; note `bash` on `PATH` here is the unconfigured WSL
stub and cannot execute). Both files: exit 0.

It was then executed against four scenarios to confirm the wrapper cannot convert a
failure into a pass:

| Test | Scenario | Observed | Result |
| --- | --- | --- | --- |
| 1 | Genuine failure, no transient signature | exit 42 propagated, 1 attempt | **PASS** — no retry |
| 2 | Transient failure then success | exit 0, 2 attempts | **PASS** — retried, then passed |
| 3 | Transient failure that never recovers | exit 7 after 3 attempts | **PASS** — non-zero |
| 4 | Step continues past a failed check? | marker never printed | **PASS** — aborts |

The wrapper is finite, propagates the original exit code on every non-success path, and
retries only on registry/network signatures.

### 3.3 Image digest claims are true — verified, not assumed

The claims recorded in the workflow comments were checked against the live registries:

```
ghcr.io/gitleaks/gitleaks:v8.28.0   Digest: sha256:cdbb7c95…1eeaba854
docker.io/zricethezav/gitleaks:v8.28.0  Digest: sha256:cdbb7c95…1eeaba854   IDENTICAL

public.ecr.aws/docker/library/node:22-alpine    Digest: sha256:0a7108bf…2bc2e402
docker.io/library/node:22-alpine                Digest: sha256:0a7108bf…2bc2e402   IDENTICAL
```

Per-platform manifest digests also match in both pairs. The "byte-identical mirror"
claims are accurate, and both are now pinned by digest.

## 4. What is exposed to the browser vs. what stays server-side

This is the question the earlier review did not answer concretely, so it was answered from
the **actual built output**, not from source reading.

### 4.1 Inlined into the client bundle

Only two variables, both browser-public by design:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

`apps/cockpit/next.config.ts` declares no `env` key, so nothing else is force-inlined.
Per Next.js 16 documentation, only `NEXT_PUBLIC_`-prefixed variables are inlined into
browser JavaScript; unprefixed variables are replaced with an empty string.

The Supabase **anon** key is designed to be public and is constrained by row-level
security. `SUPABASE_SERVICE_ROLE_KEY` is **not** `NEXT_PUBLIC_`-prefixed and is
**absent** from every file in both build caches. That is the correct outcome and it was
verified, not assumed.

### 4.2 Names that appear in a client bundle — labels, not values

`apps/cockpit/.next/static/chunks/08bnvb0q4d6d1.js` (874,800 bytes) contains the strings
`SHOPIFY_CLIENT_SECRET`, `AGENT_JWT_KEYS`, `GUARDRAIL_DATABASE_URL` and `DATABASE_URL`.
This is worth stating explicitly because the names look alarming.

Each was classified programmatically without emitting any value:

| Classification | Occurrences |
| --- | --- |
| Complete string literal immediately followed by a closing quote (a field label) | 8 |
| Assignment of a value to any `*_SECRET` / `*_KEY` / `*_TOKEN` / `*_PASSWORD` / `*_DATABASE_URL` / `*_PRIVATE` variable | **0** |

These are configuration-field labels rendered by the cockpit Settings page. **No value is
present.** Every occurrence of each name is immediately closed by a quote, so none is an
assignment.

### 4.3 Server-side only

`apps/cockpit/src/app/api/[...path]/route.ts` and `apps/cockpit/src/lib/proxy.ts` read
`KILL_SWITCH_OWNER_TOKEN`, `KILL_SWITCH_READ_TOKEN`, `HOTL_INTERNAL_TOKEN` and the service
URLs. None is `NEXT_PUBLIC_`-prefixed; none appears in any client bundle. They stay on the
server.

`NEXT_PUBLIC_SUPABASE_ANON_KEY` does appear in a server chunk
(`apps/cockpit/.next/server/chunks/_0--f3d2._.js`), which is expected and harmless.

One observation, not a finding: these reads have hard-coded demo fallbacks
(`hotl-demo-kill-owner-token`, `hotl-demo-kill-read-token`, `hotl-local-development-token`).
These are documented local-simulation placeholders, echoed by `.env.example:3,9,10`, and are
tracked in source by design. They are not credentials.

## 5. Root cause — established empirically

The earlier review recorded the mechanism as "a build-tool behaviour, not a HOTL source
defect." That is close, but the actual mechanism is now identified, and it changes the fix.

### 5.1 `turbo.json` strict env mode passes `GITHUB_*` through

`turbo.json` declares no `env`, `globalEnv`, or `passThroughEnv`. That looks protective:
Turbo defaults to strict env mode, filtering the environment handed to each task. An
allowlist probe run against `turbo 2.10.12` (scratch workspace outside this repository, so
no repository file was modified) shows that strict mode still passes through a fixed set of
framework variables regardless:

| Variable | Survives `turbo run` with no env declarations? |
| --- | --- |
| `GITHUB_MCP_TOKEN` | **PASSES THROUGH** |
| `GITHUB_TOKEN`, `GITHUB_ACTIONS`, `GITHUB_ZZZ_ANYTHING` | **PASSES THROUGH** |
| `NEXT_PUBLIC_FAKE`, `NEXT_FAKE` | **PASSES THROUGH** |
| `NODE_OPTIONS`, `CI`, `TURBO_TOKEN`, `VERCEL_FAKE` | **PASSES THROUGH** |
| `MCP_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` | filtered |
| `AWS_SECRET_ACCESS_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | filtered |
| `ZZZ_RANDOM_UNRELATED` | filtered |
| `GITHUB` (bare, no underscore) | filtered |

**This is the root cause.** Any variable whose name begins `GITHUB_` reaches the Next.js
build regardless of Turbo's env filtering. `pnpm build` is `turbo run build`, and the build
script for `@hotl/cockpit` runs `next build` — so `GITHUB_MCP_TOKEN` was handed to the build
process, and Turbopack's filesystem cache (`turbopackFileSystemCacheForBuild`, default
`true`, writes to `.next/cache/turbopack`) serialized it to disk.

It is **not** purely "build-tool behaviour": it is the interaction of a CI-framework-named
agent credential with a build toolchain that forwards CI-named variables. A credential named
without the `GITHUB_` prefix would not have been exposed this way.

### 5.2 The local build path is still unguarded

`pnpm dev` **is** protected: `scripts/dev.mjs:76` spawns each service with
`environmentFor(service, env)` from `scripts/dev-env.mjs`, a strict allowlist. No allowlist
contains `GITHUB_MCP_TOKEN`, so the dev path cannot receive it. This is a genuinely good
control and the reason the live dev cache scanned clean.

The gap is asymmetric:

| Entry point | Environment control | Can receive `GITHUB_MCP_TOKEN`? |
| --- | --- | --- |
| `pnpm dev` | allowlist (`dev-env.mjs`) | **No** |
| `pnpm build` (`turbo run build`) | none + Turbo `GITHUB_*` passthrough | **Yes** |
| `next build` / `next dev` run directly in `apps/cockpit` | none | **Yes** |
| `turbo run test`, `pnpm test:e2e` | none + Turbo passthrough | **Yes** |
| CI `pnpm build` | job-level blanking | **No** (verified §3.1) |

**The deletion of the cache is therefore not a durable control.** The cache is 458 MB and is
regenerated on every build and dev session. Until either the build entry points gain an
environment allowlist equivalent to `dev-env.mjs`, or the build is invoked with a scrubbed
environment, a `pnpm build` run from any shell that has this credential exported will
recreate the exact finding.

`turbo.json` already does one helpful thing: `"outputs": [".next/**", "!.next/cache/**"]`
excludes the turbopack cache from Turbo's own output snapshot, so the cache is not
propagated between machines by `turbo`. That does **not** prevent the local disk write,
which is where the secret was found.

## 6. Findings and residual paths

### F1 — CI hardening is correct and sufficient for CI. **No action.**

Verified in §3. The job-level blanking, the `env -u` scrub, the `permissions` block, and the
absence of any `secrets.` reference mean no CI step can serialize an environment secret into
a build artifact.

### F2 — gitleaks container mounts the repository **read-write**. Action recommended.

`.github/workflows/ci.yml:155` and `:158` both use `-v "$PWD:/repo"` with no `:ro`. The
credential-scan image is therefore granted write access to the entire workspace. The image
is now digest-pinned, which materially reduces the risk, and the image only reads — so
adding `:ro` breaks nothing:

```
docker run --rm -v "$PWD:/repo:ro" -w /repo "$gitleaks" …
```

In CI the checkout contains no `.env` and no `.next`, so there is currently no sensitive
file for the container to expose. The finding is the write capability, not a data leak.
**Routing to the workflow owner; not edited by this reviewer.**

### F3 — The local build entry points have no environment allowlist. **Highest residual risk.**

See §5.2. This is the path that produced the original finding and it remains open. The fix
belongs in the root `package.json` `build`/`dev` scripts or a small pre-build wrapper that
removes `GITHUB_*`-prefixed agent credentials from `process.env` before spawning Turbo —
reusing the allowlist pattern already proven in `scripts/dev-env.mjs`. Not implemented by
this reviewer (outside write scope).

### F4 — CI blanking is a denylist of five names. Acceptable, but bounded.

The blanking covers the agent-tooling credentials that caused the finding. It would not
cover a repository or organization secret with any other name. Today that is theoretical:
both workflows reference zero `secrets.`, so there is nothing else to leak. Noted so the
guarantee is not later mistaken for a general one.

### F5 — The kill-switch image artifact is publicly downloadable. Constraint must hold.

`kill-switch-ci.yml` uploads `kill-switch-image.tar` via `actions/upload-artifact@v4`.
Artifacts are retrievable by anyone with repository read access, for the retention window.
Nothing can currently be baked in, and this was verified:

- `infra/kill-switch/Dockerfile` declares **no** `ARG` and no credential-bearing `ENV`; the
  only `ENV` is `NODE_ENV`/`HOTL_MODE`/`KILL_SWITCH_*` host and path settings.
- The workflow passes **no** `--build-arg` and **no** `--secret`.
- The Dockerfile uses explicit `COPY` of named paths — never `COPY . .` — so
  `infra/kill-switch/.env`, `.npmrc`, `test/` and `dist/` cannot enter the context
  regardless. `.dockerignore` additionally excludes `node_modules`, `data`, `test`, `dist`,
  `.env*`.
- No `.env` and no `.npmrc` exist anywhere in the repository (outside `node_modules`).

This is correct as written. It is a standing constraint, not a one-time fix: adding a
`COPY . .` or a credential `ARG` to that Dockerfile would turn a downloadable artifact into
a public disclosure.

### F6 — Cache deletion is not evidence of a durable fix.

The prior review reported ~505 MB deleted and re-scanned clean. The cache present now is
458.1 MB with a creation timestamp of 2026-10-08 23:29. Windows/OneDrive creation
timestamps are not reliable provenance evidence, so I make **no claim** about whether a
deletion occurred. What is verifiable is the current state: both caches are clean, the
production turbopack cache directory still exists with 200 files, and both directories are
ignored and untracked. The control that matters is F3, not the deletion.

## 7. Owner actions still outstanding

**These cannot be performed from the repository and are not verifiable from here.**

1. **Revoke the exposed fine-grained PAT, or re-scope it and then revoke the old one.**
   The 2026-10-08 review recorded this as an owner action; there is no evidence in this
   repository that it was done. It was written to disk in plaintext by a build process, so
   it must be treated as disclosed regardless of the cache having been deleted and
   resourced. Recommended order: create a new scoped token → deploy it → revoke the old one
   → confirm no dependent automation broke.
2. **Scope it correctly when replacing.** The MCP GitHub server needs repository read and
   issue/PR access only. It does not need write access to this repository, and a fine-grained
   PAT scoped to this repo alone would have limited the blast radius. Check the token's
   current repository selection and permission set at the same time as revoking.
3. **Separate the build environment from agent tooling.** This is the durable control for
   the whole class. Builds should not inherit agent-tooling credentials. F3 makes the
   repository-side half of this concrete.

## 8. What I could and could not verify

**Verified directly:**
`git ls-files` / `git check-ignore` tracking state; on-disk cache presence, size and
timestamps; pattern scan of both `.next` caches and all `.turbo` caches (counts only, no
value ever printed); classification of every secret-shaped name in the client bundle; YAML
parse and env semantics of both workflows; `bash -n` and four behavioural tests of the retry
wrapper; `env -u` removal semantics; live registry digests for both pinned images; Turbo
env-passthrough behaviour; parent-process chain of the running dev stack; absence of
`.env`/`.npmrc` files; kill-switch build-context contents.

**Could not verify:**
- Whether the PAT has been revoked. No repository artefact records rotation, and I have no
  access to the GitHub token settings.
- Whether the earlier ~505 MB cache deletion actually occurred (§F6).
- Whether any secret ever reached the three published ZIPs. Not re-checked here; the
  2026-10-08 review recorded them clean and that claim is inherited, not independently
  confirmed.
- Credential material in git history: I relied on the CI gitleaks configuration and the
  2026-10-08 full-history result rather than re-running a full-history scan (no local
  `gitleaks` binary, and no Docker daemon guarantee in this environment).
- Whether any currently-running process holds the disclosed PAT in its environment. I
  deliberately did not enumerate process environments, to avoid reading credential values.

**Not attempted:** running a build, because a build is precisely the operation that
creates the artifact class under review.

## 9. Recommended follow-up, in priority order

1. Owner: revoke/scope/replace the disclosed PAT (§7). Nothing else closes the finding.
2. Repository: give `build` and the other Turbo entry points an environment allowlist, so
   the `GITHUB_*` passthrough can no longer deliver an agent credential to `next build` (F3).
3. Repository: add `:ro` to both gitleaks volume mounts (F2) — owned by the workflow
   editor, not this reviewer.
4. Repository: consider a post-build assertion that no credential-shaped value appears in
   `.next/cache/turbopack`, so recurrence is caught automatically rather than by review.