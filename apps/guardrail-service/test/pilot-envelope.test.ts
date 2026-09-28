import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngine } from '../src/engine.js';
import { createServer } from '../src/server.js';
import { completePilotDraft } from './pilot-fixture.js';

const owner = { type: 'owner' as const, id: 'pilot-owner' };
const agent = { type: 'agent' as const, id: 'marketing_agent' };
const reason = 'Owner confirms pilot business and risk boundary';
const paths: string[] = [];
afterEach(async () => { await Promise.all(paths.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe('pilot business and risk envelope', () => {
  it('starts explicitly unknown, denies incomplete approval, and rejects client-forged approval', async () => {
    const engine = await createEngine({ seed: false });
    const initial = (await engine.snapshot()).constitution!;
    expect(initial.pilot!.draft.profile.country).toEqual({ value: null, provenance: 'UNKNOWN' });
    expect(await engine.approvePilot({ expectedVersion: 1, reason }, owner, 'missing')).toMatchObject({ decision: 'deny', reason: 'PILOT_PROFILE_INCOMPLETE' });
    expect((await engine.snapshot()).constitution!.version).toBe(1);
    await expect(engine.updateConstitution({ expectedVersion: 1, reason, pilot: { draft: completePilotDraft(),
      approval: { approvedBy: owner.id, approvedAt: new Date().toISOString(), constitutionVersion: 2, draftDigest: '0'.repeat(64) } } }, owner, 'forged')).rejects.toBeDefined();
    expect((await engine.snapshot()).constitution!.pilot!.approval).toBeUndefined();
  });

  it('requires authoritative financial provenance and complete owner limits and stop rules', async () => {
    const engine = await createEngine({ seed: false });
    const draft = completePilotDraft();
    draft.capital.maxDailySpend = { value: 100, provenance: 'ESTIMATED', evidenceRef: 'Model guess, not owner authorization' };
    const edited = await engine.updateConstitution({ expectedVersion: 1, reason, pilotDraft: draft }, owner, 'estimated');
    expect(await engine.approvePilot({ expectedVersion: 2, reason }, owner, 'estimated-approve')).toMatchObject({ decision: 'deny', reason: 'PILOT_OWNER_LIMITS_REQUIRED' });
    expect(edited.decision).toBe('allow');
    draft.capital.maxDailySpend = { value: 1000, provenance: 'OWNER_ENTERED', evidenceRef: 'Owner pilot worksheet' };
    draft.stopRules = [];
    await engine.updateConstitution({ expectedVersion: 2, reason, pilotDraft: draft }, owner, 'no-stop');
    expect(await engine.approvePilot({ expectedVersion: 3, reason }, owner, 'no-stop-approve')).toMatchObject({ decision: 'deny', reason: 'PILOT_STOP_RULES_REQUIRED' });
    draft.stopRules = completePilotDraft().stopRules;
    draft.economics.supplierProductCost = { value: 30, provenance: 'ESTIMATED', evidenceRef: 'AI generated guess' };
    draft.economics.targetContribution = { value: null, provenance: 'UNKNOWN' };
    draft.economics.breakEvenCac = { value: null, provenance: 'UNKNOWN' };
    draft.economics.breakEvenRoas = { value: null, provenance: 'UNKNOWN' };
    await engine.updateConstitution({ expectedVersion: 3, reason, pilotDraft: draft }, owner, 'estimated-cost');
    expect(await engine.approvePilot({ expectedVersion: 4, reason }, owner, 'estimated-cost-approve')).toMatchObject({ decision: 'deny', reason: 'PILOT_ECONOMICS_INCOMPLETE' });
    expect((await engine.snapshot()).constitution!.pilot!.approval).toBeUndefined();
  });

  it('does not approve an enabled stop rule whose deterministic signal is unavailable', async () => {
    const engine = await createEngine({ seed: false });
    const draft = completePilotDraft();
    draft.stopRules.push({ metric: 'TRACKING_FAILURES', unit: 'COUNT', threshold: 1,
      action: 'BLOCK_NEW_ACTIONS', enabled: true });
    await engine.updateConstitution({ expectedVersion: 1, reason, pilotDraft: draft }, owner, 'unavailable-signal');
    expect(await engine.approvePilot({ expectedVersion: 2, reason }, owner, 'approve-unavailable-signal'))
      .toMatchObject({ decision: 'deny', reason: 'PILOT_STOP_SIGNAL_UNAVAILABLE' });
  });

  it('rejects mixed currency limits and stop-rule units that cannot be interpreted deterministically', async () => {
    const engine = await createEngine({ seed: false });
    const draft = completePilotDraft();
    draft.profile.currency = { value: 'EUR', provenance: 'OWNER_ENTERED', evidenceRef: 'Owner pilot worksheet' };
    await engine.updateConstitution({ expectedVersion: 1, reason, pilotDraft: draft }, owner, 'eur-draft');
    expect(await engine.approvePilot({ expectedVersion: 2, reason }, owner, 'eur-approve')).toMatchObject({ decision: 'deny', reason: 'PILOT_CURRENCY_UNSUPPORTED' });
    draft.profile.currency = { value: 'USD', provenance: 'OWNER_ENTERED', evidenceRef: 'Owner pilot worksheet' };
    draft.stopRules[0] = { ...draft.stopRules[0], unit: 'FRACTION' };
    await expect(engine.updateConstitution({ expectedVersion: 2, reason, pilotDraft: draft }, owner, 'bad-unit')).rejects.toBeDefined();
    expect((await engine.snapshot()).constitution!.version).toBe(2);
  });

  it('binds approval to the current Constitution and rejects agents, stale versions, and conflicting replays after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-pilot-')); paths.push(directory);
    const filePath = join(directory, 'ledger.json');
    const engine = await createEngine({ filePath, seed: false });
    const draft = completePilotDraft();
    await expect(engine.updateConstitution({ expectedVersion: 1, reason, pilotDraft: draft }, agent, 'agent-edit')).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    await expect(engine.approvePilot({ expectedVersion: 1, reason }, agent, 'agent-approve')).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    const edited = await engine.updateConstitution({ expectedVersion: 1, reason, pilotDraft: draft }, owner, 'draft');
    expect((edited.constitution as { version: number }).version).toBe(2);
    expect(await engine.approvePilot({ expectedVersion: 1, reason }, owner, 'stale')).toMatchObject({ decision: 'deny', reason: 'CONSTITUTION_CHANGED' });
    const approval = await engine.approvePilot({ expectedVersion: 2, reason }, owner, 'approve');
    expect(approval).toMatchObject({ decision: 'allow', constitution: { version: 3, pilot: { approval: { approvedBy: owner.id, constitutionVersion: 3 } } } });
    const restarted = await createEngine({ filePath, seed: false });
    expect(await restarted.approvePilot({ expectedVersion: 2, reason }, owner, 'approve')).toEqual(approval);
    await expect(restarted.approvePilot({ expectedVersion: 2, reason: 'Conflicting owner replay' }, owner, 'approve')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const changed = await restarted.updateConstitution({ expectedVersion: 3, reason: 'Owner changes the price change limit', maxPriceChangePct: 10 }, owner, 'policy-change');
    expect(changed).toMatchObject({ decision: 'allow', constitution: { version: 4 } });
    expect((await restarted.snapshot()).constitution!.pilot!.approval).toBeUndefined();
    expect(await restarted.approvePilot({ expectedVersion: 3, reason }, owner, 'old-version')).toMatchObject({ decision: 'deny', reason: 'CONSTITUTION_CHANGED' });
    const persisted = await createEngine({ filePath, seed: false });
    expect((await persisted.snapshot()).constitution!.pilot!.approval).toBeUndefined();
  });

  it('loads a prior Constitution without a pilot envelope and keeps it unapproved', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-pilot-')); paths.push(directory);
    const filePath = join(directory, 'ledger.json');
    await createEngine({ filePath, seed: false });
    const historical = JSON.parse(await readFile(filePath, 'utf8'));
    delete historical.constitution.pilot;
    for (const entry of historical.constitutionHistory) delete entry.constitution.pilot;
    await writeFile(filePath, JSON.stringify(historical));
    const restarted = await createEngine({ filePath, seed: false });
    expect((await restarted.snapshot()).constitution!.pilot).toBeUndefined();
    expect(await restarted.approvePilot({ expectedVersion: 1, reason }, owner, 'old-approve')).toMatchObject({ decision: 'deny', reason: 'PILOT_ENVELOPE_REQUIRED' });
    const next = await restarted.updateConstitution({ expectedVersion: 1, reason, pilotDraft: completePilotDraft() }, owner, 'old-draft');
    expect(next.decision).toBe('allow');
    await expect((await createEngine({ filePath, seed: false })).snapshot()).resolves.toMatchObject({ constitution: { pilot: { draft: { profile: { country: { value: 'US' } } } } } });
  });

  it('exposes an owner-only approval route with strict input and idempotency', async () => {
    const engine = await createEngine({ seed: false });
    const server = await createServer({ engine, mode: 'simulation', internalToken: 'pilot-test-token', workspaceId: 'pilot-workspace' });
    try {
      const url = '/api/guardrails/v1/constitution/pilot/approve';
      const ownerHeaders = { 'x-hotl-internal-token': 'pilot-test-token', 'idempotency-key': 'pilot-http-approve' };
      expect((await server.inject({ method: 'POST', url, payload: { expectedVersion: 1, reason } })).statusCode).toBe(401);
      expect((await server.inject({ method: 'POST', url, headers: { ...ownerHeaders, 'x-hotl-agent-id': 'marketing_agent' }, payload: { expectedVersion: 1, reason } })).statusCode).toBe(403);
      expect((await server.inject({ method: 'POST', url, headers: ownerHeaders, payload: { expectedVersion: 1, reason, approvedBy: 'forged' } })).statusCode).toBe(400);
      const denied = await server.inject({ method: 'POST', url, headers: ownerHeaders, payload: { expectedVersion: 1, reason } });
      expect(denied.json()).toMatchObject({ decision: 'deny', reason: 'PILOT_PROFILE_INCOMPLETE' });
      const state = await engine.snapshot();
      expect(state.audit.at(-1)).toMatchObject({ eventType: 'constitution.pilot-approved', actorType: 'owner' });
    } finally { await server.close(); }
  });
});
