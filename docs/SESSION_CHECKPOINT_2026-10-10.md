---

# 10. Execution session — 2026-10-10 (authoritative from `027c806`)

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