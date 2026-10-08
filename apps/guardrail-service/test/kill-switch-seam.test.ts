import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer as createNodeServer } from 'node:http';
import { createKillSwitch, type KillConfig } from '../../../infra/kill-switch/src/server.js';
import { createServer } from '../src/server.js';

// The guardrail and the kill switch are, by design, INDEPENDENTLY deployed with independent
// credentials. This is the only test in the repository that exercises the code connecting them
// over real HTTP. Every other kill test injects a reader lambda, so a typo in the /state path,
//// a dropped Authorization header, a wrong default read token, a /health response mistaken for
// /state, or a misfiring timeout would all leave the production path broken while the suite
// stayed green.
//
// The kill service is treated strictly as a black box here. It is not modified or weakened.

const READ_TOKEN = 'seam-read-token-seam-read-token-seam-32b';
const OWNER_TOKEN = 'seam-owner-token';
const DEMO_PASSWORD = 'seam-demo-password';
const directories: string[] = [];
const closers: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function killPlane() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-seam-kill-'));
  directories.push(directory);
  const config: KillConfig = {
    // Simulation mode here exercises the GUARDRAIL's reader closure, which is mode-independent
    // and is the code this file exists to cover. Live mode would additionally require a real
    // Supabase-signed owner JWT to engage, which cannot be minted in a unit test.
    auth: { mode: 'simulation', ownerToken: OWNER_TOKEN, readToken: READ_TOKEN, demoPassword: DEMO_PASSWORD, proofSecret: 'seam-proof-secret-seam-proof-secret', ownerIds: [] },
    journalPath: join(directory, 'events.jsonl'), allowInitialize: true, hooks: {},
  };
  const service = await createKillSwitch(config);
  closers.push(() => service.close());
  service.server.listen(0, '127.0.0.1');
  await once(service.server, 'listening');
  const address = service.server.address();
  if (!address || typeof address === 'string') throw new Error('No kill-switch address');
  const url = `http://127.0.0.1:${address.port}`;
  const reauth = await fetch(`${url}/reauth`, { method: 'POST', headers: { authorization: `Bearer ${OWNER_TOKEN}` }, body: JSON.stringify({ password: DEMO_PASSWORD }) });
  const { reauthToken } = await reauth.json() as { reauthToken: string };
  return {
    url, service,
    engage: () => fetch(`${url}/engage`, {
      method: 'POST',
      headers: { authorization: `Bearer ${OWNER_TOKEN}`, 'x-reauth-token': reauthToken, 'idempotency-key': 'seam-engage-key-0001' },
      body: JSON.stringify({ reason: 'Seam drill', confirmationPhrase: 'STOP EVERYTHING' }),
    }),
  };
}

/** The real guardrail reader closure from server.ts, reached through createServer with no engine. */
async function guardrail(killUrl: string, readToken = READ_TOKEN) {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-seam-guard-'));
  directories.push(directory);
  process.env.GUARDRAIL_STATE_PATH = join(directory, 'ledger.json');
  process.env.GUARDRAIL_INITIALIZE_EMPTY_FILE = 'true';
  process.env.KILL_SWITCH_URL = killUrl;
  process.env.KILL_SWITCH_READ_TOKEN = readToken;
  const app = await createServer({ mode: 'simulation', internalToken: 'seam-internal-token' });
  closers.push(() => app.close());
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('No guardrail address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    call: () => fetch(`http://127.0.0.1:${address.port}/api/guardrails/v1/spend/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hotl-internal-token': 'seam-internal-token', 'idempotency-key': nextKey() },
      body: JSON.stringify(spend()),
    }),
  };
}

const spend = () => ({ campaignId: 'seam-campaign', requestedAmount: 25 });
let keyCounter = 0;
const nextKey = () => 'seam-spend-' + String(++keyCounter).padStart(4, '0');

describe('kill-switch to guardrail HTTP seam', () => {
  it('denies a consequential action once the independent plane is engaged', async () => {
    const kill = await killPlane();
    const guard = await guardrail(kill.url);
    // Healthy and unengaged: the action is evaluated normally.
    const before = await (await guard.call()).json();
    console.log('SEAM DEBUG', JSON.stringify(before), guard.url, kill.url);
    expect(before).toMatchObject({ decision: expect.any(String) });
    expect((await kill.engage()).status).toBe(202);
    const after = await (await guard.call()).json();
    expect(after).toMatchObject({ decision: 'deny' });
    expect(after.reason).toMatch(/KILL/i);
  });

  it('denies when the read token is wrong, rather than trusting the response', async () => {
    const kill = await killPlane();
    const guard = await guardrail(kill.url, 'wrong-read-token');
    const result = await (await guard.call()).json();
    expect(result).toMatchObject({ decision: 'deny', reason: 'KILL_SWITCH_UNAVAILABLE' });
  });

  it('denies when the independent plane is stopped, not merely unengaged', async () => {
    const kill = await killPlane();
    const guard = await guardrail(kill.url);
    await kill.service.close();
    const result = await (await guard.call()).json();
    expect(result).toMatchObject({ decision: 'deny', reason: 'KILL_SWITCH_UNAVAILABLE' });
  });

  it('denies when the plane answers without a usable engaged field', async () => {
    // A stand-in that answers 200 with a well-formed body carrying no latch state. It is a
    // bare HTTP server rather than a kill service, because the real /state route is served
    // from its journal and cannot be made to lie that way.
    const stub = createNodeServer((request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    });
    await new Promise<void>(resolve => stub.listen(0, '127.0.0.1', resolve));
    closers.push(() => new Promise<void>(resolve => stub.close(() => resolve())));
    const stubAddress = stub.address();
    if (!stubAddress || typeof stubAddress === 'string') throw new Error('No stub address');
    const guard = await guardrail(`http://127.0.0.1:${stubAddress.port}`);
    const result = await (await guard.call()).json();
    expect(result).toMatchObject({ decision: 'deny', reason: 'KILL_SWITCH_UNAVAILABLE' });
  });

  it('keeps acting normally while the plane is reachable and not engaged', async () => {
    const kill = await killPlane();
    const guard = await guardrail(kill.url);
    const result = await (await guard.call()).json();
    expect(result.decision).not.toBe('deny');
    expect(result).not.toHaveProperty('reason', 'KILL_SWITCH_UNAVAILABLE');
  });

  it('exposes no configured value through the seam responses', async () => {
    const kill = await killPlane();
    const guard = await guardrail(kill.url);
    const text = JSON.stringify(await (await guard.call()).json());
    expect(text).not.toContain(READ_TOKEN);
    expect(text).not.toContain(OWNER_TOKEN);
  });
});
