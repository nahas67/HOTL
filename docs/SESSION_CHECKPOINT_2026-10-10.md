---

# 10. Execution session — 2026-10-10 (authoritative from `027c806`)

> **§11 below supersedes §10's open ledger from `644af81` onward.** §10 is kept because it records
> how the session started and what recovery found; §11 is the current verified state.

§§0–9 are preserved history. **§10 supersedes §9.4's open ledger and §9.5's working plan.**
No gate moved. Gates A, B and C are exactly as §9.3 records them: blocked.

## 10.1 Recovery — what was actually true at this commit

| Claim to check | Verified state |
| --- | --- |
| "last visible progress `46c2584`" | **True.** `46c2584` was HEAD on `codex/cp02-ci-red-2026-10-10`. |
| Working tree clean | **False.** Nine tracked files modified, five untracked, all from the interrupted session and none of it verified. |
| PR #5 open, `main` red | **True.** `origin/main` = `13a74aa`, still red. PR #5 `OPEN`, awaiting an owner approving review. |
| D-1 — 14 inert autonomy domains | **True and re-verified from source** by the Team Lead, not accepted on report. |
| N9a — raw `next build` in app package.json | **True but half-done**: the working tree carried an unreadable inline `node -e` one-liner, never verified. |

**The recovery surprise.** The interrupted session left `apps/guardrail-service/test/lock-reclaim-race.test.ts`
— a 195-line adversarial test for a financial lost-update race, with no fix behind it. That test is the single
most valuable thing recovered, and §10.2 is what became of it.

Two scratch artefacts were also left in the tree (`fs-trace.txt`, `zz-probe.test.ts`). Both are debris from
debugging that session and are **deleted**, not committed.

## 10.2 D-B2 — stale-lock recovery was not atomic · **FIXED** · `027c806`

**Severity: HIGH, financial.** Not a hypothetical.

`GuardrailEngine.transaction` recovered an abandoned lock as `orphaned(lockPath)` → `unlink(lockPath)` →
`open(lockPath,'wx')`. Judging an owner dead and deleting its lock are **two separate steps**, so two
processes recovering the **same** abandoned lock both pass the dead-owner test:

```
P1: orphaned(D)=true                            -> parked
P2: orphaned(D)=true -> unlink -> open('wx')    -> writes P2 -> holds the lock
P1: unlink(lockPath)                            -> deletes P2's FRESH lock
   open('wx') -> writes P1                      -> holds it too
```

Both are then inside one critical section doing read-modify-write on the ledger. **Neither ever lost the
lock from its own point of view**, so the ownership-checked release added in `4d1d9ff` cannot help. The
daily ceiling is computed from the state each writer read, so **two grants can be issued against one
budget**, and the audit chain still verifies — a clobbering update is invisible to `verify`.

**The fix is an arbitration primitive, not a delay.** `open(path,'wx')` is the only atomic
create-if-absent primitive available portably, so a **reclaim token** at `<ledger>.lock.reclaim` becomes
the single-winner right to delete an abandoned lock: exactly one process holds it, therefore exactly one
process can ever delete one. Three supporting decisions, each deliberate:

- **`occupied()` re-judges immediately before the unlink.** A lock recovered and re-taken by a live
  writer in the gap must never be deleted, or the same defect returns one level down.
- **A token already on disk is refused outright, even when its owner is provably dead.** Reclaiming a
  stale token reproduces this exact race one level up. An uncertain lock denies; that is an operator
  runbook decision, consistent with the kill journal and with rule 7.
- **The token is released on every exit path**, so a denied transaction cannot wedge every later
  recovery. An ownership re-read was tried and removed: on Windows it can observe a delete-pending name
  and skip the delete, which is precisely the wedge it was meant to prevent.

### The test had to be repaired before it measured anything

The recovered test **passed and failed for identical code on different runs.** Two harness defects:

1. The mock parked on `hold.arrived` — which `park()` has just resolved — instead of `hold.gate`, so it
   never actually held anything. The interleaving it documents was decided by event-loop luck.
2. It deadlocked: a hold on the commit `rename` is consumed by whichever writer commits first, and with
   the fix that is the slow process, so `await a` blocked on the test's own gate.

Both are fixed. **No assertion was weakened and no test was removed.** The commit hold was deleted
because the ordering the test needs does not depend on it: the slow process is released last, so when
the defect is present its clobbering update lands last regardless. That also makes the schedule total —
the fast process can no longer park anywhere, so `await b` always terminates.

