import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngine } from '@hotl/guardrail-service';
import { createServer } from '@hotl/guardrail-service/server';
import { afterEach, describe, expect, it } from 'vitest';
import { FileSaver } from '../src/checkpointer.js';
import { HttpGuardrails } from '../src/client.js';
import { createCommerceGraph } from '../src/graph.js';
import { RunManager } from '../src/manager.js';

const resources: Array<() => Promise<unknown>> = [];
const owner = { type: 'owner' as const, id: 'simulation-owner' };
afterEach(async () => {
  for (const close of resources.splice(0).reverse()) await close();
});
async function start(ledger: string, checkpoints: string) {
  const engine = await createEngine({ filePath: ledger, killSwitchReader: async () => ({ engaged: false }) });
  const server = await createServer({ engine, mode: 'simulation', internalToken: 'restore-fixture-token' });
  await server.listen({ port: 0, host: '127.0.0.1' });
  resources.push(() => server.close());
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture listener');
  const gateway = new HttpGuardrails(`http://127.0.0.1:${address.port}`, 'restore-fixture-token');
  const saver = await new FileSaver(checkpoints).load();
  const manager = new RunManager(createCommerceGraph(gateway, saver), gateway);
  return { engine, server, manager };
}
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('quiescent ledger and workflow backup restore', () => {
  it.each([false, true])('restores a refund interrupt and resumes exactly once (approval already committed: %s)', async approvedBeforeBackup => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-workflow-restore-'));
    resources.push(() => rm(directory, { recursive: true, force: true }));
    const ledger = join(directory, 'source-ledger.json');
    const checkpoints = join(directory, 'source-checkpoints.json');
    const source = await start(ledger, checkpoints);
    const interrupted = await source.manager.start('daily', 'restore-refund-cycle');
    expect(interrupted.status).toBe('interrupted');
    expect(interrupted.activeStage).toBe('refund');
    expect(interrupted.interruptId).toBeTruthy();
    const interruptId = interrupted.interruptId!;
    const proposal = (await source.engine.snapshot()).interrupts.find(item => item.id === interruptId)!;
    expect(Number((proposal.payload.request as { amount: number }).amount)).toBeGreaterThan(25);
    const approval = { decision: 'approve', note: 'Owner verified this isolated restore fixture.' };
    if (approvedBeforeBackup) {
      expect((await source.engine.resolveInterrupt(interruptId, approval, owner, 'restore-refund-approval')).status).toBe('resolved');
    }
    // No scheduler/workers are running; graph is interrupted and HTTP intake is closed.
    await source.server.close();
    const expected = await source.engine.snapshot();
    const ledgerBytes = await readFile(ledger);
    const ledgerMarkerBytes = await readFile(`${ledger}.initialized`);
    const checkpointBytes = await readFile(checkpoints);
    const checkpointMarkerBytes = await readFile(`${checkpoints}.initialized`);
    const manifest = { ledger: digest(ledgerBytes), ledgerMarker: digest(ledgerMarkerBytes), checkpoints: digest(checkpointBytes), checkpointMarker: digest(checkpointMarkerBytes), auditHead: expected.audit.at(-1)!.hash };
    const ledgerBackup = join(directory, 'backup-ledger.json');
    const checkpointBackup = join(directory, 'backup-checkpoints.json');
    await copyFile(ledger, ledgerBackup);
    await copyFile(`${ledger}.initialized`, `${ledgerBackup}.initialized`);
    await copyFile(checkpoints, checkpointBackup);
    await copyFile(`${checkpoints}.initialized`, `${checkpointBackup}.initialized`);
    const restoredLedger = join(directory, 'restored-ledger.json');
    const restoredCheckpoints = join(directory, 'restored-checkpoints.json');
    await copyFile(ledgerBackup, restoredLedger);
    await copyFile(`${ledgerBackup}.initialized`, `${restoredLedger}.initialized`);
    await copyFile(checkpointBackup, restoredCheckpoints);
    await copyFile(`${checkpointBackup}.initialized`, `${restoredCheckpoints}.initialized`);
    expect(digest(await readFile(restoredLedger))).toBe(manifest.ledger);
    expect(digest(await readFile(`${restoredLedger}.initialized`))).toBe(manifest.ledgerMarker);
    expect(digest(await readFile(restoredCheckpoints))).toBe(manifest.checkpoints);
    expect(digest(await readFile(`${restoredCheckpoints}.initialized`))).toBe(manifest.checkpointMarker);
    const restored = await start(restoredLedger, restoredCheckpoints);
    expect(await restored.engine.snapshot()).toEqual(expected);
    expect((await restored.manager.get(interrupted.runId)).interruptId).toBe(interruptId);
    if (!approvedBeforeBackup) {
      await expect(restored.manager.resume(interrupted.runId, interruptId, expected.interrupts)).rejects.toThrow('owner must resolve');
      expect((await restored.engine.snapshot()).refunds).toHaveLength(0);
    }
    expect((await restored.engine.resolveInterrupt(interruptId, approval, owner, 'restore-refund-approval')).status).toBe('resolved');
    const afterApproval = await restored.engine.snapshot();
    expect(afterApproval.refunds).toHaveLength(1);
    expect(afterApproval.audit.slice(0, expected.audit.length)).toEqual(expected.audit);
    expect(afterApproval.audit[expected.audit.length - 1]!.hash).toBe(manifest.auditHead);
    expect((await restored.manager.resume(interrupted.runId, interruptId, afterApproval.interrupts)).status).toBe('completed');
    const completed = await restored.engine.snapshot();
    expect((await restored.manager.resume(interrupted.runId, interruptId, completed.interrupts)).status).toBe('completed');
    await restored.engine.resolveInterrupt(interruptId, approval, owner, 'restore-refund-approval');
    const replayed = await restored.engine.snapshot();
    expect(replayed.refunds).toEqual(completed.refunds);
    expect(replayed.orders).toEqual(completed.orders);
    expect(replayed.audit).toEqual(completed.audit);
    expect(await readFile(ledgerBackup)).toEqual(ledgerBytes);
    expect(await readFile(`${ledgerBackup}.initialized`)).toEqual(ledgerMarkerBytes);
    expect(await readFile(checkpointBackup)).toEqual(checkpointBytes);
    expect(await readFile(`${checkpointBackup}.initialized`)).toEqual(checkpointMarkerBytes);
    expect(await readFile(ledger)).toEqual(ledgerBytes);
    expect(await readFile(checkpoints)).toEqual(checkpointBytes);
  }, 15000);

  it.each(['truncated', 'unsupported-version'] as const)('refuses a %s checkpoint restore without overwriting the supplied file', async fault => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-checkpoint-restore-'));
    resources.push(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, 'invalid-checkpoints.json');
    const bytes = fault === 'truncated' ? '{"version":1,"storage":' : JSON.stringify({ version: 99, storage: {}, writes: {} });
    await writeFile(path, bytes);
    await expect(new FileSaver(path).load()).rejects.toThrow();
    expect(await readFile(path, 'utf8')).toBe(bytes);
  });

  it.each([
    { storage: { thread: [] }, writes: {} },
    { storage: { thread: { '': { checkpoint: ['not-bytes', 'not-bytes', null] } } }, writes: {} },
    { storage: {}, writes: { pending: { task: ['task', 'approval', { __bytes: 'invalid base64!' }] } } },
  ])('refuses structurally corrupt checkpoint payloads without changing the file', async payload => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-checkpoint-structure-'));
    resources.push(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, 'invalid-checkpoints.json');
    const bytes = JSON.stringify({ version: 1, ...payload });
    await writeFile(path, bytes);
    await expect(new FileSaver(path).load()).rejects.toThrow('Invalid checkpoint file');
    expect(await readFile(path, 'utf8')).toBe(bytes);
    await expect(readFile(`${path}.initialized`)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
