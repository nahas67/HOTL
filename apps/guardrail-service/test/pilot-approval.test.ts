import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Actor, BusinessConstitution, PilotDraft } from '@hotl/schemas';
import { createEngine } from '../src/engine.js';
import { completePilotDraft } from './pilot-fixture.js';

/**
 * The path PAST the pilot approval gate.
 *
 * `pilot-envelope.test.ts` and the CP-03B cockpit control matrix proved the negative path: a
 * 75-input pilot draft with gaps keeps `Approve` disabled, and `approvePilot` denies. That says
 * nothing about what happens when the gate is satisfied -- the one write an owner uses to grant
 * their own business authority, and the last significant untested write in the product.
 *
 * Everything here drives the real engine against a real file-backed ledger and re-reads the
 * ledger from disk through a second engine instance. The returned `before`/`after` are treated
 * as a claim to be checked, never as the source of truth (AGENTS.md rule 2: the audit entry must
 * be durable before success is reported).
 *
 * This is a labelled local simulation (AGENTS.md rule 6). The owner identity below is a test
 * fixture, not a business owner, and nothing here carries external authority.
 */

// The engine's own canonicalisation, replicated so the recorded `draftDigest` is checked against
// an independent computation rather than against itself. `stable()` sorts object keys at every
// depth and preserves array order; `digest()` is sha256 over that canonical JSON.
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, item) => (item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item));
const digest = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');

const owner: Actor = { type: 'owner', id: 'pilot-owner' };
const reason = 'Owner confirms pilot business and risk boundary';
const draftReason = 'Owner records pilot business and risk inputs';
const approvalKey = 'pilot-approval-authorising-key';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function ledgerPath(prefix: string) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  directories.push(directory);
  return join(directory, 'ledger.json');
}

/** Reads the persisted ledger as raw JSON, bypassing the engine entirely. */
async function rawLedger(filePath: string) {
  return JSON.parse(await readFile(filePath, 'utf8')) as {
    constitution: BusinessConstitution;
    constitutionHistory: { version: number; constitution: BusinessConstitution }[];
    audit: { eventType: string; actorType: string; actorId: string; prevHash: string | null; hash: string; payload: unknown; summary: string }[];
    idempotency: Record<string, { fingerprint: string; result: Record<string, unknown> }>;
  };
}

/**
 * Re-opens the same ledger through a second engine, so every assertion below reads what was
 * persisted rather than what the first engine still holds in memory.
 */
async function rehydrate(filePath: string) {
  return (await createEngine({ filePath, seed: false })).snapshot();
}

