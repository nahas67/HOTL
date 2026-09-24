import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Actor } from '@hotl/schemas';
import { afterEach, describe, expect, it } from 'vitest';
import { createEngine } from '../src/engine.js';

const owner: Actor = { type: 'owner', id: 'restore-drill-owner' };
const directories: string[] = [];
const now = () => new Date('2026-09-17T12:00:00.000Z');
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function paths() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-ledger-restore-'));
  directories.push(directory);
  return { source: join(directory, 'source.json'), backup: join(directory, 'backup.json'), restored: join(directory, 'restored.json') };
}

describe('isolated file-ledger backup and restore', () => {
  it('restores exact state, audit, historical results and a persisted pause without repeating checkout', async () => {
    const files = await paths();
    const source = await createEngine({ filePath: files.source, now, killSwitchReader: async () => ({ engaged: false }) });
    const checkout = { items: [{ productId: 'prod-02', quantity: 1 }], customer: { name: 'Restore Fixture', email: 'restore@example.test' } };
    const order = await source.checkout(checkout, owner, 'restore-checkout');
    expect(order.decision).toBe('allow');
    const spend = { campaignId: 'restore-campaign', agentId: 'marketing_agent', requestedAmount: 1000, currency: 'USD' };
    const denied = await source.checkSpend(spend, owner, 'restore-ceiling-denial');
    expect(denied.reason).toBe('DAILY_CEILING_EXCEEDED');
    await source.setPause(true, { reason: 'Quiesce the isolated restore fixture' }, owner, 'restore-pause');
    const expected = await source.snapshot();
    const bytes = await readFile(files.source);
    const expectedDigest = digest(bytes);
    // The writer is quiescent. The pinned digest is held outside the copied file.
    await copyFile(files.source, files.backup);
    await copyFile(files.backup, files.restored);
    expect(digest(await readFile(files.restored))).toBe(expectedDigest);
    const restored = await createEngine({ filePath: files.restored, now, killSwitchReader: async () => ({ engaged: false }) });
    expect(await restored.snapshot()).toEqual(expected);
    expect(await restored.checkout(checkout, owner, 'restore-checkout')).toEqual(order);
    expect(await restored.checkSpend(spend, owner, 'restore-ceiling-denial')).toEqual(denied);
    expect(await restored.snapshot()).toEqual(expected);
    await expect(restored.checkout(checkout, { type: 'owner', id: 'different-owner' }, 'restore-checkout')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect((await restored.checkout(checkout, owner, 'restore-fresh-checkout')).reason).toBe('SYSTEM_PAUSED');
    const afterDenial = await restored.snapshot();
    expect(afterDenial.orders).toEqual(expected.orders);
    expect(afterDenial.products).toEqual(expected.products);
    expect(afterDenial.audit.slice(0, expected.audit.length)).toEqual(expected.audit);
    expect(afterDenial.audit).toHaveLength(expected.audit.length + 1);
    expect(digest(await readFile(files.source))).toBe(expectedDigest);
    expect(digest(await readFile(files.backup))).toBe(expectedDigest);
  });

  it('preserves persisted financial denials and freshly enforces independent kill state after restore', async () => {
    const files = await paths();
    const source = await createEngine({ filePath: files.source, now });
    const margin = await source.publishListing({ productId: 'prod-06' }, owner, 'restore-margin-denial');
    expect(margin.reason).toBe('MARGIN_BELOW_FLOOR');
    await copyFile(files.source, files.backup);
    await copyFile(files.backup, files.restored);
    const expected = await source.snapshot();
    const restored = await createEngine({ filePath: files.restored, now, killSwitchReader: async () => ({ engaged: true }) });
    expect(await restored.snapshot()).toEqual(expected);
    expect(await restored.publishListing({ productId: 'prod-06' }, owner, 'restore-margin-denial')).toEqual(margin);
    expect((await restored.publishListing({ productId: 'prod-01' }, owner, 'restore-killed-listing')).reason).toBe('KILL_SWITCH_ENGAGED');
    expect((await restored.snapshot()).products).toEqual(expected.products);
  });

  it('rejects a corrupted restored audit and leaves the verified backup untouched', async () => {
    const files = await paths();
    const source = await createEngine({ filePath: files.source, now });
    await source.setPause(true, { reason: 'Corruption drill fixture' }, owner, 'restore-corruption-pause');
    await copyFile(files.source, files.backup);
    const backup = await readFile(files.backup);
    const corrupt = JSON.parse(backup.toString('utf8'));
    corrupt.audit[0].summary = 'Changed during transfer';
    await writeFile(files.restored, JSON.stringify(corrupt));
    expect(digest(await readFile(files.restored))).not.toBe(digest(backup));
    await expect(createEngine({ filePath: files.restored, now })).rejects.toMatchObject({ code: 'AUDIT_INTEGRITY_FAILED' });
    expect(await readFile(files.backup)).toEqual(backup);
    expect((await source.snapshot()).paused).toBe(true);
  });
});