| | Result | Runs |
| --- | --- | --- |
| **Pre-fix engine** | `2 failed \| 1 passed` | 5 consecutive |
| **Post-fix engine** | `3 passed` | 5 consecutive |

The second failure pre-fix is the stale-token test: without the token there is nothing to refuse.

### Verification

- `pnpm --filter @hotl/guardrail-service exec tsc --noEmit` — **clean** (the recovered test had three
  type errors, since it had never been typechecked).
- Full guardrail suite — **31 files, 329 passed, 26 skipped, 0 failed.**

**Recorded, not papered over:** `money-domain` and `ledger-multiprocess` each **timed out at 5000 ms**
during a full-suite run while three agents were saturating this machine. Both **pass in isolation** and
both **pass on an unloaded full-suite re-run**. This is machine load, not a defect and not a pass — it is
recorded as an unrun/environment-dependent observation in the sense of §0.1.1. It also means a future
session should not read a full-suite green as proof those two are fast.

## 10.3 Independent findings this session — not yet fixed

Produced by a three-person team working to disjoint write scopes; every claim below is browser- or
source-observed, and the Team Lead has not yet folded them into the product.

### From the cockpit control matrix — `docs/cockpit-control-matrix-2026-10-11.md`

31 controls clicked and observed in a real browser. **Closed** from the CP-03B "UNVERIFIED" ledger:
the refund form (3 of 4 outcomes), the add-product form, **every Autonomy per-tab save**, the 75-input
pilot gate (driven 38 → 42 → 7 → 6 gaps, `Approve` correctly `disabled` at every step), and **all 55
mobile/viewport measurements** (11 routes × 1440/1024/760/390/360).

| # | Sev | Finding |
| --- | --- | --- |
| **D-0** | **HIGH** | The refund form is **PARTIAL, 3 of 4 outcomes**. The guardrail emits `escalated`, which means **held in escrow and not paid**. That branch was never reached. The auditor had overclaimed "WORKING" from one `200` plus an order label reading "Partially Refunded" — **a status label is not evidence that money moved** — and self-corrected. |
| **D-1** | MEDIUM | Tap targets under 24 px on **11/11 routes** at 390 px and 360 px ("Meet your agents" 185×15 px). |
| **D-3** | LOW | The B-2 fix is correct at 1440/760/390 but its `@media(max-width:380px)` rule sets `.panel>.metric-context` to 13 px while `.panel-header` stays at 18 px — a 5 px misalignment at 380/360 that the new regression test **cannot see, because it stops at 390**. |
| **D-4** | MEDIUM | The `/autonomy` tablist declares `role="tablist"` but has **no arrow-key navigation and no roving tabindex** (`operating-pages.tsx:528-557`). Measured: ArrowRight ×2 and End leave focus *and* selection on tab 1. Declaring the role obliges the behaviour. |

**One prior finding withdrawn.** §6.5's "`/products` and `/orders` horizontal scroll below 390 px" is
**not** a defect: all 55 measurements show zero page-level overflow, and the tables scroll inside
deliberate `overflow-x:auto` containers. Reclassified.

### Still open after the matrix — explicitly not coverage

Shopify OAuth (unreachable, unconfigured), all live-mode/Supabase auth (unreachable by construction in
simulation), the **connection lifecycle** (sync/import/credentials/disconnect — never exercised),
the **pilot approval happy path** (the gate is proven to hold; the path *past* it is untested — the last
significant untested write in the product), all search/status filter inputs except Approvals, and
**contrast, which was not measured and was refused rather than estimated**.

## 10.4 Open ledger at `027c806`

| # | Item | State |
| --- | --- | --- |
| ✅ | D-B2 stale-lock recovery | **FIXED** `027c806`, 5×5 deterministic proof |
| 🚨 D1 | Revoke the disclosed fine-grained PAT | **Owner.** No rotation evidence in the repository. |
| 🚨 — | Approve and merge PR #5 | **Owner.** The sole reason `main` is still red. |
| 🚨 B-1 | Recover the preserved 0-byte kill journal | **Owner-authorised runbook recovery.** Not reset by any agent. |
| 🚨 D-0 | Refund escrow (`escalated`) branch unverified | Money-relevant; `[ ]` |
| 🚨 D-1 (autonomy) | 14 of 20 domains have no execution gate | **Highest-value open defect.** In progress. |
| `[ ]` | N9a / N9b / N9c | In progress |
| `[ ]` | D-1 / D-3 / D-4 above | Reported, not yet fixed |
| `[ ]` | N1 — recompute the 19 staged settings against a real environment | Needs provisioned infrastructure |
| `[ ]` | Contrast audit | Not measured |

