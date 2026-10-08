import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createKillSwitch, type KillConfig } from '../src/server.js';
import { recentAuthentication } from '../src/auth.js';

const resources: Array<{ close: () => Promise<void> }> = [];
const directories: string[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0)) await resource.close();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function fixture(overrides: Partial<KillConfig> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-kill-test-'));
  directories.push(directory);
  const config: KillConfig = {
    auth: { mode: 'simulation', ownerToken: 'owner-secret', readToken: 'read-secret', demoPassword: 'local-password', proofSecret: 'test-proof-secret-test-proof-secret', ownerIds: [] },
    journalPath: join(directory, 'events.jsonl'), allowInitialize: true, hooks: {}, ...overrides,
  };
  const service = await createKillSwitch(config);
  resources.push(service);
  service.server.listen(0, '127.0.0.1');
  await once(service.server, 'listening');
  const address = service.server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  const url = `http://127.0.0.1:${address.port}`;
  const reauth = await fetch(`${url}/reauth`, { method: 'POST', headers: { authorization: 'Bearer owner-secret' }, body: JSON.stringify({ password: 'local-password' }) });
  const { reauthToken } = await reauth.json() as { reauthToken: string };
  const headers = { authorization: 'Bearer owner-secret', 'x-reauth-token': reauthToken, 'idempotency-key': 'kill-test-key-0001' };
  const engage = (body: unknown = { reason: 'Local emergency drill', confirmationPhrase: 'STOP EVERYTHING' }, extraHeaders = {}) => fetch(`${url}/engage`, { method: 'POST', headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) });
  return { service, config, url, headers, engage };
}

describe('independent kill switch', () => {
  it('requires a read token and recent owner reauthentication', async () => {
    const { url, engage, service } = await fixture();
    expect((await fetch(`${url}/state`)).status).toBe(401);
    expect((await engage(undefined, { 'x-reauth-token': '' })).status).toBe(401);
    expect((await engage(undefined, { authorization: 'Bearer attacker' })).status).toBe(401);
    expect(service.snapshot().engaged).toBe(false);
  });

  it('requires the exact typed confirmation and an idempotency key', async () => {
    const { engage, service } = await fixture();
    expect((await engage({ reason: 'drill', confirmationPhrase: 'stop everything' })).status).toBe(400);
    expect((await engage(undefined, { 'idempotency-key': '' })).status).toBe(400);
    expect(service.snapshot().engaged).toBe(false);
  });

  it('persists the one-way latch before response, survives restart, and has no disengage', async () => {
    const { service, config, url, engage, headers } = await fixture();
    expect((await engage()).status).toBe(202);
    await service.flush();
    // The latch must already be on disk at response time. The journal now opens with a
    // durable `initialized` sentinel, so assert the engaged event is present in the file
    // rather than assuming it is the first line.
    expect(await readFile(config.journalPath, 'utf8')).toContain('"type":"engaged"');
    expect((await fetch(`${url}/disengage`, { method: 'POST', headers })).status).toBe(404);
    await service.close();
    resources.splice(resources.indexOf(service), 1);
    const restarted = await createKillSwitch({ ...config, allowInitialize: false });
    resources.push(restarted);
    expect(restarted.snapshot().engaged).toBe(true);
  });

  it('main-down drill: latches while every external hook is unreachable and never claims revocation', async () => {
    const { engage, service } = await fixture({ hooks: { queues_halted: { url: 'http://127.0.0.1:1/unavailable-main-stack', token: 'independent-revocation-secret' } } });
    const response = await engage();
    expect(response.status).toBe(202);
    expect((await response.json() as { actionsTaken: string[] }).actionsTaken).toEqual([]);
    await service.flush();
    expect(service.snapshot().engaged).toBe(true);
    expect(service.snapshot().actions.find(action => action.name === 'queues_halted')?.status).toBe('failed');
    expect(service.snapshot().actions.find(action => action.name === 'meta_token_revoked')?.status).toBe('unconfigured');
    expect(service.snapshot().actions.some(action => action.status === 'succeeded')).toBe(false);
  });

  it('only records successful revocation after an explicit action-matching receipt and retries failures', async () => {
    let attempts = 0;
    const mockedFetch: typeof fetch = async () => {
      attempts += 1;
      return new Response(JSON.stringify(attempts === 1 ? { status: 'ok' } : { status: 'succeeded', action: 'meta_token_revoked' }), { status: 200 });
    };
    const { engage, service, url, headers } = await fixture({ hooks: { meta_token_revoked: { url: 'https://independent-revoker.example/revoke', token: 'revoke-secret' } }, fetch: mockedFetch });
    await engage();
    await service.flush();
    expect(service.snapshot().actions.find(action => action.name === 'meta_token_revoked')?.status).toBe('failed');
    expect((await fetch(`${url}/retry`, { method: 'POST', headers })).status).toBe(202);
    await service.flush();
    expect(service.snapshot().actions.find(action => action.name === 'meta_token_revoked')?.status).toBe('succeeded');
    await engage();
    await service.flush();
    expect(attempts).toBe(2);
  });

  it('serializes simultaneous engage requests into one latch event', async () => {
    const { engage, service, config } = await fixture();
    await Promise.all(Array.from({ length: 8 }, () => engage()));
    await service.flush();
    const events = (await readFile(config.journalPath, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line) as { type: string });
    expect(events.filter(event => event.type === 'engaged')).toHaveLength(1);
  });

  it('rejects corrupted persisted state instead of starting as unengaged', async () => {
    const { service, config, engage } = await fixture();
    await engage(); await service.flush(); await service.close();
    resources.splice(resources.indexOf(service), 1);
    const data = await readFile(config.journalPath, 'utf8');
    await writeFile(config.journalPath, data.replace('Local emergency drill', 'tampered'));
    await expect(createKillSwitch(config)).rejects.toThrow('integrity');
  });

  it('rejects stale, missing, or future authentication timestamps', () => {
    expect(recentAuthentication({ amr: [{ method: 'password', timestamp: 900 }] }, 1000)).toBe(true);
    expect(recentAuthentication({ amr: [{ method: 'password', timestamp: 699 }] }, 1000)).toBe(false);
    expect(recentAuthentication({ amr: [{ method: 'password', timestamp: 1031 }] }, 1000)).toBe(false);
    expect(recentAuthentication({ iat: 990 }, 1000)).toBe(false);
  });
});
