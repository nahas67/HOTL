import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// Only run as the proxy administrator. Output is a secret file, never stdout or committed source.
const url = process.env.LITELLM_URL ?? 'http://127.0.0.1:4000';
const master = process.env.LITELLM_MASTER_KEY;
const output = process.env.LITELLM_KEYS_OUTPUT;
if (!master || master.length < 32 || !output) throw new Error('Set a strong LITELLM_MASTER_KEY and LITELLM_KEYS_OUTPUT secret file path');
const target = new URL(url);
if (target.protocol !== 'https:' && !['127.0.0.1','localhost'].includes(target.hostname)) throw new Error('Remote LiteLLM administration requires HTTPS');
const agentBudgets = [
  { agent: 'master_orchestrator', max_budget: 2, rpm_limit: 5, tpm_limit: 12000 },
  { agent: 'sourcing_agent', max_budget: 2, rpm_limit: 10, tpm_limit: 15000 },
  { agent: 'marketing_agent', max_budget: 2, rpm_limit: 10, tpm_limit: 15000 },
  { agent: 'order_agent', max_budget: 1, rpm_limit: 5, tpm_limit: 8000 },
  { agent: 'support_agent', max_budget: 2, rpm_limit: 10, tpm_limit: 15000 },
];
const keys = {};
const issued = [];
try {
  for (const { agent, ...limits } of agentBudgets) {
    const response = await fetch(new URL('/key/generate', target), {
      method: 'POST', headers: { authorization: `Bearer ${master}`, 'content-type': 'application/json' },
      body: JSON.stringify({ key_alias: `hotl-${agent}`, models: ['runtime-fast'], budget_duration: '1d', duration: '30d', ...limits, metadata: { hotl_agent_id: agent } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Key provisioning failed for ${agent}: HTTP ${response.status}`);
    const result = await response.json();
    if (typeof result.key !== 'string' || !result.key.startsWith('sk-')) throw new Error(`Proxy returned no usable key for ${agent}`);
    keys[agent] = result.key;
    issued.push(result.key);
  }
  const path = resolve(output);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify({ issuedAt: new Date().toISOString(), keys }, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  process.stdout.write(`Provisioned ${issued.length} scoped keys. Secret file written; no keys printed.\n`);
} catch (error) {
  if (issued.length) {
    const rollback = await fetch(new URL('/key/delete', target), { method: 'POST', headers: { authorization: `Bearer ${master}`, 'content-type': 'application/json' }, body: JSON.stringify({ keys: issued }), signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!rollback?.ok) process.stderr.write('Automatic rollback failed. Revoke keys with hotl- aliases in the LiteLLM administrator console.\n');
  }
  throw error;
}
