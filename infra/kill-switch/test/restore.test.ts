import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KillJournal } from '../src/journal.js';

const directories: string[] = [];
const journals: KillJournal[] = [];
afterEach(async () => {
  for (const journal of journals.splice(0)) await journal.close();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-kill-restore-'));
  directories.push(directory);
  const source = new KillJournal(join(directory, 'source.jsonl'), true);
  journals.push(source);
  await source.initialize();
  await source.append('engaged', { actor: 'restore-drill-owner', reason: 'Isolated recovery drill', actions: ['queues_halted', 'litellm_keys_revoked'] });
  await source.append('action', { name: 'queues_halted', status: 'failed', attempts: 1, error: 'Fixture: independent queue hook unavailable' });
  await source.append('action', { name: 'litellm_keys_revoked', status: 'unconfigured', attempts: 1, error: 'Fixture: no provider configured' });
  const expected = source.snapshot();
  await source.close();
  const backup = join(directory, 'backup.jsonl');
  await copyFile(source.path, backup);
  return { directory, source, backup, expected };
}

describe('independent kill-journal restore', () => {
  it('restores the one-way latch and incomplete action evidence without claiming queues drained or tokens revoked', async () => {
    const { directory, source, backup, expected } = await fixture();
    const bytes = await readFile(backup);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const restored = new KillJournal(join(directory, 'restored.jsonl'), false);
    journals.push(restored);
    await copyFile(backup, restored.path);
    expect(createHash('sha256').update(await readFile(restored.path)).digest('hex')).toBe(digest);
    await restored.initialize();
    expect(restored.snapshot()).toEqual(expected);
    expect(restored.snapshot().engaged).toBe(true);
    expect(restored.snapshot().actions.some(action => action.status === 'succeeded')).toBe(false);
    // Continued failure appends to the restored chain; it cannot clear the latch.
    await restored.append('action', { name: 'queues_halted', status: 'failed', attempts: 2, error: 'Fixture: still unavailable after recovery' });
    await restored.close();
    const restarted = new KillJournal(restored.path, false);
    journals.push(restarted);
    await restarted.initialize();
    expect(restarted.snapshot()).toMatchObject({ engaged: true, revision: expected.revision + 1 });
    expect(restarted.snapshot().actions[0]).toMatchObject({ status: 'failed', attempts: 2 });
    expect(await readFile(backup)).toEqual(bytes);
    expect(await readFile(source.path)).toEqual(bytes);
  });

  it.each(['tampered', 'truncated', 'missing'] as const)('refuses a %s journal during restore with initialization disabled', async fault => {
    const { directory, backup } = await fixture();
    const bytes = await readFile(backup, 'utf8');
    const path = join(directory, 'invalid-restore.jsonl');
    if (fault === 'tampered') await writeFile(path, bytes.replace('Isolated recovery drill', 'Changed recovery reason'));
    if (fault === 'truncated') await writeFile(path, bytes.slice(0, -1));
    const restored = new KillJournal(path, false);
    journals.push(restored);
    await expect(restored.initialize()).rejects.toThrow();
    expect(await readFile(backup, 'utf8')).toBe(bytes);
  });

  // Rule 7: corrupt or incomplete emergency state must deny execution, never silently
  // reset. A zero-byte or whitespace-only file is indistinguishable from a latch that
  // was truncated to nothing, so it must refuse to start even where initialization is
  // permitted: `allowInitialize` authorizes creating a journal, never reading one that
  // already exists.
  it.each([
    ['empty', ''],
    ['whitespace', '\n  \n'],
  ] as const)('refuses an existing %s journal even when initialization is allowed', async (fault, contents) => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-kill-blank-'));
    directories.push(directory);
    const path = join(directory, 'blank.jsonl');
    await writeFile(path, contents);
    const restored = new KillJournal(path, true);
    journals.push(restored);
    await expect(restored.initialize()).rejects.toThrow(/Empty kill journal/);
  });

  it('distinguishes a never-engaged but initialized journal from a truncated one', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-kill-fresh-'));
    directories.push(directory);
    const path = join(directory, 'fresh.jsonl');
    // A first start with no existing file durably initializes an unengaged journal.
    const first = new KillJournal(path, true);
    journals.push(first);
    await first.initialize();
    expect(first.snapshot().engaged).toBe(false);
    await first.close();
    journals.splice(journals.indexOf(first), 1);
    // Restarting against that same never-used journal must still start, unengaged. The
    // journal opens with a durable `initialized` sentinel, so revision is 1 after creation;
    // what distinguishes it from a truncated journal is that it starts at all.
    expect((await readFile(path, 'utf8')).split('\n')[0]).toContain('"type":"initialized"');
    const restarted = new KillJournal(path, true);
    journals.push(restarted);
    await restarted.initialize();
    expect(restarted.snapshot()).toMatchObject({ engaged: false, revision: 1 });
    await restarted.close();
    journals.splice(journals.indexOf(restarted), 1);
    // Engaging and reopening it still reproduces the one-way latch.
    const engaged = new KillJournal(path, true);
    journals.push(engaged);
    await engaged.initialize();
    await engaged.append('engaged', { actor: 'fresh-drill-owner', reason: 'Initialized journal drill', actions: ['queues_halted'] });
    expect(engaged.snapshot().engaged).toBe(true);
  });
});