**Branch protection is unchanged and no agent will self-approve.** `main` requires `validate` **and one
approving review**. PR #5 is `MERGEABLE` with `validate: SUCCESS` and `mergeStateStatus: BLOCKED`. That
block is an owner decision, not a CI problem, and it is correctly not ours to clear.

---


---

# 11. Verified state at `644af81` — supersedes §10's ledger

Everything below was **observed on this machine or on a real runner**, not accepted on report.
`main` is still `13a74aa` and still red. **No gate moved.** Gates A, B and C are unchanged.

## 11.1 Landed, with the evidence that says so

| Commit | What it fixed | Evidence |
| --- | --- | --- |
| `027c806` | **Stale-lock recovery was not atomic.** Two processes recovering the same abandoned lock could each delete it, ending up inside one critical section — so two grants could be issued against one daily ceiling, invisibly to the audit chain. Fixed with a reclaim token: `open(path,'wx')` is the only atomic create-if-absent primitive available portably, so it is the single-winner right to delete an abandoned lock. | **Pre-fix 2 failed × 5 runs. Post-fix 3 passed × 5 runs.** Guardrail 31 files / 329 passed / 0 failed at the time. |
| `b3f8dbb` | **14 of 20 autonomy domains had no execution gate.** Now 9 wired (`orders`, `inventory`, `finance`, `fulfillment` added), 11 carrying `{enforced:false, gate:null, basis}`. Two latent defects the wiring exposed were fixed: `commerce.checkout`/`commerce.event` never reached `execute()` so an escalation would have hung forever, and `applyCommerceEvent` returned no `decision` so an approved payment would have moved the order while its proposal hung. | Guardrail **31 files / 373 passed / 26 skipped / 0 failed**; orchestrator **9 files / 55 passed**. Lead re-ran both. `execute()` was read to confirm `block()`/`scope()`/`context()` still gate checkout — the kill/pause boundary is not bypassed. |
| `168cd79` | **N9a/N9b/N9c.** `pnpm --filter <app> build` wrote the process environment into Turbopack's cache. Both Next apps and the out-of-workspace medusa project now route through the scrub. | Canary **2 → 0** on both apps; `pnpm build --force` **0** across 1,704 files / 407.7 MB; medusa build **0**. Reproduced the leak in exactly the 2026-10-08 file class first. |
| `70289cd` | **Four cockpit defects**, two found by two independent audits: an escalated refund toast rendered a **green success checkmark beside "Refund not paid"**; the B-2 CSS fix **regressed at 375/360** in the two widths its own test could not see; the Constitution tablist declared `role="tablist"` with **no arrow-key navigation and no roving tabindex**; a conflict hint **matched an English sentence** that the proxy emits for two different reason codes. | Re-measured in a browser by a second agent: toast `toast-warning` + `lucide-triangle-alert`, lifetime 12066 ms; six widths `delta 0`; tabindex `["0","-1",...]` with both ends wrapping; `CONSTITUTION_CHANGED` shows **no** reopen hint. |
| `644af81` | Retains the three superseded 10 Oct audit documents as historical evidence. | Working tree clean. |

**An integration defect was found by the browser suite and fixed in `70289cd`.** `snapshot()` now
stamps `domainEnforcement` onto every constitution; the cockpit spread the whole constitution into
`constitutionPatchSchema`, which deliberately has no field for it — so **every constitution save
failed**. Both changes were individually correct; echoing derived engine state back to an owner-input
endpoint is not. Suite went 29/30 → 30/30.

## 11.2 Verification actually performed at `644af81`

| Check | Result |
| --- | --- |
| `pnpm lint` | **exit 0** |
| `pnpm typecheck --force` | **exit 0**, 11/11 tasks, **0 cached** — a forced run; an unforced one was a `FULL TURBO` replay that ignored untracked files and is not citable |
| `pnpm test` | **exit 0**, 11/11 turbo tasks |
| `pnpm build --force` | **exit 0**, 8/8 tasks, 0 cached, both Next apps compiled |
| `pnpm test:e2e` | **30 passed, 0 failed**, 2.9 m — run twice, independently, to the same number |
| `infra/scripts/test-database.ps1` | **PASS**, exit 0 — *"Migration, owner isolation, write denial, audit immitability, refund escrow, kill latch, and concurrent spend tests passed."* against a disposable native PostgreSQL 18 cluster |
| `infra/scripts/test-runtime-ledger.ps1` | **PASS**, exit 0 — 33 tests; state/audit MD5 identical across restart (`93d7337e…`); custom-format backup SHA-256 `59D7D0DF…`; restored RLS, grants, login bindings and append-only denial verified |
| CI `Isolated kill-switch checks and image` | **SUCCESS**, run `38039467761` |
| CI `Main platform checks` (`validate`) | **SUCCESS**, run `38039467807`, `headSha 644af812…` — **the exact final commit** |

