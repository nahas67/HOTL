# Supply-chain, credential and archive review — 2026-10-08

**Reviewed:** 2026-10-08
**Repository:** `nahas67/HOTL` (public)
**Base commit at review start:** `1de2ad36793258db201aac21f04fdd48d4a0681f`
**Tool:** `zricethezav/gitleaks:v8.28.0` (no local install; run through Docker so the reviewed command and the CI command are identical)
**Reviewer scope:** automated credential scan, tracked-content hygiene, public-archive exposure. This is **not** a penetration test, a supply-chain audit of dependencies, or a production authorization.

## Summary

| Question | Result |
| --- | --- |
| Are credentials present in git history? | **No.** 20 commits scanned; 2 findings, both verified test fixtures. |
| Are credentials present in the working tree source? | **No**, after the allowance below. |
| Are credentials present in a local build cache? | **Yes — one live GitHub fine-grained PAT.** Found, scoped, and removed locally. |
| Are credentials published in the three public ZIPs? | **No.** Verified entry-by-entry. |
| Is `main` protected? | **No.** Unprotected; anyone with write access can force-push. |
| Are bulky binary snapshots tracked in git? | **Yes — three ZIPs**, each embedding `.git` history and `.data` simulation state. Now untracked. |

## Finding 1 — GitHub fine-grained PAT in the local Next.js build cache (local-only)

A work-tree scan reported `github-fine-grained-pat` matches in:

```text
apps/cockpit/.next/cache/turbopack/v16.3.4-299180d3/00000150.sst
apps/cockpit/.next/cache/turbopack/v16.3.4-299180d3/00000153.sst
apps/cockpit/.next/cache/turbopack/v16.3.4-299180d3/00000160.sst
apps/cockpit/.next/cache/turbopack/v16.3.4-299180d3/00000166.sst
```

Each held one 93-character `github_pat_…` value immediately after the bytes `GITHUB_MCP_TOKEN]`. The build serialized a **process environment variable value** into the on-disk turbopack cache. This is a build-tool behaviour, not a HOTL source defect.

### Scope confirmed

- **Not in git history.** The full-history scan returned no `github-fine-grained-pat` finding.
- **Not in any public ZIP.** All three archives were opened entry-by-entry; none embed `.next`, and none contain the `github_pat_` marker (0 hits across 1,284–1,364 entries each).
- **Not in tracked source.** `git ls-files` content carries no such value.
- **Not the same credential as the local `gh` session.** The cached value is a 93-character fine-grained PAT; the authenticated `gh` credential is a 40-character `gho_` OAuth token. Compared by SHA-256 prefix only; no value was logged, copied, or transmitted.

### Containment performed

- Deleted `apps/cockpit/.next` (384,421,116 bytes) and `apps/storefront/.next` (120,570,935 bytes). Both are git-ignored, fully regenerable build output and were not running under a dev server at the time.
- Re-scanned: 0 remaining `.next` files, 0 remaining markers.

### Residual risk and required owner action

1. **Owner action — treat the fine-grained PAT as disclosed.** It was written to disk in plaintext by a build. Rotate or revoke it, and confirm its scopes and grants are minimal. This is the only item in this review that requires the owner.
2. **Owner action — separate build environment from agent tooling.** `GITHUB_MCP_TOKEN` was visible to the build process. Builds and agent tooling should not share an environment; scoping the PAT and keeping it out of build environments removes the whole class of issue.
3. **Accepted, documented residual:** `.next` is git-ignored, is excluded from share archives by `scripts/build-share-archive.ps1`, and is asserted untracked by `tests/repository-hygiene.test.mjs`. The gitleaks allowance for generated output means the scanner will not alert on a credential inside `.next`; the defence against committing it is the ignore rule plus the hygiene test, not the scanner.

## Finding 2 — Full-history credential scan (clean, with one scoped allowance)

```text
$ docker run --rm -v "$PWD:/repo" -w /repo zricethezav/gitleaks:v8.28.0 \
    git /repo --redact --no-banner --config /repo/.gitleaks.toml
20 commits scanned.
scanned ~2867733 bytes (2.87 MB) in 5.94s
no leaks found
```

Without the configuration the same command returned **2 leaks**, both `generic-api-key` in `apps/commerce-core/medusa/test/guarded-payments.test.ts` (lines 25 and 52, commit `f83938ff51a0f5531998ed11380d55863f55ad2f`). Both matches are literal `idempotencyKey` values — `"refund-medusa-123"` and `"operation-123"` — asserted by the guarded-payment bridge tests to prove request de-duplication. They are not credentials and they are still present at HEAD.

The allowance is pinned to that single file. `tests/repository-hygiene.test.mjs` fails if a second allowance is added or if any allowance path becomes a wildcard, so the exclusion cannot quietly widen.

## Finding 3 — Bulky binary snapshots tracked in a public repository

Three archives were tracked in `main`, all added in commit `716fd4d`:

| Archive | Size | Embeds `.git` | Embeds `.data` |
| --- | --- | --- | --- |
| `HOTL-updated-share-2026-10-01.zip` | 5,600,824 B | yes | yes |
| `HOTL-updated-share-2026-10-03.zip` | 15,893,095 B | yes | yes |
| `HOTL-before-continuation-2026-10-01.zip` | 4,981,776 B | yes | yes |

Each archive carried a nested `.git` directory and `.data` simulation/browser-test state into a public repository. No live credential was found inside them (Finding 1), but this is an exposure path that grows with every snapshot.

### Remediation

- `git rm --cached` on all three. **The files remain on disk and all history is preserved**; only future tracking stops.
- `*.zip` added to `.gitignore` with the reason inline.
- `scripts/build-share-archive.ps1` builds a shareable archive and then **fails loudly** if the result contains `.git`, `.data`, `.next`, `.medusa`, `node_modules` or a nested `.zip`. Default mode archives the tracked tree, where ignored state cannot appear by construction.
- `tests/repository-hygiene.test.mjs` enforces all of the above on every `pnpm test`.

Historical ZIP blobs remain in git history at this commit. Removing them would require a history rewrite, which is out of scope here and is an owner decision; the finding is that no credential was present in them.

## Finding 4 — `main` is not protected

`GET /repos/nahas67/HOTL/branches/main/protection` returns `404 Branch not protected`. There is no enforced required check, review rule, or force-push block, so a pushed commit that breaks CI does not stop the default branch from advancing. Enabling protection is an owner decision because it changes the owner's merge workflow; it is not applied by this review.

## What CI now enforces

`.github/workflows/ci.yml` runs, after the existing PostgreSQL drills, the exact two gitleaks invocations used above. `pnpm test` additionally runs `tests/repository-hygiene.test.mjs`, so a tracked `.zip`, an oversized tracked file, a committed `.env`, or a widened gitleaks allowance fails the build.

## Method and limits

- Credential scanning covers git history and the working tree with gitleaks' default rule set plus the scoped allowances above. It is **not** a complete audit of every rule gitleaks supports, and `--max-archive-depth` was left at 0, so **contents nested inside binary archives are not decompressed**; the three ZIPs were therefore inspected separately with a direct entry-by-entry read.
- No dependency or lockfile vulnerability scan was run here.
- The review covers this repository only; it says nothing about other machines or repositories.
- No credential value is recorded in this file, in the checkpoint, or in any commit.
