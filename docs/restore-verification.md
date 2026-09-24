# Isolated file recovery verification

Verified locally on 2026-09-18. These tests use disposable directories, real local
file adapters, the actual LangGraph runtime, and loopback guardrail HTTP. They do
not modify the working demo's ledger, checkpoint file, connector vault, or
independent emergency journal. They are simulation recovery evidence, not a
production restore certificate.

## Commands and results

Run from the repository root:

```powershell
pnpm --filter @hotl/guardrail-service exec vitest run test/file-initialization.test.ts test/restore.test.ts
pnpm --filter @hotl/orchestrator exec vitest run test/checkpointer.test.ts test/restore.test.ts test/graph.test.ts
pnpm --filter @hotl/kill-switch exec vitest run test/restore.test.ts
pnpm --filter @hotl/orchestrator typecheck
```

- Guardrail initialization: **10 passing tests** cover explicit opt-in for a fresh live file ledger, immediate
  persistence, unchanged restart, missing initialized data, marker-only crash
  recovery, corrupt markers, legacy adoption, and restoration of the ledger and
  marker together.
- Guardrail restore: **3 passing tests** preserve exact state, the audit prefix,
  actor-bound idempotency, financial denials and pause state. Restored execution
  obtains current independent kill state. A corrupt audit fails startup without
  modifying the verified backup.
- Checkpointer: **11 passing tests** cover durable first initialization, unchanged
  legacy bytes, populated checkpoint values and pending writes, missing data and
  markers, marker-only initialization crashes, and corrupt markers. Reloading a
  root checkpoint preserves its absent parent reference; JSON's null array slot
  is normalized back to the undefined value expected by MemorySaver.
- Workflow restore: **7 passing tests** restore a refund interrupt before or after
  owner approval, resume once, and reject truncated, unsupported and structurally
  corrupt checkpoints. A refund over $25 still needs the saved owner decision;
  repeated approval and resume do not issue a second refund or append duplicate
  mutation audit entries. The backups and source files remain byte-identical.
- Independent kill journal: **4 passing tests** preserve the irreversible latch,
  incomplete action receipts, and continued failure after restart. Tampered,
  truncated, and missing journals fail startup with initialization disabled.
  No test converts a failed or unconfigured action into successful revocation.
- Orchestrator typecheck passed.

The listed focused test commands passed **46 tests** in total: 13 guardrail, 29
orchestrator (including 11 existing real-graph regression tests), and 4 independent
kill-journal tests. Repeated runs are not counted as additional tests.

The initialization acceptance tests initially exposed a fresh ledger existing
only in memory. The engine owner fixed it to save an initialization marker before
the initial durable ledger transaction. The tests enforce this behavior so a
restart cannot silently bootstrap an already initialized history.

## Recovery procedure exercised

1. Quiesce the writer. For the workflow fixture, the graph is interrupted, there
   is no scheduler or queue worker, and HTTP intake is closed before copying.
2. Pin SHA-256 digests of ledger, checkpoint, and both `.initialized` markers
   separately from the files being restored. Preserve the ledger's audit head.
3. Copy backups into a different empty recovery location, including both markers.
   Check the digests before starting services. Do not overwrite the source files.
4. Construct fresh engine and checkpointer instances, verify the original audit
   prefix and saved interrupt, and confirm that pending approval still blocks
   resumption. Approve through the guardrail API and resume the saved workflow.
5. Replay the same approval and resume request; verify that financial state and
   audit history are unchanged. Retain the original backups for comparison.
6. Restore the emergency journal separately using its independent operator and
   storage boundary. Start with initialization disabled. Keep an engaged latch
   engaged and retry incomplete revocation actions through the emergency service.

## Limits and remaining deployment evidence

The fixtures instantiate fresh adapters; they do not power-cycle the host or
prove filesystem behavior after power loss. Files are flushed before replacement,
but directory metadata durability and storage hardware guarantees are outside
this evidence. These are quiescent copies, not an atomic online snapshot of
multiple services. A deployed recovery process must stop intake and workers or
use a reviewed coordinated snapshot procedure.

Markers detect missing initialized data while the marker remains present. They
are not secret or cryptographic witnesses. A valid existing file without a marker
is adopted for compatibility; losing both files in simulation is indistinguishable
from a new simulation directory. Never delete markers or enable first-time
initialization to recover lost state. Verify backups using separately retained
digests and audit witnesses.

Checkpoint structure and byte encoding are validated, but the checkpoint file
does not have a cryptographic audit chain. Use the separately retained digest to
detect changes to otherwise structurally valid checkpoints. A production backup
manifest needs protected retention and access control, not just a nearby hash.

No real provider was called. Queue draining, provider token revocation, deployed
PostgresSaver recovery, connector-vault recovery, cross-service consistency under
active writes, and measured recovery objectives remain separate deployment gates.
See [PostgreSQL runtime verification](postgres-runtime.md) for database drill
evidence; the file recovery counts above do not include database tests.
