import { afterEach, expect, it, vi } from 'vitest';
import { draftWithLiteLLM, type AgentId } from '../src/client.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('never substitutes the proxy administrator key for a runtime virtual key', async () => {
  vi.stubEnv('HOTL_MODE', 'live');
  vi.stubEnv('LITELLM_BASE_URL', 'http://127.0.0.1:4000/v1');
  vi.stubEnv('LITELLM_MASTER_KEY', 'proxy-administrator-test');
  vi.stubEnv('LITELLM_ORCHESTRATOR_KEY', '');
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(draftWithLiteLLM('master_orchestrator', 'Draft only')).rejects.toThrow('scoped virtual key missing');
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ['master_orchestrator', 'ORCHESTRATOR'], ['sourcing_agent', 'SOURCING'],
  ['marketing_agent', 'MARKETING'], ['order_agent', 'ORDER'], ['support_agent', 'SUPPORT'],
])('routes %s through its own virtual key and the provisioned model alias', async (agent, keyName) => {
  vi.stubEnv('HOTL_MODE', 'live');
  vi.stubEnv('LITELLM_BASE_URL', 'http://127.0.0.1:4000/v1');
  vi.stubEnv('LITELLM_MODEL_ALIAS', undefined);
  vi.stubEnv('LITELLM_MASTER_KEY', 'proxy-administrator-test');
  vi.stubEnv(`LITELLM_${keyName}_KEY`, `scoped-${keyName}`);
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Draft proposal' } }] }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  expect(await draftWithLiteLLM(agent as AgentId, 'Review a product')).toBe('Draft proposal');
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('http://127.0.0.1:4000/v1/chat/completions');
  expect(options.headers.Authorization).toBe(`Bearer scoped-${keyName}`);
  expect(JSON.parse(options.body).model).toBe('runtime-fast');
  expect(JSON.stringify(fetch.mock.calls)).not.toContain('proxy-administrator-test');
});

it('simulation drafts make no paid model request', async () => {
  vi.stubEnv('HOTL_MODE', 'simulation');
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(await draftWithLiteLLM('sourcing_agent', 'Review a product')).toMatch(/^Simulation draft:/);
  expect(fetch).not.toHaveBeenCalled();
});
