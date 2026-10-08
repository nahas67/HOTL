import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileSaver } from '../src/checkpointer.js';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-checkpoint-init-'));
  directories.push(directory);
  const file = join(directory, 'checkpoints.json');
  return { file, marker: `${file}.initialized` };
}
const MARKER_BYTES = '{"version":1}\n';
const threadOf = (threadId: string) => ({ configurable: { thread_id: threadId, checkpoint_ns: '' } });
const rootInput = { source: 'input', step: -1, parents: {} } as const;
const checkpoint = (id: string) => ({ v: 4, id, ts: '2026-09-18T00:00:00.000Z', channel_values: { approval: { interruptId: id, status: 'pending' } }, channel_versions: { approval: 1 }, versions_seen: {} });

describe('checkpoint initialization and loss detection', () => {
  it('persists an empty first initialization so restart does not bootstrap again', async () => {
    const { file, marker } = await fixture();
    await new FileSaver(file).load();
    const snapshot = await readFile(file);
    expect(JSON.parse(snapshot.toString())).toEqual({ version: 1, storage: {}, writes: {} });
    expect(JSON.parse(await readFile(marker, 'utf8'))).toEqual({ version: 1 });
    await new FileSaver(file).load();
    expect(await readFile(file)).toEqual(snapshot);
  });

  it('adopts a legacy version-1 file without rewriting its bytes', async () => {
    const { file, marker } = await fixture();
    const legacy = '{\n "version": 1, "storage": {}, "writes": {}\n}\n';
    await writeFile(file, legacy);
    await new FileSaver(file).load();
    expect(await readFile(file, 'utf8')).toBe(legacy);
    expect(JSON.parse(await readFile(marker, 'utf8'))).toEqual({ version: 1 });
  });

  it('retains checkpoint values and pending writes when adopting a populated legacy file', async () => {
    const { file, marker } = await fixture();
    const source = await new FileSaver(file).load();
    const config = await source.put(
      { configurable: { thread_id: 'legacy-refund-thread', checkpoint_ns: '' } },
      { v: 4, id: 'legacy-checkpoint', ts: '2026-09-18T00:00:00.000Z', channel_values: { approval: { interruptId: 'refund-42', status: 'pending' } }, channel_versions: { approval: 1 }, versions_seen: {} },
      { source: 'input', step: -1, parents: {} },
    );
    await source.putWrites(config, [['approval', { interruptId: 'refund-42', status: 'approved' }]], 'owner-decision');
    const expected = await source.getTuple(config);
    const bytes = await readFile(file);
    await unlink(marker);
    const adopted = await new FileSaver(file).load();
    expect(await adopted.getTuple(config)).toEqual(expected);
    expect((await adopted.getTuple(config))?.pendingWrites).toEqual([
      ['owner-decision', 'approval', { interruptId: 'refund-42', status: 'approved' }],
    ]);
    expect(await readFile(file)).toEqual(bytes);
    expect(JSON.parse(await readFile(marker, 'utf8'))).toEqual({ version: 1 });
  });

  it('refuses a disappeared initialized checkpoint on a new process instance', async () => {
    const { file, marker } = await fixture();
    await new FileSaver(file).load();
    const markerBytes = await readFile(marker);
    await unlink(file);
    await expect(new FileSaver(file).load()).rejects.toThrow('checkpoint file is missing');
    await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(marker)).toEqual(markerBytes);
  });

  it('fails closed after a crash between marker creation and initial snapshot creation', async () => {
    const { file, marker } = await fixture();
    await writeFile(marker, '{"version":1}\n');
    await expect(new FileSaver(file).load()).rejects.toThrow('checkpoint file is missing');
    await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['{', '{"version":99}', '{"version":1,"ignored":true}'])('refuses corrupt initialization marker %s without changing data', async badMarker => {
    const { file, marker } = await fixture();
    await new FileSaver(file).load();
    const snapshot = await readFile(file);
    await writeFile(marker, badMarker);
    await expect(new FileSaver(file).load()).rejects.toThrow();
    expect(await readFile(file)).toEqual(snapshot);
    expect(await readFile(marker, 'utf8')).toBe(badMarker);
  });

  it.each(['snapshot', 'marker'] as const)('does not acknowledge writes after the %s disappears', async missing => {
    const { file, marker } = await fixture();
    const saver = await new FileSaver(file).load();
    const lost = missing === 'snapshot' ? file : marker;
    await unlink(lost);
    await expect(saver.deleteThread('absent-thread')).rejects.toThrow();
    await expect(readFile(lost)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses writes after marker corruption and preserves the last committed checkpoint', async () => {
    const { file, marker } = await fixture();
    const saver = await new FileSaver(file).load();
    const snapshot = await readFile(file);
    await writeFile(marker, '{"version":2}');
    await expect(saver.deleteThread('absent-thread')).rejects.toThrow('Invalid checkpoint initialization marker');
    expect(await readFile(file)).toEqual(snapshot);
    expect(await readFile(marker, 'utf8')).toBe('{"version":2}');
  });

  // A flush fault must cost exactly one refused write, not the whole process.
  // The next flush runs its own body and reports its own result, so a transient
  // EACCES/EBUSY/ENOSPC on a synced workspace cannot wedge checkpointing until
  // someone restarts the orchestrator.
  it('persists again on the same instance after a transient flush failure', async () => {
    const { file, marker } = await fixture();
    const saver = await new FileSaver(file).load();
    await saver.put(threadOf('thread-before-fault'), checkpoint('before-fault'), rootInput);
    const committed = await readFile(file);
    // The initialization marker is briefly unavailable, so the next flush
    // cannot acknowledge its write.
    await unlink(marker);
    await expect(saver.put(threadOf('thread-during-fault'), checkpoint('during-fault'), rootInput))
      .rejects.toThrow('marker is missing');
    // The fault clears without a restart. The same instance must recover.
    await writeFile(marker, MARKER_BYTES);
    await saver.put(threadOf('thread-after-fault'), checkpoint('after-fault'), rootInput);

    expect(await readFile(file)).not.toEqual(committed);
    // The refused write was never acknowledged, so the caller is told to retry. It may still
    // ride along on a later successful flush, because `put` updates the in-memory store first
    // and a refused flush costs durability, not the queued value. Carrying it forward is
    // deliberate: dropping it would lose a checkpoint the graph believes it wrote.
    expect(JSON.parse(await readFile(marker, 'utf8'))).toEqual({ version: 1 });
    const restored = await new FileSaver(file).load();
    expect((await restored.getTuple(threadOf('thread-before-fault')))?.checkpoint.id).toBe('before-fault');
    expect((await restored.getTuple(threadOf('thread-after-fault')))?.checkpoint.id).toBe('after-fault');
  });

  it('does not report a stale failure for a later write that itself succeeds', async () => {
    const { file, marker } = await fixture();
    const saver = await new FileSaver(file).load();
    await unlink(marker);
    await expect(saver.put(threadOf('thread-refused'), checkpoint('refused'), rootInput)).rejects.toThrow();
    await writeFile(marker, MARKER_BYTES);
    // If the flush queue were poisoned this would reject with the previous
    // marker error instead of persisting.
    await expect(saver.put(threadOf('thread-accepted'), checkpoint('accepted'), rootInput)).resolves.toBeDefined();
    expect(await (await new FileSaver(file).load()).getTuple(threadOf('thread-accepted'))).toBeDefined();
  });
});