/** Recomputes the audit hash chain from the persisted entries (engine.ts:120-125). */
function assertChain(audit: Awaited<ReturnType<typeof rehydrate>>['audit']) {
  let previous: string | null = null;
  for (const entry of audit) {
    const { hash, ...record } = entry;
    expect(record.prevHash).toBe(previous);
    expect(hash).toBe(createHash('sha256').update(JSON.stringify(record, (_key, item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
        : item)).digest('hex'));
    previous = hash;
  }
}

/**
 * Everything an approval could GRANT, projected from the raw ledger. A denial must leave this
 * byte-for-byte identical. Audit of the refusal is deliberately not in here -- a denial is a
 * decision worth investigating and is durably recorded under the same operation name, so
 * `approvalDecisions` accounts for it separately instead of pretending nothing happened.
 */
function authorityProjection(ledger: Awaited<ReturnType<typeof rawLedger>>) {
  return {
    version: ledger.constitution.version,
    draft: ledger.constitution.pilot!.draft,
    approval: ledger.constitution.pilot?.approval ?? null,
    historyVersions: ledger.constitutionHistory.map(entry => entry.version),
  };
}

/** Every `constitution.pilot-approved` audit entry, as the authority decision it actually was. */
function approvalDecisions(ledger: Awaited<ReturnType<typeof rawLedger>>) {
  return ledger.audit.filter(entry => entry.eventType === 'constitution.pilot-approved')
    .map(entry => {
      const result = (entry.payload as { result: { decision: string; reason?: string } }).result;
      return { actorType: entry.actorType, actorId: entry.actorId, decision: result.decision, reason: result.reason };
    });
}

/** Seeds version 2: a saved, complete, gap-free draft awaiting a separate approval decision. */
async function approvedWorkspace(filePath: string) {
  const engine = await createEngine({ filePath, seed: false });
  const saved = await engine.updateConstitution(
    { expectedVersion: 1, reason: draftReason, pilotDraft: completePilotDraft() }, owner, 'pilot-draft-saved');
  expect(saved.decision).toBe('allow');
  expect((saved.constitution as BusinessConstitution).version).toBe(2);
  return engine;
}

describe('pilot approval grants authority (the path past the gate)', () => {
  it('allows a gap-free draft, bumps the version by exactly one, and records verifiable authority', async () => {
    const filePath = await ledgerPath('hotl-pilot-allow-');
    const engine = await approvedWorkspace(filePath);

    const draftBefore = (await rehydrate(filePath)).constitution!.pilot!.draft;
    expect((await rehydrate(filePath)).constitution!.pilot!.approval).toBeUndefined();

    const result = await engine.approvePilot({ expectedVersion: 2, reason }, owner, approvalKey);

    // 1. The decision itself.
    expect(result.decision).toBe('allow');
    expect(result.status).toBe('approved');

    // 2. Exactly one version step, checked against the persisted ledger rather than the return value.
    const persisted = (await rehydrate(filePath)).constitution!;
    const beforeVersion = 2;
    expect(persisted.version).toBe(beforeVersion + 1);
    expect((result.before as BusinessConstitution).version).toBe(beforeVersion);
    expect((result.after as BusinessConstitution).version).toBe(persisted.version);
    expect(persisted.version - beforeVersion).toBe(1);

    // 3. The recorded approval: owner, instant, the NEW version, and a digest of this draft.
    const approval = persisted.pilot!.approval!;
    expect(approval.approvedBy).toBe(owner.id);
    expect(Date.parse(approval.approvedAt)).not.toBeNaN();
    expect(approval.constitutionVersion).toBe(persisted.version);
    expect(approval.constitutionVersion).toBe(beforeVersion + 1);
    expect(approval.draftDigest).toBe(digest(persisted.pilot!.draft));
    expect(approval.draftDigest).toMatch(/^[a-f0-9]{64}$/);
    // The digest is a function of THIS draft, not a constant and not the pre-approval draft.
    expect(approval.draftDigest).not.toBe(digest({ ...draftBefore, profile: { ...draftBefore.profile, initialSalesTarget: { ...draftBefore.profile.initialSalesTarget, value: 1200 } } }));

    // 4. The returned before/after agree with what was actually written.
    expect(result.constitution).toEqual(persisted);
    expect(result.after).toEqual(persisted);
    expect(result.before).toEqual(await rehydrateAt(filePath, beforeVersion));
    expect((result.before as BusinessConstitution).pilot!.approval).toBeUndefined();

    // 5. A durable audit entry exists, its chain still verifies, and it was on disk before this
    //    call returned (AGENTS.md rule 2).
    const onDisk = await rawLedger(filePath);
    const approvals = onDisk.audit.filter(entry => entry.eventType === 'constitution.pilot-approved');
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({ actorType: 'owner', actorId: owner.id });
    expect(approvals[0]!.payload).toMatchObject({ request: { expectedVersion: 2, reason }, result: { decision: 'allow', status: 'approved' } });
    assertChain(onDisk.audit as never);

    // 6. The version history records the step, and its stored approval digest still binds to the
    //    draft stored beside it.
    expect(onDisk.constitutionHistory.map(entry => entry.version)).toEqual([1, 2, 3]);
    const historyApproval = onDisk.constitutionHistory.at(-1)!.constitution.pilot!.approval!;
    expect(historyApproval.draftDigest).toBe(digest(onDisk.constitutionHistory.at(-1)!.constitution.pilot!.draft));

    // 7. It survives a restart: authority is durable, not in-memory.
    const restarted = await createEngine({ filePath, seed: false });
    expect((await restarted.snapshot()).constitution!.pilot!.approval).toEqual(approval);
    assertChain((await restarted.snapshot()).audit);

    /** Reads the ledger as it was at `version`, from the immutable history, not from a cache. */
    async function rehydrateAt(_path: string, version: number) {
      const ledger = await rawLedger(_path);
      return ledger.constitutionHistory.find(entry => entry.version === version)!.constitution;
    }
  });

  it('grants exactly one authority under concurrent approvals of the same version', async () => {
    const filePath = await ledgerPath('hotl-pilot-concurrent-');
    const engine = await approvedWorkspace(filePath);

    const results = await Promise.all([
      engine.approvePilot({ expectedVersion: 2, reason }, owner, 'pilot-concurrent-a'),
      engine.approvePilot({ expectedVersion: 2, reason }, owner, 'pilot-concurrent-b'),
    ]);

    expect(results.filter(result => result.decision === 'allow')).toHaveLength(1);
    expect(results.filter(result => result.reason === 'CONSTITUTION_CHANGED')).toHaveLength(1);
    const persisted = await rawLedger(filePath);
    expect(persisted.constitution.version).toBe(3);
    expect(persisted.constitution.pilot!.approval!.constitutionVersion).toBe(3);
    // Both attempts are on the record, and only one of them granted anything.
    expect(approvalDecisions(persisted)).toEqual([
      { actorType: 'owner', actorId: owner.id, decision: 'allow', reason: undefined },
      { actorType: 'owner', actorId: owner.id, decision: 'deny', reason: 'CONSTITUTION_CHANGED' },
    ]);
    assertChain(persisted.audit as never);
  });
});

describe('pilot approval denial paths', () => {
  const gaps: { name: string; code: string; apply: (draft: PilotDraft) => void }[] = [
    {
      name: 'an UNKNOWN profile input',
      code: 'PILOT_PROFILE_INCOMPLETE',
      apply: draft => { draft.profile.customerProfile = { value: null, provenance: 'UNKNOWN' }; },
    },
    {
      name: 'a profile currency the guardrails do not support',
      code: 'PILOT_CURRENCY_UNSUPPORTED',
      apply: draft => { draft.profile.currency = { value: 'EUR', provenance: 'OWNER_ENTERED', evidenceRef: 'Owner pilot worksheet' }; },
    },
    {
      name: 'an ESTIMATED economic input',
      code: 'PILOT_ECONOMICS_INCOMPLETE',
      apply: draft => {
        // The derived metrics must go with it: leaving them filled makes the save itself
        // inconsistent, which the draft schema rejects before the gate ever sees it.
        draft.economics.supplierProductCost = { value: 30, provenance: 'ESTIMATED', evidenceRef: 'Planning guess' };
        for (const key of ['targetContribution', 'breakEvenCac', 'breakEvenRoas'] as const)
          draft.economics[key] = { value: null, provenance: 'UNKNOWN' };
      },
    },
    {
      name: 'a derived metric claimed as an observation',
      code: 'PILOT_ECONOMICS_SOURCE_REQUIRED',
      apply: draft => { draft.economics.inboundFreight = { value: 2, provenance: 'CALCULATED', evidenceRef: 'HOTL-PILOT-UNIT-ECONOMICS-v1' }; },
    },
    {
      name: 'a capital limit without owner-entered authority',
      code: 'PILOT_OWNER_LIMITS_REQUIRED',
      apply: draft => { draft.capital.maxExperimentLoss = { value: 500, provenance: 'CONTRACTUAL', evidenceRef: 'Supplier rate card' }; },
    },
    {
      name: 'capital limits that cannot all be spent',
      code: 'PILOT_LIMITS_CONFLICT',
      apply: draft => {
        draft.capital.maxPilotCapital = { value: 1000, provenance: 'OWNER_ENTERED', evidenceRef: 'Owner pilot worksheet' };
        draft.capital.protectedReserve = { value: 1000, provenance: 'OWNER_ENTERED', evidenceRef: 'Owner pilot worksheet' };
      },
    },
    {
      name: 'a missing mandatory stop rule',
      code: 'PILOT_STOP_RULES_REQUIRED',
      apply: draft => { draft.stopRules = [draft.stopRules[0]!]; },
    },
    {
      name: 'an enabled stop rule whose signal is not implemented',
      code: 'PILOT_STOP_SIGNAL_UNAVAILABLE',
      apply: draft => { draft.stopRules.push({ metric: 'TRACKING_FAILURES', unit: 'COUNT', threshold: 1, action: 'BLOCK_NEW_ACTIONS', enabled: true }); },
    },
    {
      name: 'two stop rules for the same metric',
      code: 'PILOT_STOP_RULES_DUPLICATED',
      apply: draft => { draft.stopRules.push({ ...draft.stopRules[0]! }); },
    },
  ];

  it.each(gaps)('denies $name with $code and writes no authority at all', async ({ code, apply }) => {
    const filePath = await ledgerPath('hotl-pilot-gap-');
    const engine = await approvedWorkspace(filePath);
    const draft = completePilotDraft();
    apply(draft);
    await engine.updateConstitution({ expectedVersion: 2, reason: draftReason, pilotDraft: draft }, owner, `pilot-draft-${code}`);
    const before = await rawLedger(filePath);

    const denial = await engine.approvePilot({ expectedVersion: 3, reason }, owner, `pilot-gap-${code}`);

    expect(denial).toMatchObject({ decision: 'deny', reason: code });
    expect(denial.status).toBeUndefined();
    const after = await rawLedger(filePath);
    // No version bump, no approval block, no new history entry: the gate granted nothing.
    expect(authorityProjection(after)).toEqual(authorityProjection(before));
    expect(after.constitution.version).toBe(3);
    expect(after.constitution.pilot!.approval).toBeUndefined();
    assertChain(after.audit as never);
    // The refusal itself IS durably audited -- that is how a refused grant is investigated --
    // and it must not consume the caller's key, because a key burned by a refusal would let one
    // blocked request permanently deny the key for every other actor and operation.
    expect(approvalDecisions(after)).toEqual([
      { actorType: 'owner', actorId: owner.id, decision: 'deny', reason: code },
    ]);
    expect(Object.keys(after.idempotency)).not.toContain(`id:pilot-gap-${code}`);
  });

  it('does not consume the caller key on a denial, so a corrected draft can still use it', async () => {
    const filePath = await ledgerPath('hotl-pilot-key-reuse-');
    const engine = await approvedWorkspace(filePath);
    const broken = completePilotDraft();
    broken.capital.maxDailySpend = { value: 100, provenance: 'ESTIMATED', evidenceRef: 'Planning guess' };
    await engine.updateConstitution({ expectedVersion: 2, reason: draftReason, pilotDraft: broken }, owner, 'pilot-draft-estimated');

    expect(await engine.approvePilot({ expectedVersion: 3, reason }, owner, 'pilot-reused-key'))
      .toMatchObject({ decision: 'deny', reason: 'PILOT_OWNER_LIMITS_REQUIRED' });

    await engine.updateConstitution({ expectedVersion: 3, reason: draftReason, pilotDraft: completePilotDraft() }, owner, 'pilot-draft-corrected');
    const allowed = await engine.approvePilot({ expectedVersion: 4, reason }, owner, 'pilot-reused-key');
    expect(allowed).toMatchObject({ decision: 'allow', status: 'approved' });
    expect((await rawLedger(filePath)).constitution.pilot!.approval!.constitutionVersion).toBe(5);
  });

  it('denies a stale expectedVersion with CONSTITUTION_CHANGED and writes nothing', async () => {
    const filePath = await ledgerPath('hotl-pilot-stale-');
    const engine = await approvedWorkspace(filePath);
    const before = await rawLedger(filePath);

    const denial = await engine.approvePilot({ expectedVersion: 1, reason }, owner, 'pilot-stale-version');

    expect(denial).toMatchObject({ decision: 'deny', reason: 'CONSTITUTION_CHANGED', replan: true, currentConstitutionVersion: 2 });
    const after = await rawLedger(filePath);
    expect(authorityProjection(after)).toEqual(authorityProjection(before));
    expect(after.constitution.version).toBe(2);
    expect(after.constitution.pilot!.approval).toBeUndefined();
    expect(approvalDecisions(after)).toEqual([
      { actorType: 'owner', actorId: owner.id, decision: 'deny', reason: 'CONSTITUTION_CHANGED' },
    ]);
    assertChain(after.audit as never);
  });

  it('refuses a non-owner actor before anything is read, audited or written', async () => {
    const filePath = await ledgerPath('hotl-pilot-owner-');
    const engine = await approvedWorkspace(filePath);
    const bytesBefore = await readFile(filePath);
    const keysBefore = Object.keys((await rawLedger(filePath)).idempotency);

    for (const actor of [{ type: 'agent', id: 'marketing_agent' } as Actor, { type: 'system', id: 'internal-worker' } as Actor]) {
      const refusal = await engine.approvePilot({ expectedVersion: 2, reason }, actor, `pilot-${actor.type}-refused`)
        .then(() => null, (error: unknown) => error);
      // `owner()` runs before `transaction()`, so this is a refusal, not a deny: there is no
      // decision to record because the caller never reached a policy check.
      expect(refusal).toMatchObject({ code: 'OWNER_REQUIRED', statusCode: 403 });
    }

    // Refusal is total: the ledger is byte-identical, so no audit entry, no idempotency record,
    // and no version bump was produced by either attempt.
    expect(await readFile(filePath)).toEqual(bytesBefore);
    const ledger = await rawLedger(filePath);
    expect(ledger.constitution.version).toBe(2);
    expect(ledger.constitution.pilot!.approval).toBeUndefined();
    expect(Object.keys(ledger.idempotency)).toEqual(keysBefore);
    expect(approvalDecisions(ledger)).toEqual([]);
  });

  it('refuses a CALCULATED value that an older formula revision left inconsistent', async () => {
    const filePath = await ledgerPath('hotl-pilot-formula-');
    const engine = await approvedWorkspace(filePath);
    // `pilotEnvelopeSchema` deliberately stores the draft SHAPE, not the validated draft, so a
    // ledger written by an older build stays readable across formula revisions. Such a draft is
    // readable but not approvable: the current formula must refuse to authorise it. This is the
    // only way to reach the branch -- a current-build save would be rejected at the schema.
    const ledger = await rawLedger(filePath);
    // Deliberately corrupting raw persisted JSON, which is why the branded ratio type is set
    // aside here: this simulates a ledger an older build wrote, not a value the owner can enter.
    const storedDrafts = [ledger.constitution, ...ledger.constitutionHistory.map(item => item.constitution)]
      .map(entry => entry.pilot!.draft as unknown as { economics: { breakEvenRoas: { value: number } } });
    for (const draft of storedDrafts) draft.economics.breakEvenRoas.value = 4.2;
    await writeFile(filePath, JSON.stringify(ledger));

    const reloaded = await createEngine({ filePath, seed: false });
    const before = await rawLedger(filePath);
    const denial = await reloaded.approvePilot({ expectedVersion: 2, reason }, owner, 'pilot-stale-formula');

    expect(denial).toMatchObject({ decision: 'deny', reason: 'PILOT_ECONOMICS_CALCULATION_INVALID' });
    const after = await rawLedger(filePath);
    expect(authorityProjection(after)).toEqual(authorityProjection(before));
    expect(after.constitution.version).toBe(2);
    expect(after.constitution.pilot!.approval).toBeUndefined();
    expect(approvalDecisions(after)).toEqual([
      { actorType: 'owner', actorId: owner.id, decision: 'deny', reason: 'PILOT_ECONOMICS_CALCULATION_INVALID' },
    ]);
    assertChain(after.audit as never);
  });
});

describe('pilot approval replay and stale authority', () => {
  it('returns a replay of the recorded result, never fresh authority', async () => {
    const filePath = await ledgerPath('hotl-pilot-replay-');
    const engine = await approvedWorkspace(filePath);

    const first = await engine.approvePilot({ expectedVersion: 2, reason }, owner, approvalKey);
    expect(first).toMatchObject({ decision: 'allow', status: 'approved' });
    expect(first.replayed).toBeUndefined();

    // Move the Constitution on, so a replayed response that merely echoed the live version
    // could not be mistaken for current authority.
    await engine.updateConstitution({ expectedVersion: 3, reason: 'Owner raises the price change limit', maxPriceChangePct: 10 }, owner, 'pilot-post-approval-change');
    const live = await rawLedger(filePath);
    expect(live.constitution.version).toBe(4);
    const auditBeforeReplay = live.audit.length;

    const replay = await engine.approvePilot({ expectedVersion: 2, reason }, owner, approvalKey);

    // It is visibly a replay, it is the recorded historical result, and it did not act again.
    expect(replay.replayed).toBe(true);
    expect(replay).toEqual({ ...first, replayed: true });
    expect((replay.after as BusinessConstitution).version).toBe(3);
    expect((replay.after as BusinessConstitution).version).not.toBe(live.constitution.version);
    expect(replay).not.toHaveProperty('mode');

    const after = await rawLedger(filePath);
    expect(after.constitution.version).toBe(4);
    expect(after.constitution.version).toBe(live.constitution.version);
    expect(after.audit).toHaveLength(auditBeforeReplay);
    expect(after.audit.filter(entry => entry.eventType === 'constitution.pilot-approved')).toHaveLength(1);
    assertChain(after.audit as never);

    // The persisted key format is exactly `id:<key>`, and it still holds the recorded result.
    expect(Object.keys(after.idempotency)).toContain(`id:${approvalKey}`);
    expect(after.idempotency[approvalKey]).toBeUndefined();
    expect(after.idempotency[`id:${approvalKey}`]!.result).toMatchObject({ decision: 'allow', status: 'approved' });
    expect(after.idempotency[`id:${approvalKey}`]!.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps replay protection across a restart and refuses another actor on the same key', async () => {
    const filePath = await ledgerPath('hotl-pilot-replay-restart-');
    const engine = await approvedWorkspace(filePath);
    const approved = await engine.approvePilot({ expectedVersion: 2, reason }, owner, approvalKey);

    const restarted = await createEngine({ filePath, seed: false });
    expect(await restarted.approvePilot({ expectedVersion: 2, reason }, owner, approvalKey)).toEqual({ ...approved, replayed: true });

    // The fingerprint binds the actor, so a second identity cannot read or reuse the record.
    const conflict = await restarted.approvePilot({ expectedVersion: 2, reason }, { type: 'owner', id: 'a-different-owner' }, approvalKey)
      .then(() => null, (error: unknown) => error);
    expect(conflict).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', statusCode: 409 });

    const ledger = await rawLedger(filePath);
    expect(ledger.constitution.version).toBe(3);
    expect(ledger.audit.filter(entry => entry.eventType === 'constitution.pilot-approved')).toHaveLength(1);
  });

  it('invalidates recorded authority as soon as the draft it authorised changes', async () => {
    const filePath = await ledgerPath('hotl-pilot-stale-authority-');
    const engine = await approvedWorkspace(filePath);
    await engine.approvePilot({ expectedVersion: 2, reason }, owner, approvalKey);
    const approved = await rawLedger(filePath);
    const granted = approved.constitution.pilot!.approval!;
    expect(granted.constitutionVersion).toBe(3);

    // The owner changes one pilot input. The recorded digest must no longer describe the draft.
    const changed = completePilotDraft();
    changed.profile.initialSalesTarget = { value: 1200, provenance: 'OWNER_ENTERED', evidenceRef: 'Owner pilot worksheet, revised review' };
    const saved = await engine.updateConstitution({ expectedVersion: 3, reason: 'Owner revises the pilot sales target', pilotDraft: changed }, owner, 'pilot-draft-revised');
    expect(saved.decision).toBe('allow');

    // The digest genuinely binds the draft: it does not describe the revised one.
    expect(granted.draftDigest).toBe(digest(approved.constitution.pilot!.draft));
    expect(granted.draftDigest).not.toBe(digest(changed));

    // And the ledger keeps no live authority at all: saveConstitution drops a stale approval.
    const after = await rawLedger(filePath);
    expect(after.constitution.version).toBe(4);
    expect(after.constitution.pilot!.approval).toBeUndefined();
    expect((await rehydrate(filePath)).constitution!.pilot!.approval).toBeUndefined();
    // The superseded version remains history, but its authority is bound to its own draft only.
    const superseded = after.constitutionHistory.find(entry => entry.version === 3)!.constitution;
    expect(superseded.pilot!.approval!.draftDigest).toBe(digest(superseded.pilot!.draft));
    expect(superseded.pilot!.approval!.draftDigest).not.toBe(digest(changed));
    expect(after.constitutionHistory.at(-1)!.constitution.pilot!.approval).toBeUndefined();

    // The old version cannot be approved again, and a fresh key against the new draft must pass
    // the whole gate again -- the previous approval carries none of this authority forward.
    expect(await engine.approvePilot({ expectedVersion: 3, reason }, owner, 'pilot-old-version-key'))
      .toMatchObject({ decision: 'deny', reason: 'CONSTITUTION_CHANGED', currentConstitutionVersion: 4 });
    const reapproved = await engine.approvePilot({ expectedVersion: 4, reason }, owner, 'pilot-reapproved-key');
    expect(reapproved).toMatchObject({ decision: 'allow', status: 'approved' });
    const final = await rawLedger(filePath);
    expect(final.constitution.version).toBe(5);
    expect(final.constitution.pilot!.approval).toEqual({
      approvedBy: owner.id,
      approvedAt: expect.any(String),
      constitutionVersion: 5,
      draftDigest: digest(changed),
    });
    assertChain(final.audit as never);
  });
});