**Both PostgreSQL drills had never been run this session** and the first attempt hung for 50 minutes.
The cause was the harness, not the drill: `pg_ctl start` forks a daemon that inherits the caller's
stdout, so piping the script into `Tee-Object` or `Select-Object` means the reader never sees EOF.
Two orphaned clusters were stopped and the drills re-run detached with file redirection. **Recording
this because the next session will otherwise lose another hour to it.**

## 11.3 Corrected this session

- **The credential "leak" was a false positive and is retracted.** A scanner flagged
  `docs/FULL_PROGRAM_CHECKPOINT.md` as containing a credential *value*. The only `NAME=<value>` in
  the file is `GITHUB_MCP_TOKEN=CANARY_…` — a synthetic canary inside a write-up of a credential
  isolation drill. Independent `git grep` across the tracked tree returns **zero** matches for
  `github_pat_`, `ghp_`/`gho_`/`ghs_`, and the stray `$null` file that carried the scanner output was
  a PowerShell backtick-escape artifact, deleted. **Nothing needs rotating because of this.** The
  *original* PAT from the 2026-10-08 incident is still disclosed and still needs owner rotation —
  that finding is unchanged and was never in question.
- **"20 domains are governed" was false and is gone.** Settings said exactly that under twenty
  identical rows. Both cards now report `{enforced} of 20`, "Autonomous domains" counts over the
  enforced set, and each unenforced row is marked **Recorded, not enforced** with its reason.
- **`/products` and `/orders` mobile horizontal scroll is not a defect.** All 55 route × viewport
  measurements show zero page-level overflow; the tables scroll inside deliberate `overflow-x:auto`
  containers.
- **Two of this session's own claims were walked back before they shipped** — a claimed "version
  history renders empty" (a collapsed `<details>`) and a claimed refund form "WORKING" (a `200` and
  an order label reading *Partially Refunded*, which is not evidence that money moved).

## 11.4 Open ledger at `644af81`

| # | Item | State |
| --- | --- | --- |
| 🚨 — | **Approve and merge PR #5.** `MERGEABLE`, `validate: SUCCESS`, `mergeStateStatus: BLOCKED`, **0 reviews**. `main` requires one approving review; only the owner can give it and no agent will self-approve. This is the sole reason `main` is still red. | **Owner.** |
| 🚨 D1 | Rotate the fine-grained PAT disclosed on 2026-10-08 | **Owner.** No rotation evidence exists in the repository. |
| 🚨 B-1 | Recover the preserved 0-byte kill journal | **Owner-authorised runbook recovery.** Never reset by an agent. |
| `[ ]` | **D-2 — the pilot approval happy path.** The 75-input gate is proven to hold (driven 38 → 42 → 7 → 6 gaps, `Approve` correctly `disabled` at every step). **The path past the gate is untested** — the last significant untested write in the product. | Next. |
| `[ ]` | N1 — recompute the 19 staged settings against a real provisioned environment | Needs infrastructure that does not exist here. |
| `[ ]` | Contrast audit | Not measured; deliberately refused rather than estimated. |
| `[ ]` | `scan-build-cache.mjs` is validated but **not wired into `pnpm build` or CI** | Recurrence is caught only by whoever remembers to run it. |
| `[ ]` | F2 — `:ro` on both gitleaks mounts | Open, untouched. |
| `[ ]` | 37 of 39 recursive-`rm` teardown sites still use Node's default `maxRetries: 0` | Can still flake on Windows `ENOTEMPTY`. |
| `[ ]` | Shopify OAuth, live-mode/Supabase auth, connection lifecycle, search/filter inputs | Unreachable or unexercised by construction. |

**Unreachable by construction, and therefore not defects:** Gate A (no owner-approved business
envelope), Gate B (no provisioned staging), Gate C (**zero** external Shopify evidence), Gate D, Gate E.
No commerce capability has reached M4. **M4 has been reached only for the CI pipeline itself.**
