import { resolve } from 'node:path';
import { createKillSwitch, ACTION_NAMES, type Hook } from './server.js';

// Rule 3 / rule 7: the emergency plane fails closed. An unset `HOTL_MODE` must not inherit
// `simulation`, because simulation mode authenticates with the owner token, read token and
// reauthentication password published in this repository's `.env.example`. An operator who
// omitted one variable would otherwise start a write-capable emergency control with public
// credentials and a bypassed reauthentication flow. Simulation is now an explicit opt-in.
const mode = process.env.HOTL_MODE;
if (mode !== 'simulation' && mode !== 'live') {
  throw new Error(
    'HOTL_MODE must be set explicitly to "live" (deployed emergency plane) or "simulation" '
    + '(local demo only). Refusing to start with an implicit mode. Check docs/kill-switch-runbook.md.',
  );
}
const simulation = mode === 'simulation';
const hooks: Partial<Record<typeof ACTION_NAMES[number], Hook>> = {};
for (const action of ACTION_NAMES) {
  const prefix = `KILL_HOOK_${action.toUpperCase()}`;
  const url = process.env[`${prefix}_URL`];
  const token = process.env[`${prefix}_TOKEN`];
  if (url && token) hooks[action] = { url, token };
  else if (url || token) throw new Error(`Both ${prefix}_URL and ${prefix}_TOKEN are required`);
}
const killSwitch = await createKillSwitch({
  auth: {
    mode: simulation ? 'simulation' : 'live',
    ownerToken: process.env.KILL_SWITCH_OWNER_TOKEN ?? (simulation ? 'hotl-demo-kill-owner-token' : ''),
    readToken: process.env.KILL_SWITCH_READ_TOKEN ?? (simulation ? 'hotl-demo-kill-read-token' : ''),
    demoPassword: process.env.KILL_SWITCH_DEMO_PASSWORD ?? (simulation ? 'confirm-local-stop' : ''),
    proofSecret: process.env.KILL_SWITCH_REAUTH_SECRET ?? '',
    supabaseUrl: process.env.KILL_SWITCH_SUPABASE_URL,
    ownerIds: (process.env.KILL_SWITCH_OWNER_IDS ?? '').split(',').filter(Boolean),
  },
  journalPath: resolve(process.env.KILL_SWITCH_JOURNAL ?? 'data/events.jsonl'),
  allowInitialize: simulation || process.env.KILL_SWITCH_ALLOW_INITIALIZE === 'true',
  hooks,
});
const port = Number(process.env.KILL_SWITCH_PORT ?? 4200);
const host = process.env.KILL_SWITCH_HOST ?? '127.0.0.1';
killSwitch.server.listen(port, host, () => process.stdout.write(`Independent kill switch (${mode}) listening on http://${host}:${port}\n`));
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void killSwitch.close().then(() => process.exit(0)); });
