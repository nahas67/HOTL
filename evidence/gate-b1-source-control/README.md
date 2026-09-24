# Gate B1 — source control baseline evidence

**Date:** 2026-09-24 (local, Asia/Calcutta)

**Result:** B1 local source baseline recorded. This is not a hosted staging or production deployment.

## Reproducible reference

| Item | Value |
| --- | --- |
| Initial source commit | `f83938ff51a0f5531998ed11380d55863f55ad2f` |
| Annotated reference tag | `hotl-baseline-2026-09-24` (points to the initial source commit) |
| Files in initial commit | 234 |
| Lock plan copy | `docs/locked-program-plan.md` |
| Original attachment and copied plan SHA-256 | `0F52B305B9721226C03E392601AA9E69649E76F06CD54DC464095B91A5773C3C` |
| Git author identity used | `Codex <codex@local.invalid>` (local repository configuration) |
| Remote | None configured at this checkpoint |

## Source and secret review

The `.gitignore` excludes the working `data/` ledger/checkpoints, `infra/kill-switch/data/` journal, `.secrets/`, `.env*` except example templates, build outputs, local evidence logs and common private key/database extensions. `desktop.ini` was excluded from the baseline. The exact source plan was copied byte-for-byte and its hash compared to the attachment.

`detect-secrets scan` was run on the 234 staged source files before the commit. It reported **zero candidate findings**. Its machine-readable output is retained locally at `artifacts/baseline-secret-scan.json` and is ignored by Git. This scanner result is a screening step, not a guarantee that no sensitive data exists. No live key values were copied into this evidence package.

The staged path review found no files from the protected state/key directories and no non-example environment file. The repository had no preexisting commit or remote. Local state was preserved in place; no service or test environment was reset. The recorded local code/test evidence predates this commit and is listed in [`docs/continuation-verification.md`](../../docs/continuation-verification.md). No new application test or external provider check was performed for this source-control step.

## Remaining Gate B work

- Gate A pilot business, capital envelope and stop rules remain owner-supplied and unapproved.
- Complete the changed Docker restore drill when a Docker daemon is available.
- Prove hosted identity, workspace binding, RLS, trusted HTTPS, storage/backup/restore, logging and independent emergency control in a staging environment.
- Create a separate evidence package for the complete Gate B checkpoint. This B1 record alone does not pass Gate B.
