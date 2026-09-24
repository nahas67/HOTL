import { copyFile, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEngine } from '../src/engine.js';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-ledger-init-'));
  directories.push(directory);
  const filePath = join(directory, 'ledger.json');
  return { directory, filePath, marker: `${filePath}.initialized` };
}

describe('file ledger initialization and restart loss detection', () => {
  it('requires explicit first-time initialization for a missing live ledger', async () => {
    const { filePath, marker } = await fixture();
    await expect(createEngine({ filePath, mode: 'live', seed: false })).rejects.toMatchObject({ code: 'STATE_MISSING' });
    await expect(readFile(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('persists an explicitly initialized empty live ledger and restarts without the initialization flag', async () => {
    const { filePath, marker } = await fixture();
    const initialized = await createEngine({ filePath, mode: 'live', seed: false, initializeEmptyFile: true });
    const expected = await initialized.snapshot();
    expect(expected.products).toEqual([]);
    expect(expected.orders).toEqual([]);
    expect(expected.audit[0]?.eventType).toBe('workspace.initialized');
    const bytes = await readFile(filePath);
    expect(await readFile(marker, 'utf8')).toBe('HOTL_LEDGER_INITIALIZED_V1\n');
    const restarted = await createEngine({ filePath, mode: 'live', seed: false });
    expect(await restarted.snapshot()).toEqual(expected);
    expect(await readFile(filePath)).toEqual(bytes);
  });

  it.each(['simulation', 'live'] as const)('refuses a lost initialized %s ledger even when initialization is requested', async mode => {
    const { filePath, marker } = await fixture();
    await createEngine({ filePath, mode, seed: false, initializeEmptyFile: true });
    const markerBytes = await readFile(marker);
    await unlink(filePath);
    await expect(createEngine({ filePath, mode, seed: false, initializeEmptyFile: true })).rejects.toMatchObject({ code: 'STATE_MISSING' });
    await expect(readFile(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(marker)).toEqual(markerBytes);
  });

  it('refuses a marker-only restore after a crash before the first ledger write', async () => {
    const { filePath, marker } = await fixture();
    await writeFile(marker, 'HOTL_LEDGER_INITIALIZED_V1\n');
    await expect(createEngine({ filePath, mode: 'live', seed: false, initializeEmptyFile: true })).rejects.toMatchObject({ code: 'STATE_MISSING' });
    await expect(readFile(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(marker, 'utf8')).toBe('HOTL_LEDGER_INITIALIZED_V1\n');
  });

  it.each(['', 'HOTL_LEDGER_INITIALIZED_V2\n', 'HOTL_LEDGER_INITIALIZED_V1\nextra'])('refuses invalid marker %j without overwriting the ledger', async badMarker => {
    const { filePath, marker } = await fixture();
    await createEngine({ filePath });
    const bytes = await readFile(filePath);
    await writeFile(marker, badMarker);
    await expect(createEngine({ filePath, initializeEmptyFile: true })).rejects.toMatchObject({ code: 'STATE_INVALID' });
    expect(await readFile(filePath)).toEqual(bytes);
    expect(await readFile(marker, 'utf8')).toBe(badMarker);
  });

  it('adopts an existing verified legacy ledger without rewriting its bytes', async () => {
    const { filePath, marker } = await fixture();
    const source = await createEngine({ filePath });
    const expected = await source.snapshot();
    const bytes = await readFile(filePath);
    await unlink(marker);
    const adopted = await createEngine({ filePath });
    expect(await adopted.snapshot()).toEqual(expected);
    expect(await readFile(filePath)).toEqual(bytes);
    expect(await readFile(marker, 'utf8')).toBe('HOTL_LEDGER_INITIALIZED_V1\n');
  });

  it('restores the verified ledger and its marker together without reinitialization', async () => {
    const { directory, filePath, marker } = await fixture();
    const source = await createEngine({ filePath, mode: 'live', seed: false, initializeEmptyFile: true });
    const restoredPath = join(directory, 'restored.json');
    await copyFile(filePath, restoredPath);
    await copyFile(marker, `${restoredPath}.initialized`);
    const restored = await createEngine({ filePath: restoredPath, mode: 'live', seed: false });
    expect(await restored.snapshot()).toEqual(await source.snapshot());
    expect(await readFile(restoredPath)).toEqual(await readFile(filePath));
    expect(await readFile(`${restoredPath}.initialized`)).toEqual(await readFile(marker));
  });
});
